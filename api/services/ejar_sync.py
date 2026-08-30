"""
Ejar contract sync (مزامنة عقود إيجار)
======================================
Given a list of contracts fetched from the Ejar platform
(:class:`~api.services.ejar.EjarContractSummary`), this module reconstructs the
owner → building → unit → tenant → contract chain inside the portal database.

The operation is **idempotent**: contracts are matched by their
``ejar_contract_number`` so re-running a sync updates existing rows instead of
creating duplicates. Related owners, buildings, units and tenants are matched
by their natural keys (national id, deed number, unit number, etc.) and created
on demand when missing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.contract_totals import compute_contract_totals
from api.models import (
    Building,
    Contract,
    ManagementContract,
    ManagementContractProperty,
    Owner,
    Tenant,
    Unit,
)
from api.services.ejar import EjarContractSummary, EjarManagementContractSummary

_UNASSIGNED_OWNER_NAME = "غير محدد"  # "Unspecified" — fallback owner


@dataclass
class EjarSyncResult:
    fetched: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    owners_created: int = 0
    buildings_created: int = 0
    units_created: int = 0
    tenants_created: int = 0
    errors: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "fetched": self.fetched,
            "created": self.created,
            "updated": self.updated,
            "skipped": self.skipped,
            "owners_created": self.owners_created,
            "buildings_created": self.buildings_created,
            "units_created": self.units_created,
            "tenants_created": self.tenants_created,
            "errors": self.errors,
        }


def _parse_date(value: str) -> date | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _normalize_payment_cycle(months: int) -> int:
    """Coerce to one of the supported cycles (1, 3, 6, 12 months)."""
    allowed = (1, 3, 6, 12)
    if months in allowed:
        return months
    # pick the closest supported cycle
    return min(allowed, key=lambda a: abs(a - (months or 1)))


def _map_status(ejar_status: str) -> str:
    """Map an Ejar status to our contract status vocabulary."""
    s = (ejar_status or "").lower()
    if s in {"cancelled", "canceled", "terminated"}:
        return "terminated"
    if s in {"expired", "ended", "closed"}:
        return "expired"
    return "active"


def _get_or_create_owner(db: Session, summary: EjarContractSummary, result: EjarSyncResult) -> Owner:
    name = (summary.landlord_name or "").strip()
    nid = (summary.landlord_national_id or "").strip()

    owner: Owner | None = None
    if nid:
        owner = db.scalar(select(Owner).where(Owner.national_id == nid))
    if owner is None and name:
        owner = db.scalar(select(Owner).where(Owner.name == name))
    if owner is not None:
        return owner

    owner = Owner(
        owner_type="individual",
        name=name or _UNASSIGNED_OWNER_NAME,
        name_ar=name or _UNASSIGNED_OWNER_NAME,
        national_id=nid or None,
        notes="تم الإنشاء تلقائيًا من مزامنة إيجار",
    )
    db.add(owner)
    db.flush()
    result.owners_created += 1
    return owner


def _get_or_create_building(
    db: Session, owner: Owner, summary: EjarContractSummary, result: EjarSyncResult
) -> Building:
    deed = (summary.building_deed_number or "").strip()
    name = (summary.building_name or "").strip() or f"عقار {deed or summary.ejar_contract_number}"

    building: Building | None = None
    if deed:
        building = db.scalar(select(Building).where(Building.deed_number == deed))
    if building is None:
        building = db.scalar(
            select(Building).where(Building.owner_id == owner.id, Building.name == name)
        )
    if building is not None:
        return building

    building = Building(
        owner_id=owner.id,
        name=name,
        name_ar=name,
        deed_number=deed or None,
        city=summary.city or None,
        district=summary.district or None,
        property_type=summary.property_type or None,
        contract_type=summary.contract_type or None,
        notes="تم الإنشاء تلقائيًا من مزامنة إيجار",
    )
    db.add(building)
    db.flush()
    result.buildings_created += 1
    return building


def _get_or_create_unit(
    db: Session, building: Building, summary: EjarContractSummary, result: EjarSyncResult
) -> Unit:
    number = (summary.unit_number or "").strip() or summary.ejar_contract_number
    unit = db.scalar(
        select(Unit).where(Unit.building_id == building.id, Unit.number == number)
    )
    if unit is not None:
        return unit

    unit = Unit(
        building_id=building.id,
        name=f"وحدة {number}",
        name_ar=f"وحدة {number}",
        number=number,
        unit_type=summary.property_type or None,
        is_available=True,
        notes="تم الإنشاء تلقائيًا من مزامنة إيجار",
    )
    db.add(unit)
    db.flush()
    result.units_created += 1
    return unit


def _get_or_create_tenant(
    db: Session, summary: EjarContractSummary, result: EjarSyncResult
) -> Tenant:
    name = (summary.tenant_name or "").strip()
    nid = (summary.tenant_national_id or "").strip()
    phone = (summary.tenant_phone or "").strip()

    tenant: Tenant | None = None
    if nid:
        tenant = db.scalar(select(Tenant).where(Tenant.national_id == nid))
    if tenant is None and name and phone:
        tenant = db.scalar(
            select(Tenant).where(Tenant.name == name, Tenant.phone == phone)
        )
    if tenant is not None:
        return tenant

    tenant = Tenant(
        tenant_type="individual",
        name=name or "مستأجر",
        name_ar=name or "مستأجر",
        phone=phone or "—",
        national_id=nid or "—",
        notes="تم الإنشاء تلقائيًا من مزامنة إيجار",
    )
    db.add(tenant)
    db.flush()
    result.tenants_created += 1
    return tenant


def sync_contracts(db: Session, summaries: list[EjarContractSummary]) -> EjarSyncResult:
    """Upsert all Ejar contracts into the portal. Returns a summary of changes."""
    result = EjarSyncResult(fetched=len(summaries))

    for summary in summaries:
        ejar_number = (summary.ejar_contract_number or "").strip()
        if not ejar_number:
            result.skipped += 1
            result.errors.append("Contract without an Ejar number was skipped")
            continue

        start = _parse_date(summary.start_date)
        end = _parse_date(summary.end_date)
        if start is None or end is None or end <= start:
            result.skipped += 1
            result.errors.append(f"{ejar_number}: invalid start/end dates")
            continue

        try:
            owner = _get_or_create_owner(db, summary, result)
            building = _get_or_create_building(db, owner, summary, result)
            unit = _get_or_create_unit(db, building, summary, result)
            tenant = _get_or_create_tenant(db, summary, result)
        except Exception as exc:  # noqa: BLE001
            result.skipped += 1
            result.errors.append(f"{ejar_number}: {exc}")
            continue

        cycle = _normalize_payment_cycle(summary.payment_cycle)
        months = max((end.year - start.year) * 12 + (end.month - start.month), 1)
        rent_amount = round((summary.total_rent_amount or 0) / months, 2) if months else (
            summary.total_rent_amount or 0
        )
        if rent_amount <= 0:
            rent_amount = summary.total_rent_amount or 1
        status = _map_status(summary.status)
        rate, vat_amount, total_amount = compute_contract_totals(
            total_rent_amount=summary.total_rent_amount,
            insurance_amount=0,
            electricity_amount=0,
            water_amount=0,
            vat_rate=15,
        )

        existing = db.scalar(
            select(Contract).where(Contract.ejar_contract_number == ejar_number)
        )
        if existing is not None:
            existing.status = status
            existing.start_date = start
            existing.end_date = end
            existing.total_rent_amount = summary.total_rent_amount or existing.total_rent_amount
            existing.contract_type = summary.contract_type or existing.contract_type
            existing.ejar_status = summary.status or "active"
            existing.ejar_reference = summary.ejar_reference or existing.ejar_reference
            existing.ejar_registered_at = existing.ejar_registered_at or datetime.utcnow()
            existing.ejar_response_data = summary.raw
            db.flush()
            result.updated += 1
            continue

        contract = Contract(
            unit_id=unit.id,
            tenant_id=tenant.id,
            contract_number=ejar_number,
            contract_type=summary.contract_type or "residential",
            start_date=start,
            end_date=end,
            duration_years=max(months // 12, 0),
            duration_months=months % 12,
            duration_days=0,
            total_rent_amount=summary.total_rent_amount or 0,
            rent_amount=rent_amount,
            ejar_contract_number=ejar_number,
            payment_cycle=cycle,
            payment_count=max(months // cycle, 1),
            vat_rate=rate,
            vat_amount=vat_amount,
            total_amount=total_amount,
            status=status,
            ejar_status=summary.status or "active",
            ejar_reference=summary.ejar_reference or None,
            ejar_registered_at=datetime.utcnow(),
            ejar_response_data=summary.raw,
            notes="تم الاستيراد من منصة إيجار",
        )
        db.add(contract)
        if status == "active":
            unit.is_available = False
        db.flush()
        result.created += 1

    db.commit()
    return result


# ══════════════════════════════════════════════════════════════════════════════
# Property management contracts (عقود إدارة الأملاك)
# ══════════════════════════════════════════════════════════════════════════════


@dataclass
class ManagementSyncResult:
    fetched: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    owners_created: int = 0
    buildings_linked: int = 0
    errors: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "fetched": self.fetched,
            "created": self.created,
            "updated": self.updated,
            "skipped": self.skipped,
            "owners_created": self.owners_created,
            "buildings_linked": self.buildings_linked,
            "errors": self.errors,
        }


def _map_management_status(ejar_status: str) -> str:
    s = (ejar_status or "").lower()
    if s in {"cancelled", "canceled", "terminated"}:
        return "terminated"
    if s in {"expired", "ended", "closed"}:
        return "expired"
    if s in {"pending", "draft"}:
        return "draft"
    return "active"


def _owner_for_management(
    db: Session, summary: EjarManagementContractSummary, result: ManagementSyncResult
) -> Owner:
    name = (summary.owner_name or "").strip()
    nid = (summary.owner_id_number or "").strip()

    owner: Owner | None = None
    if nid:
        owner = db.scalar(select(Owner).where(Owner.national_id == nid))
        if owner is None:
            owner = db.scalar(select(Owner).where(Owner.cr_number == nid))
    if owner is None and name:
        owner = db.scalar(select(Owner).where(Owner.name == name))
    if owner is not None:
        return owner

    is_org = summary.owner_id_type in {"cr", "endowment"}
    owner = Owner(
        owner_type="company" if is_org else "individual",
        name=name or _UNASSIGNED_OWNER_NAME,
        name_ar=name or _UNASSIGNED_OWNER_NAME,
        national_id=None if is_org else (nid or None),
        cr_number=nid if is_org else None,
        id_type=summary.owner_id_type or "national_id",
        phone=summary.owner_phone or None,
        absher_phone=summary.owner_phone or None,
        notes="تم الإنشاء تلقائيًا من مزامنة إيجار",
    )
    db.add(owner)
    db.flush()
    result.owners_created += 1
    return owner


def _link_portfolio(
    db: Session,
    contract: ManagementContract,
    summary: EjarManagementContractSummary,
    result: ManagementSyncResult,
) -> None:
    """Attach the buildings Ejar lists on the contract, matched by deed number.

    Buildings are matched, never created: a management contract describes
    properties the portal should already know about, and inventing a building
    from a deed number alone would produce an unusable stub record.
    """
    existing = {(p.building_id, p.unit_id) for p in contract.properties}
    for entry in summary.properties or []:
        deed = str(entry.get("deedNumber") or "").strip()
        if not deed:
            continue
        building = db.scalar(select(Building).where(Building.deed_number == deed))
        if building is None:
            result.errors.append(
                f"{summary.ejar_contract_number}: no building with deed {deed} — skipped"
            )
            continue

        unit_id = None
        unit_number = entry.get("unitNumber")
        if unit_number:
            unit = db.scalar(
                select(Unit).where(
                    Unit.building_id == building.id, Unit.number == str(unit_number)
                )
            )
            unit_id = unit.id if unit else None

        if (building.id, unit_id) in existing:
            continue
        contract.properties.append(
            ManagementContractProperty(building_id=building.id, unit_id=unit_id)
        )
        existing.add((building.id, unit_id))
        result.buildings_linked += 1


def sync_management_contracts(
    db: Session, summaries: list[EjarManagementContractSummary]
) -> ManagementSyncResult:
    """Upsert Ejar management contracts into the portal."""
    result = ManagementSyncResult(fetched=len(summaries))

    for summary in summaries:
        ejar_number = (summary.ejar_contract_number or "").strip()
        if not ejar_number:
            result.skipped += 1
            result.errors.append("Management contract without an Ejar number was skipped")
            continue

        start = _parse_date(summary.start_date)
        end = _parse_date(summary.end_date)
        if start is None or end is None or end <= start:
            result.skipped += 1
            result.errors.append(f"{ejar_number}: invalid start/end dates")
            continue

        try:
            owner = _owner_for_management(db, summary, result)
        except Exception as exc:  # noqa: BLE001
            result.skipped += 1
            result.errors.append(f"{ejar_number}: {exc}")
            continue

        months = max((end.year - start.year) * 12 + (end.month - start.month), 1)
        status = _map_management_status(summary.status)

        contract = db.scalar(
            select(ManagementContract).where(
                ManagementContract.ejar_contract_number == ejar_number
            )
        )
        is_new = contract is None
        if contract is None:
            contract = ManagementContract(
                owner_id=owner.id,
                contract_number=ejar_number,
                ejar_contract_number=ejar_number,
                start_date=start,
                end_date=end,
                notes="تم الاستيراد من منصة إيجار",
            )
            db.add(contract)
            db.flush()

        contract.owner_id = owner.id
        contract.start_date = start
        contract.end_date = end
        contract.duration_months = months
        contract.fee_type = summary.fee_type or "percentage"
        contract.fee_percentage = summary.fee_percentage or 0
        contract.fee_fixed_amount = summary.fee_fixed_amount or 0
        contract.can_sign_leases = bool(summary.can_sign_leases)
        contract.can_collect_rent = bool(summary.can_collect_rent)
        contract.status = status
        contract.ejar_status = (summary.status or "active").lower()
        contract.ejar_reference = summary.ejar_reference or contract.ejar_reference
        contract.ejar_registered_at = contract.ejar_registered_at or datetime.utcnow()
        contract.ejar_response_data = summary.raw

        _link_portfolio(db, contract, summary, result)
        db.flush()

        if is_new:
            result.created += 1
        else:
            result.updated += 1

    db.commit()
    return result
