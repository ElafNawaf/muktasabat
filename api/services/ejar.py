"""
Ejar Integration Service (خدمة تكامل منصة إيجار)
==================================================
Handles all communication with the Saudi Ejar rental platform API.

STUB MODE (default / development)
----------------------------------
When ``EJAR_CLIENT_ID`` is not set, or ``EJAR_STUB_MODE=true``, every call
is simulated locally — no real HTTP request is made.  The stub returns
realistic response shapes so the rest of the system can be developed and
tested without waiting for REGA API approval.

LIVE MODE (production)
-----------------------
Set the following environment variables:

    EJAR_CLIENT_ID=<your-client-id>       # from REGA developer portal
    EJAR_CLIENT_SECRET=<your-secret>
    EJAR_BASE_URL=https://api.ejar.sa
    EJAR_STUB_MODE=false

Authentication uses OAuth 2.0 client-credentials (Bearer token).  The
service automatically refreshes the token when it expires.

Known Ejar API endpoints (subject to change once official docs are released):
    POST /auth/token                 — obtain access token
    POST /contracts/register         — register a new rental contract
    POST /contracts/{ref}/cancel     — cancel a registered contract
    GET  /contracts/{ref}/status     — check registration status
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Optional

import httpx

from api.config import get_settings

logger = logging.getLogger(__name__)

# ── Data transfer objects ──────────────────────────────────────────────────────


@dataclass
class EjarContractPayload:
    """Fields sent to the Ejar API when registering a contract."""

    # Landlord / owner
    landlord_national_id: str          # هوية المالك
    landlord_name: str

    # Tenant
    tenant_national_id: str            # هوية المستأجر
    tenant_name: str
    tenant_phone: str

    # Property
    property_type: str                 # نوع العقار
    building_deed_number: str          # رقم الصك
    unit_number: str                   # رقم الوحدة
    city: str
    district: str

    # Contract terms
    contract_type: str                 # "residential" | "commercial"
    start_date: str                    # ISO 8601 "YYYY-MM-DD"
    end_date: str
    total_rent_amount: float           # اجمالي قيمة الإيجار لكل المدة
    payment_cycle: int                 # interval in months

    # Optional
    ejar_contract_number: Optional[str] = None  # pre-existing Ejar ref if any
    notes: Optional[str] = None


@dataclass
class EjarRegistrationResult:
    """Normalised result from Ejar after contract registration."""

    success: bool
    ejar_contract_number: str          # the number assigned by Ejar
    ejar_reference: str                # internal Ejar reference / UUID
    registered_at: datetime
    raw: dict = field(default_factory=dict)
    error_code: Optional[str] = None
    error_message: Optional[str] = None


@dataclass
class EjarStatusResult:
    """Current status of a contract on the Ejar platform."""

    ejar_reference: str
    status: str                        # "active" | "cancelled" | "expired" | "pending"
    raw: dict = field(default_factory=dict)


@dataclass
class EjarContractSummary:
    """A contract as returned by Ejar when listing all contracts of the account.

    This carries enough information to (re)build the full owner → building →
    unit → tenant → contract chain inside the portal during a sync/import.
    """

    ejar_contract_number: str          # رقم عقد إيجار
    ejar_reference: str                # internal Ejar reference / UUID
    status: str                        # "active" | "expired" | "cancelled" | "pending"
    contract_type: str                 # "residential" | "commercial"
    start_date: str                    # ISO 8601 "YYYY-MM-DD"
    end_date: str
    total_rent_amount: float           # اجمالي قيمة الإيجار لكل المدة
    payment_cycle: int                 # interval in months between payments

    # Landlord / owner (المالك)
    landlord_national_id: str
    landlord_name: str

    # Tenant (المستأجر)
    tenant_national_id: str
    tenant_name: str
    tenant_phone: str

    # Property (العقار)
    building_name: str
    building_deed_number: str
    unit_number: str
    city: str
    district: str
    property_type: str

    raw: dict = field(default_factory=dict)


# ── Token cache (simple in-process cache) ─────────────────────────────────────


class _TokenCache:
    def __init__(self) -> None:
        self._token: Optional[str] = None
        self._expires_at: datetime = datetime.min

    def is_valid(self) -> bool:
        return self._token is not None and datetime.utcnow() < self._expires_at

    def set(self, token: str, expires_in_seconds: int) -> None:
        self._token = token
        # refresh 60 s before actual expiry to be safe
        self._expires_at = datetime.utcnow() + timedelta(seconds=expires_in_seconds - 60)

    @property
    def token(self) -> Optional[str]:
        return self._token


_token_cache = _TokenCache()


# ── Ejar service ───────────────────────────────────────────────────────────────


class EjarService:
    """
    Stateless service for Ejar API operations.

    Usage::

        service = EjarService()

        # Register a new contract
        result = await service.register_contract(payload)
        if result.success:
            contract.ejar_contract_number = result.ejar_contract_number

        # Cancel a contract
        ok = await service.cancel_contract(ejar_reference="abc-123")

        # Check status
        status = await service.get_status(ejar_reference="abc-123")
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._base_url = settings.ejar_base_url.rstrip("/")
        self._client_id = settings.ejar_client_id
        self._client_secret = settings.ejar_client_secret
        # stub mode is forced when credentials are missing
        self._stub = settings.ejar_stub_mode or not self._client_id

        if self._stub:
            logger.info("EjarService: running in STUB mode — no real API calls will be made")

    # ── Public API ─────────────────────────────────────────────────────────────

    async def register_contract(
        self, payload: EjarContractPayload
    ) -> EjarRegistrationResult:
        """Register a new rental contract on the Ejar platform."""
        if self._stub:
            return self._stub_register(payload)
        token = await self._get_token()
        return await self._live_register(payload, token)

    async def cancel_contract(self, ejar_reference: str) -> bool:
        """Cancel a registered contract.  Returns True on success."""
        if self._stub:
            logger.info("EjarService STUB: cancel_contract(%s)", ejar_reference)
            return True
        token = await self._get_token()
        return await self._live_cancel(ejar_reference, token)

    async def get_status(self, ejar_reference: str) -> EjarStatusResult:
        """Fetch the current status of a contract from Ejar."""
        if self._stub:
            return EjarStatusResult(
                ejar_reference=ejar_reference,
                status="active",
                raw={"stub": True},
            )
        token = await self._get_token()
        return await self._live_status(ejar_reference, token)

    async def list_contracts(self) -> list[EjarContractSummary]:
        """Fetch every contract registered for the account on the Ejar platform.

        In STUB mode a small set of realistic sample contracts is returned so
        the sync flow can be developed and demoed without REGA credentials.
        In LIVE mode all pages of ``GET /contracts`` are fetched and merged.
        """
        if self._stub:
            return self._stub_list_contracts()
        token = await self._get_token()
        return await self._live_list_contracts(token)

    @property
    def is_stub(self) -> bool:
        return self._stub

    # ── Stub implementations ───────────────────────────────────────────────────

    def _stub_register(self, payload: EjarContractPayload) -> EjarRegistrationResult:
        """Simulate a successful Ejar registration."""
        fake_ref = f"STUB-{uuid.uuid4().hex[:8].upper()}"
        fake_contract_num = payload.ejar_contract_number or f"EJR-{uuid.uuid4().hex[:10].upper()}"
        logger.info(
            "EjarService STUB: register_contract → %s / %s",
            fake_contract_num,
            fake_ref,
        )
        return EjarRegistrationResult(
            success=True,
            ejar_contract_number=fake_contract_num,
            ejar_reference=fake_ref,
            registered_at=datetime.utcnow(),
            raw={
                "stub": True,
                "ejarContractNumber": fake_contract_num,
                "reference": fake_ref,
                "status": "registered",
            },
        )

    def _stub_list_contracts(self) -> list[EjarContractSummary]:
        """Return a deterministic set of sample Ejar contracts for development."""
        logger.info("EjarService STUB: list_contracts → returning sample contracts")
        samples = [
            EjarContractSummary(
                ejar_contract_number="EJR-1001STUB",
                ejar_reference="STUB-REF-1001",
                status="active",
                contract_type="residential",
                start_date="2025-01-01",
                end_date="2026-01-01",
                total_rent_amount=48000.0,
                payment_cycle=3,
                landlord_national_id="1010101010",
                landlord_name="عبدالله المالك",
                tenant_national_id="2020202020",
                tenant_name="سعد المستأجر",
                tenant_phone="0500000001",
                building_name="عمارة النخيل",
                building_deed_number="DEED-9001",
                unit_number="101",
                city="الرياض",
                district="النخيل",
                property_type="residential",
                raw={"stub": True},
            ),
            EjarContractSummary(
                ejar_contract_number="EJR-1002STUB",
                ejar_reference="STUB-REF-1002",
                status="active",
                contract_type="commercial",
                start_date="2025-03-15",
                end_date="2027-03-15",
                total_rent_amount=120000.0,
                payment_cycle=12,
                landlord_national_id="1010101010",
                landlord_name="عبدالله المالك",
                tenant_national_id="3030303030",
                tenant_name="شركة المتاجر التجارية",
                tenant_phone="0500000002",
                building_name="عمارة النخيل",
                building_deed_number="DEED-9001",
                unit_number="G-02",
                city="الرياض",
                district="النخيل",
                property_type="commercial",
                raw={"stub": True},
            ),
            EjarContractSummary(
                ejar_contract_number="EJR-1003STUB",
                ejar_reference="STUB-REF-1003",
                status="expired",
                contract_type="residential",
                start_date="2023-06-01",
                end_date="2024-06-01",
                total_rent_amount=36000.0,
                payment_cycle=6,
                landlord_national_id="4040404040",
                landlord_name="فهد العقاري",
                tenant_national_id="5050505050",
                tenant_name="نورة المستأجرة",
                tenant_phone="0500000003",
                building_name="برج الياسمين",
                building_deed_number="DEED-9002",
                unit_number="205",
                city="جدة",
                district="الياسمين",
                property_type="residential",
                raw={"stub": True},
            ),
        ]
        return samples

    # ── Live implementations ───────────────────────────────────────────────────

    async def _get_token(self) -> str:
        """Return a valid Bearer token, refreshing if necessary."""
        if _token_cache.is_valid():
            return _token_cache.token  # type: ignore[return-value]

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{self._base_url}/auth/token",
                json={
                    "clientId": self._client_id,
                    "clientSecret": self._client_secret,
                    "grantType": "client_credentials",
                },
            )
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        token: str = data["accessToken"]
        expires_in: int = data.get("expiresIn", 3600)
        _token_cache.set(token, expires_in)
        return token

    async def _live_register(
        self, payload: EjarContractPayload, token: str
    ) -> EjarRegistrationResult:
        body = {
            "landlordNationalId": payload.landlord_national_id,
            "landlordName": payload.landlord_name,
            "tenantNationalId": payload.tenant_national_id,
            "tenantName": payload.tenant_name,
            "tenantPhone": payload.tenant_phone,
            "propertyType": payload.property_type,
            "deedNumber": payload.building_deed_number,
            "unitNumber": payload.unit_number,
            "city": payload.city,
            "district": payload.district,
            "contractType": payload.contract_type,
            "startDate": payload.start_date,
            "endDate": payload.end_date,
            "totalRentAmount": payload.total_rent_amount,
            "paymentCycle": payload.payment_cycle,
            "notes": payload.notes,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self._base_url}/contracts/register",
                json=body,
                headers={"Authorization": f"Bearer {token}"},
            )

        data: dict[str, Any] = resp.json()

        if not resp.is_success:
            logger.error("Ejar register failed %s: %s", resp.status_code, data)
            return EjarRegistrationResult(
                success=False,
                ejar_contract_number="",
                ejar_reference="",
                registered_at=datetime.utcnow(),
                raw=data,
                error_code=str(resp.status_code),
                error_message=data.get("message", "Unknown Ejar error"),
            )

        return EjarRegistrationResult(
            success=True,
            ejar_contract_number=data["ejarContractNumber"],
            ejar_reference=data["reference"],
            registered_at=datetime.utcnow(),
            raw=data,
        )

    async def _live_cancel(self, ejar_reference: str, token: str) -> bool:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{self._base_url}/contracts/{ejar_reference}/cancel",
                headers={"Authorization": f"Bearer {token}"},
            )
        if not resp.is_success:
            logger.error("Ejar cancel failed %s: %s", resp.status_code, resp.text)
        return resp.is_success

    async def _live_status(self, ejar_reference: str, token: str) -> EjarStatusResult:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{self._base_url}/contracts/{ejar_reference}/status",
                headers={"Authorization": f"Bearer {token}"},
            )
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        return EjarStatusResult(
            ejar_reference=ejar_reference,
            status=data.get("status", "unknown"),
            raw=data,
        )

    async def _live_list_contracts(self, token: str) -> list[EjarContractSummary]:
        """Fetch all contracts from Ejar, following pagination until exhausted."""
        results: list[EjarContractSummary] = []
        page = 1
        page_size = 100
        async with httpx.AsyncClient(timeout=30) as client:
            while True:
                resp = await client.get(
                    f"{self._base_url}/contracts",
                    params={"page": page, "pageSize": page_size},
                    headers={"Authorization": f"Bearer {token}"},
                )
                resp.raise_for_status()
                data: dict[str, Any] = resp.json()
                items = data.get("items") or data.get("data") or data.get("contracts") or []
                for item in items:
                    try:
                        results.append(self._normalize_contract(item))
                    except Exception:  # noqa: BLE001 — never let one bad row abort the sync
                        logger.exception("Ejar: failed to normalize contract %s", item.get("id"))
                # Stop when there are no more pages / items
                has_more = data.get("hasMore")
                if has_more is None:
                    has_more = len(items) == page_size
                if not items or not has_more:
                    break
                page += 1
        return results

    @staticmethod
    def _normalize_contract(item: dict[str, Any]) -> EjarContractSummary:
        """Map a raw Ejar contract object to our normalized summary.

        Ejar field names are not finalized in public docs, so we accept several
        common aliases and fall back to empty values rather than failing.
        """

        def pick(*keys: str, default: Any = "") -> Any:
            for k in keys:
                if k in item and item[k] not in (None, ""):
                    return item[k]
            return default

        prop = item.get("property") or item.get("unit") or {}
        landlord = item.get("landlord") or item.get("owner") or {}
        tenant = item.get("tenant") or {}

        def from_obj(obj: dict[str, Any], *keys: str, default: Any = "") -> Any:
            for k in keys:
                if isinstance(obj, dict) and obj.get(k) not in (None, ""):
                    return obj[k]
            return default

        return EjarContractSummary(
            ejar_contract_number=str(pick("ejarContractNumber", "contractNumber", "number")),
            ejar_reference=str(pick("reference", "id", "uuid")),
            status=str(pick("status", default="active")).lower(),
            contract_type=str(pick("contractType", "type", default="residential")).lower(),
            start_date=str(pick("startDate", "start", default="")),
            end_date=str(pick("endDate", "end", default="")),
            total_rent_amount=float(pick("totalRentAmount", "totalAmount", "rentAmount", default=0) or 0),
            payment_cycle=int(pick("paymentCycle", "paymentIntervalMonths", default=1) or 1),
            landlord_national_id=str(
                from_obj(landlord, "nationalId", "id") or pick("landlordNationalId")
            ),
            landlord_name=str(from_obj(landlord, "name") or pick("landlordName")),
            tenant_national_id=str(
                from_obj(tenant, "nationalId", "id") or pick("tenantNationalId")
            ),
            tenant_name=str(from_obj(tenant, "name") or pick("tenantName")),
            tenant_phone=str(from_obj(tenant, "phone", "mobile") or pick("tenantPhone")),
            building_name=str(
                from_obj(prop, "buildingName", "name") or pick("buildingName", default="")
            ),
            building_deed_number=str(
                from_obj(prop, "deedNumber") or pick("deedNumber", default="")
            ),
            unit_number=str(from_obj(prop, "unitNumber", "unit") or pick("unitNumber", default="")),
            city=str(from_obj(prop, "city") or pick("city", default="")),
            district=str(from_obj(prop, "district") or pick("district", default="")),
            property_type=str(
                from_obj(prop, "propertyType", "type") or pick("propertyType", default="residential")
            ).lower(),
            raw=item,
        )


# ── Singleton accessor ────────────────────────────────────────────────────────

_service: Optional[EjarService] = None


def get_ejar_service() -> EjarService:
    """Return the singleton EjarService (lazy init)."""
    global _service
    if _service is None:
        _service = EjarService()
    return _service
