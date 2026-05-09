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


# ── Singleton accessor ────────────────────────────────────────────────────────

_service: Optional[EjarService] = None


def get_ejar_service() -> EjarService:
    """Return the singleton EjarService (lazy init)."""
    global _service
    if _service is None:
        _service = EjarService()
    return _service
