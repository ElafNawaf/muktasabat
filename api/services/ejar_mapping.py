"""Map portal records onto Ejar payloads — and check them first.

Ejar (منصة إيجار) rejects a submission outright when a required party,
property or licence field is missing, and the rejection arrives as an opaque
validation error. This module does two related jobs:

``build_*``   turn ORM rows into the dataclasses in :mod:`api.services.ejar`.
``check_*``   report, before anything is sent, exactly which fields Ejar will
              demand — in both English and Arabic, so the UI can point the user
              at the record that needs fixing.

Keeping both in one place means the checks and the payload can never drift:
every field the builder reads has a matching rule in the checker.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.models import (
    Building,
    Contract,
    ManagementCompany,
    ManagementContract,
    Owner,
    Tenant,
    Unit,
)
from api.services.ejar import (
    EjarContractPayload,
    EjarEstablishment,
    EjarManagementContractPayload,
    EjarParty,
    EjarPropertyRef,
)

# ID types that Ejar requires an expiry date for (they can lapse).
_EXPIRING_ID_TYPES = {"iqama", "passport", "visitor", "gcc_id"}
# ID types that identify an organisation rather than a person.
_ORGANISATION_ID_TYPES = {"cr", "endowment"}


# ── Readiness reporting ───────────────────────────────────────────────────────


@dataclass
class EjarIssue:
    """One thing that must be fixed before Ejar will accept the contract."""

    entity: str          # "owner" | "tenant" | "building" | "unit" | "contract" | "company"
    entity_id: Optional[int]
    field: str
    message_en: str
    message_ar: str
    severity: str = "error"   # "error" blocks submission, "warning" does not

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class _IssueCollector:
    def __init__(self) -> None:
        self.issues: list[EjarIssue] = []

    def require(
        self,
        value: Any,
        *,
        entity: str,
        entity_id: Optional[int],
        field: str,
        en: str,
        ar: str,
        severity: str = "error",
    ) -> None:
        if value is None or (isinstance(value, str) and not value.strip()):
            self.issues.append(
                EjarIssue(
                    entity=entity,
                    entity_id=entity_id,
                    field=field,
                    message_en=en,
                    message_ar=ar,
                    severity=severity,
                )
            )

    def add(self, issue: EjarIssue) -> None:
        self.issues.append(issue)


def _iso(value: Optional[date]) -> Optional[str]:
    return value.isoformat() if value else None


# ── Establishment (المنشأة العقارية) ──────────────────────────────────────────


def get_active_company(db: Session) -> Optional[ManagementCompany]:
    """Return the establishment this portal files contracts under."""
    return db.scalar(
        select(ManagementCompany)
        .where(ManagementCompany.is_active.is_(True))
        .order_by(ManagementCompany.id)
    )


def build_establishment(company: ManagementCompany) -> EjarEstablishment:
    return EjarEstablishment(
        name=company.name,
        cr_number=company.cr_number or "",
        fal_license_number=(
            company.fal_management_license_number or company.fal_license_number or ""
        ),
        fal_license_expiry=_iso(
            company.fal_management_license_expiry or company.fal_license_expiry
        ),
        vat_number=company.vat_number,
        ejar_establishment_id=company.ejar_establishment_id,
        ejar_branch_id=company.ejar_branch_id,
        representative_name=company.representative_name,
        representative_id_number=company.representative_national_id,
        phone=company.phone,
        email=company.email,
        national_address=company.national_address,
        iban=company.iban,
    )


def _check_company(collector: _IssueCollector, company: Optional[ManagementCompany]) -> None:
    if company is None:
        collector.add(
            EjarIssue(
                entity="company",
                entity_id=None,
                field="company",
                message_en=(
                    "No active establishment profile. Ejar files every contract under a "
                    "licensed real-estate establishment."
                ),
                message_ar=(
                    "لا توجد منشأة عقارية مفعّلة. تسجّل منصة إيجار كل عقد باسم منشأة عقارية مرخّصة."
                ),
            )
        )
        return

    cid = company.id
    collector.require(
        company.cr_number,
        entity="company",
        entity_id=cid,
        field="cr_number",
        en="Establishment commercial registration (CR) number is required.",
        ar="رقم السجل التجاري للمنشأة مطلوب.",
    )
    collector.require(
        company.fal_management_license_number or company.fal_license_number,
        entity="company",
        entity_id=cid,
        field="fal_license_number",
        en="A REGA (FAL) licence number is required to file contracts on Ejar.",
        ar="رقم رخصة فال من الهيئة العامة للعقار مطلوب لتسجيل العقود في إيجار.",
    )
    expiry = company.fal_management_license_expiry or company.fal_license_expiry
    if expiry and expiry < date.today():
        collector.add(
            EjarIssue(
                entity="company",
                entity_id=cid,
                field="fal_license_expiry",
                message_en=f"The FAL licence expired on {expiry.isoformat()}.",
                message_ar=f"انتهت رخصة فال بتاريخ {expiry.isoformat()}.",
            )
        )
    collector.require(
        company.representative_name,
        entity="company",
        entity_id=cid,
        field="representative_name",
        en="An authorised signatory is required for the establishment.",
        ar="اسم المفوّض بالتوقيع للمنشأة مطلوب.",
        severity="warning",
    )


# ── Parties (أطراف العقد) ─────────────────────────────────────────────────────


def build_party_from_owner(owner: Owner) -> EjarParty:
    id_number = owner.national_id or owner.cr_number or ""
    return EjarParty(
        name=owner.name,
        id_number=id_number,
        id_type=owner.id_type or "national_id",
        phone=owner.absher_phone or owner.phone,
        email=owner.email,
        nationality=owner.nationality,
        date_of_birth=_iso(owner.date_of_birth),
        id_expiry_date=_iso(owner.id_expiry_date),
        national_address=owner.national_address,
        representative_name=owner.representative_name,
        representative_id_number=owner.representative_national_id,
        ejar_party_id=owner.ejar_party_id,
    )


def build_party_from_tenant(tenant: Tenant) -> EjarParty:
    id_number = tenant.national_id or tenant.cr_number or ""
    return EjarParty(
        name=tenant.name,
        id_number=id_number,
        id_type=tenant.id_type or "national_id",
        phone=tenant.absher_phone or tenant.phone,
        email=tenant.email,
        nationality=tenant.nationality,
        date_of_birth=_iso(tenant.date_of_birth),
        id_expiry_date=_iso(tenant.id_expiry_date),
        national_address=tenant.national_address,
        representative_name=tenant.representative_name,
        representative_id_number=tenant.representative_national_id,
        ejar_party_id=tenant.ejar_party_id,
    )


def _check_party(
    collector: _IssueCollector,
    *,
    entity: str,
    entity_id: Optional[int],
    party: EjarParty,
    label_en: str,
    label_ar: str,
    is_organisation: bool,
) -> None:
    collector.require(
        party.name,
        entity=entity,
        entity_id=entity_id,
        field="name",
        en=f"{label_en} name is required.",
        ar=f"اسم {label_ar} مطلوب.",
    )
    collector.require(
        party.id_number,
        entity=entity,
        entity_id=entity_id,
        field="national_id",
        en=(
            f"{label_en} commercial registration number is required."
            if is_organisation
            else f"{label_en} ID number is required."
        ),
        ar=(
            f"رقم السجل التجاري ل{label_ar} مطلوب."
            if is_organisation
            else f"رقم هوية {label_ar} مطلوب."
        ),
    )
    collector.require(
        party.phone,
        entity=entity,
        entity_id=entity_id,
        field="absher_phone",
        en=f"{label_en} mobile number is required — Ejar verifies parties through Absher.",
        ar=f"رقم جوال {label_ar} مطلوب — تتحقق منصة إيجار من الأطراف عبر أبشر.",
    )

    if is_organisation:
        collector.require(
            party.representative_name,
            entity=entity,
            entity_id=entity_id,
            field="representative_name",
            en=f"{label_en} is an organisation — an authorised representative is required.",
            ar=f"{label_ar} منشأة — يجب تحديد الممثل المفوّض.",
        )
        collector.require(
            party.representative_id_number,
            entity=entity,
            entity_id=entity_id,
            field="representative_national_id",
            en=f"{label_en} representative ID number is required.",
            ar=f"رقم هوية ممثل {label_ar} مطلوب.",
        )
    else:
        collector.require(
            party.date_of_birth,
            entity=entity,
            entity_id=entity_id,
            field="date_of_birth",
            en=f"{label_en} date of birth is required for Absher verification.",
            ar=f"تاريخ ميلاد {label_ar} مطلوب للتحقق عبر أبشر.",
        )

    if party.id_type in _EXPIRING_ID_TYPES:
        collector.require(
            party.id_expiry_date,
            entity=entity,
            entity_id=entity_id,
            field="id_expiry_date",
            en=f"{label_en} ID expiry date is required for this ID type.",
            ar=f"تاريخ انتهاء هوية {label_ar} مطلوب لهذا النوع من الهويات.",
        )
        collector.require(
            party.nationality,
            entity=entity,
            entity_id=entity_id,
            field="nationality",
            en=f"{label_en} nationality is required for non-Saudi ID types.",
            ar=f"جنسية {label_ar} مطلوبة لهذا النوع من الهويات.",
        )
        if party.id_expiry_date and party.id_expiry_date < date.today().isoformat():
            collector.add(
                EjarIssue(
                    entity=entity,
                    entity_id=entity_id,
                    field="id_expiry_date",
                    message_en=f"{label_en} ID expired on {party.id_expiry_date}.",
                    message_ar=f"انتهت هوية {label_ar} بتاريخ {party.id_expiry_date}.",
                )
            )


# ── Property (العقار والوحدة) ─────────────────────────────────────────────────


def build_property_ref(building: Building, unit: Unit, contract: Contract) -> EjarPropertyRef:
    return EjarPropertyRef(
        property_type=building.property_type or "residential",
        deed_number=building.deed_number or "",
        unit_number=unit.number,
        city=building.city or "",
        district=building.district or "",
        street=building.street,
        national_address=building.national_address,
        postal_code=building.postal_code,
        building_number=building.building_number,
        additional_number=building.additional_number,
        ejar_property_id=building.ejar_property_id,
        ejar_unit_id=unit.ejar_unit_id,
        unit_usage=unit.usage_type or unit.unit_type,
        area_sqm=unit.area_sqm,
        rooms_count=unit.rooms_count,
        bathrooms_count=unit.bathrooms_count,
        is_furnished=bool(unit.is_furnished),
        electricity_meter_number=(
            contract.electricity_meter_number or building.electricity_meter_number
        ),
        water_meter_number=contract.water_meter_number or building.water_meter_number,
    )


def _check_property(
    collector: _IssueCollector, building: Building, unit: Unit, prop: EjarPropertyRef
) -> None:
    collector.require(
        prop.deed_number,
        entity="building",
        entity_id=building.id,
        field="deed_number",
        en="Title deed number (رقم الصك) is required to register the property on Ejar.",
        ar="رقم الصك مطلوب لتسجيل العقار في منصة إيجار.",
    )
    collector.require(
        prop.city,
        entity="building",
        entity_id=building.id,
        field="city",
        en="Property city is required.",
        ar="مدينة العقار مطلوبة.",
    )
    collector.require(
        prop.district,
        entity="building",
        entity_id=building.id,
        field="district",
        en="Property district is required.",
        ar="حي العقار مطلوب.",
    )
    collector.require(
        prop.national_address,
        entity="building",
        entity_id=building.id,
        field="national_address",
        en="Saudi National Address (short address) is required by Ejar.",
        ar="العنوان الوطني المختصر مطلوب في منصة إيجار.",
        severity="warning",
    )
    collector.require(
        prop.unit_number,
        entity="unit",
        entity_id=unit.id,
        field="number",
        en="Unit number is required.",
        ar="رقم الوحدة مطلوب.",
    )
    collector.require(
        prop.unit_usage,
        entity="unit",
        entity_id=unit.id,
        field="usage_type",
        en="Unit usage (residential / commercial / office …) is required.",
        ar="استخدام الوحدة (سكني / تجاري / مكتبي …) مطلوب.",
        severity="warning",
    )


# ── Lease contracts (عقود الإيجار) ────────────────────────────────────────────


def _resolve_lease_chain(
    db: Session, contract: Contract
) -> tuple[Optional[Unit], Optional[Building], Optional[Owner], Optional[Tenant]]:
    unit = db.get(Unit, contract.unit_id)
    building = unit.building if unit else None
    owner = building.owner if building else None
    tenant = db.get(Tenant, contract.tenant_id) if contract.tenant_id else None
    return unit, building, owner, tenant


def check_lease_readiness(db: Session, contract: Contract) -> list[EjarIssue]:
    """Return every field Ejar will reject this lease for, before submitting."""
    collector = _IssueCollector()
    unit, building, owner, tenant = _resolve_lease_chain(db, contract)

    if unit is None or building is None or owner is None:
        collector.add(
            EjarIssue(
                entity="contract",
                entity_id=contract.id,
                field="unit_id",
                message_en="The unit, building or owner record linked to this contract is missing.",
                message_ar="سجل الوحدة أو العقار أو المالك المرتبط بهذا العقد غير موجود.",
            )
        )
        return collector.issues

    if tenant is None:
        collector.add(
            EjarIssue(
                entity="contract",
                entity_id=contract.id,
                field="tenant_id",
                message_en="A lease contract must have a tenant.",
                message_ar="يجب تحديد المستأجر في عقد الإيجار.",
            )
        )
    else:
        _check_party(
            collector,
            entity="tenant",
            entity_id=tenant.id,
            party=build_party_from_tenant(tenant),
            label_en="Tenant",
            label_ar="المستأجر",
            is_organisation=(tenant.tenant_type == "company")
            or (tenant.id_type in _ORGANISATION_ID_TYPES),
        )

    _check_party(
        collector,
        entity="owner",
        entity_id=owner.id,
        party=build_party_from_owner(owner),
        label_en="Landlord",
        label_ar="المالك",
        is_organisation=(owner.owner_type == "company")
        or (owner.id_type in _ORGANISATION_ID_TYPES),
    )

    _check_property(collector, building, unit, build_property_ref(building, unit, contract))

    if contract.contract_type not in ("residential", "commercial"):
        collector.add(
            EjarIssue(
                entity="contract",
                entity_id=contract.id,
                field="contract_type",
                message_en=(
                    "Only residential and commercial contracts are registered as Ejar leases. "
                    "Use a management contract for the owner↔company mandate."
                ),
                message_ar=(
                    "تُسجَّل العقود السكنية والتجارية فقط كعقود إيجار. "
                    "استخدم عقد إدارة أملاك للاتفاق بين المالك والشركة."
                ),
            )
        )

    if (contract.total_rent_amount or contract.rent_amount or 0) <= 0:
        collector.add(
            EjarIssue(
                entity="contract",
                entity_id=contract.id,
                field="total_rent_amount",
                message_en="Total rent for the contract period must be greater than zero.",
                message_ar="يجب أن يكون إجمالي قيمة الإيجار للمدة أكبر من صفر.",
            )
        )

    if contract.end_date <= contract.start_date:
        collector.add(
            EjarIssue(
                entity="contract",
                entity_id=contract.id,
                field="end_date",
                message_en="Contract end date must be after the start date.",
                message_ar="يجب أن يكون تاريخ نهاية العقد بعد تاريخ البداية.",
            )
        )

    # Signing authority — the part that ties leases to the management contract.
    company = get_active_company(db)
    if contract.ejar_signed_by == "property_manager":
        _check_company(collector, company)
        mandate = _resolve_mandate(db, contract, owner, building, unit)
        if mandate is None:
            collector.add(
                EjarIssue(
                    entity="contract",
                    entity_id=contract.id,
                    field="management_contract_id",
                    message_en=(
                        "No active property management contract authorises this office to sign "
                        "for the owner. Register one on Ejar first, or set the landlord as the "
                        "signing party."
                    ),
                    message_ar=(
                        "لا يوجد عقد إدارة أملاك ساري يخوّل المكتب بالتوقيع نيابة عن المالك. "
                        "سجّل عقد إدارة في إيجار أولًا، أو اجعل المالك هو الطرف الموقّع."
                    ),
                )
            )
        else:
            if not mandate.can_sign_leases:
                collector.add(
                    EjarIssue(
                        entity="management_contract",
                        entity_id=mandate.id,
                        field="can_sign_leases",
                        message_en=(
                            "The management contract does not grant authority to sign leases."
                        ),
                        message_ar="عقد إدارة الأملاك لا يمنح صلاحية توقيع عقود الإيجار.",
                    )
                )
            if mandate.ejar_status != "registered":
                collector.add(
                    EjarIssue(
                        entity="management_contract",
                        entity_id=mandate.id,
                        field="ejar_status",
                        message_en=(
                            "The management contract is not registered on Ejar yet — register it "
                            "before filing leases under it."
                        ),
                        message_ar=(
                            "عقد إدارة الأملاك غير مسجّل في إيجار بعد — سجّله قبل تسجيل عقود "
                            "الإيجار المرتبطة به."
                        ),
                    )
                )
            if mandate.end_date < contract.end_date:
                collector.add(
                    EjarIssue(
                        entity="management_contract",
                        entity_id=mandate.id,
                        field="end_date",
                        message_en=(
                            "The management contract expires before this lease ends "
                            f"({mandate.end_date.isoformat()})."
                        ),
                        message_ar=(
                            "ينتهي عقد إدارة الأملاك قبل انتهاء عقد الإيجار "
                            f"({mandate.end_date.isoformat()})."
                        ),
                        severity="warning",
                    )
                )

    return collector.issues


def _resolve_mandate(
    db: Session,
    contract: Contract,
    owner: Owner,
    building: Building,
    unit: Unit,
) -> Optional[ManagementContract]:
    """Find the management contract that authorises this lease.

    Prefers the explicit link on the contract; otherwise looks for an active
    mandate from the building's owner that covers this building or unit.
    """
    if contract.management_contract_id:
        return db.get(ManagementContract, contract.management_contract_id)

    candidates = db.scalars(
        select(ManagementContract)
        .where(
            ManagementContract.owner_id == owner.id,
            ManagementContract.status == "active",
        )
        .order_by(ManagementContract.end_date.desc())
    ).all()

    for mandate in candidates:
        # An empty portfolio means "everything this owner has".
        if not mandate.properties:
            return mandate
        for entry in mandate.properties:
            if entry.building_id != building.id:
                continue
            if entry.unit_id is None or entry.unit_id == unit.id:
                return mandate
    return None


def build_lease_payload(db: Session, contract: Contract) -> EjarContractPayload:
    """Build the Ejar lease-registration payload from a contract row."""
    unit, building, owner, tenant = _resolve_lease_chain(db, contract)
    if unit is None or building is None or owner is None or tenant is None:
        raise ValueError("Contract is missing its unit, building, owner or tenant record")

    company = get_active_company(db)
    mandate = _resolve_mandate(db, contract, owner, building, unit)
    landlord = build_party_from_owner(owner)
    tenant_party = build_party_from_tenant(tenant)
    prop = build_property_ref(building, unit, contract)

    return EjarContractPayload(
        landlord_national_id=landlord.id_number,
        landlord_name=landlord.name,
        tenant_national_id=tenant_party.id_number,
        tenant_name=tenant_party.name,
        tenant_phone=tenant_party.phone or "",
        property_type=prop.property_type,
        building_deed_number=prop.deed_number,
        unit_number=prop.unit_number,
        city=prop.city,
        district=prop.district,
        contract_type=contract.contract_type,
        start_date=contract.start_date.isoformat(),
        end_date=contract.end_date.isoformat(),
        total_rent_amount=contract.total_rent_amount or contract.rent_amount,
        payment_cycle=contract.payment_cycle,
        ejar_contract_number=contract.ejar_contract_number,
        notes=contract.notes,
        landlord=landlord,
        tenant=tenant_party,
        property_ref=prop,
        establishment=build_establishment(company) if company else None,
        signed_by=contract.ejar_signed_by or "property_manager",
        management_contract_number=(
            mandate.ejar_contract_number or mandate.contract_number if mandate else None
        ),
        payment_count=contract.payment_count or 1,
        installment_amount=round(
            (contract.rent_amount or 0) * (contract.payment_cycle or 1), 2
        ),
        security_deposit=contract.insurance_amount or 0,
        services_amount=contract.services_amount or 0,
        vat_rate=contract.vat_rate if contract.vat_rate is not None else 15,
        vat_amount=contract.vat_amount or 0,
        total_amount=contract.total_amount or 0,
        electricity_on_tenant=bool(contract.electricity_on_tenant),
        water_on_tenant=bool(contract.water_on_tenant),
        companions=[
            {
                "name": c.name,
                "idNumber": c.national_id,
                "dateOfBirth": _iso(c.date_of_birth),
            }
            for c in (tenant.companions or [])
        ],
    )


# ── Management contracts (عقود إدارة الأملاك) ─────────────────────────────────


def check_management_readiness(
    db: Session, mandate: ManagementContract
) -> list[EjarIssue]:
    """Return every field Ejar will reject this management contract for."""
    collector = _IssueCollector()

    company = mandate.company or get_active_company(db)
    _check_company(collector, company)

    owner = db.get(Owner, mandate.owner_id)
    if owner is None:
        collector.add(
            EjarIssue(
                entity="management_contract",
                entity_id=mandate.id,
                field="owner_id",
                message_en="The owner record linked to this contract is missing.",
                message_ar="سجل المالك المرتبط بهذا العقد غير موجود.",
            )
        )
    else:
        _check_party(
            collector,
            entity="owner",
            entity_id=owner.id,
            party=build_party_from_owner(owner),
            label_en="Owner",
            label_ar="المالك",
            is_organisation=(owner.owner_type == "company")
            or (owner.id_type in _ORGANISATION_ID_TYPES),
        )
        collector.require(
            owner.iban,
            entity="owner",
            entity_id=owner.id,
            field="iban",
            en="Owner IBAN is required so collected rent can be transferred.",
            ar="رقم الآيبان للمالك مطلوب لتحويل الإيجارات المحصّلة.",
            severity="warning" if mandate.fee_collection_method != "deduct_from_rent" else "error",
        )

    if mandate.end_date <= mandate.start_date:
        collector.add(
            EjarIssue(
                entity="management_contract",
                entity_id=mandate.id,
                field="end_date",
                message_en="Contract end date must be after the start date.",
                message_ar="يجب أن يكون تاريخ نهاية العقد بعد تاريخ البداية.",
            )
        )

    if mandate.fee_type == "percentage" and (mandate.fee_percentage or 0) <= 0:
        collector.add(
            EjarIssue(
                entity="management_contract",
                entity_id=mandate.id,
                field="fee_percentage",
                message_en="A management fee percentage greater than zero is required.",
                message_ar="يجب تحديد نسبة أتعاب إدارة أكبر من صفر.",
            )
        )
    if mandate.fee_type == "fixed" and (mandate.fee_fixed_amount or 0) <= 0:
        collector.add(
            EjarIssue(
                entity="management_contract",
                entity_id=mandate.id,
                field="fee_fixed_amount",
                message_en="A fixed management fee greater than zero is required.",
                message_ar="يجب تحديد مبلغ أتعاب إدارة مقطوع أكبر من صفر.",
            )
        )

    if not mandate.properties:
        collector.add(
            EjarIssue(
                entity="management_contract",
                entity_id=mandate.id,
                field="properties",
                message_en="At least one property must be placed under management.",
                message_ar="يجب إضافة عقار واحد على الأقل ضمن نطاق الإدارة.",
            )
        )
    for entry in mandate.properties:
        building = entry.building
        if building is None:
            continue
        collector.require(
            building.deed_number,
            entity="building",
            entity_id=building.id,
            field="deed_number",
            en=f"Title deed number is required for '{building.name}'.",
            ar=f"رقم الصك مطلوب للعقار «{building.name}».",
        )
        if building.owner_id != mandate.owner_id:
            collector.add(
                EjarIssue(
                    entity="building",
                    entity_id=building.id,
                    field="owner_id",
                    message_en=(
                        f"'{building.name}' belongs to a different owner than this contract."
                    ),
                    message_ar=f"العقار «{building.name}» يعود لمالك آخر غير مالك هذا العقد.",
                )
            )

    return collector.issues


def build_management_payload(
    db: Session, mandate: ManagementContract
) -> EjarManagementContractPayload:
    """Build the Ejar management-contract registration payload."""
    owner = db.get(Owner, mandate.owner_id)
    if owner is None:
        raise ValueError("Management contract is missing its owner record")
    company = mandate.company or get_active_company(db)
    if company is None:
        raise ValueError("No active establishment profile is configured")

    properties: list[dict[str, Any]] = []
    for entry in mandate.properties:
        building = entry.building
        if building is None:
            continue
        properties.append(
            {
                "propertyId": building.ejar_property_id,
                "deedNumber": building.deed_number,
                "buildingName": building.name,
                "propertyType": building.property_type,
                "city": building.city,
                "district": building.district,
                "nationalAddress": building.national_address,
                "unitId": entry.unit.ejar_unit_id if entry.unit else None,
                "unitNumber": entry.unit.number if entry.unit else None,
                "feePercentage": (
                    entry.fee_percentage_override
                    if entry.fee_percentage_override is not None
                    else mandate.fee_percentage
                ),
            }
        )

    return EjarManagementContractPayload(
        owner=build_party_from_owner(owner),
        establishment=build_establishment(company),
        contract_number=mandate.contract_number,
        start_date=mandate.start_date.isoformat(),
        end_date=mandate.end_date.isoformat(),
        fee_type=mandate.fee_type,
        fee_percentage=mandate.fee_percentage or 0,
        fee_fixed_amount=mandate.fee_fixed_amount or 0,
        fee_collection_method=mandate.fee_collection_method,
        vat_rate=mandate.vat_rate if mandate.vat_rate is not None else 15,
        estimated_annual_fee=mandate.estimated_annual_fee or 0,
        auto_renew=bool(mandate.auto_renew),
        notice_period_days=mandate.notice_period_days or 0,
        payout_cycle_months=mandate.payout_cycle_months or 1,
        can_market_units=bool(mandate.can_market_units),
        can_sign_leases=bool(mandate.can_sign_leases),
        can_collect_rent=bool(mandate.can_collect_rent),
        can_evict=bool(mandate.can_evict),
        can_maintain=bool(mandate.can_maintain),
        can_pay_utilities=bool(mandate.can_pay_utilities),
        maintenance_limit_amount=mandate.maintenance_limit_amount or 0,
        properties=properties,
        ejar_contract_number=mandate.ejar_contract_number,
        notes=mandate.notes,
    )


def check_company_readiness(db: Session) -> list[EjarIssue]:
    """Check the establishment profile on its own (licence, CR, signatory)."""
    collector = _IssueCollector()
    _check_company(collector, get_active_company(db))
    return collector.issues


def issues_as_dicts(issues: list[EjarIssue]) -> list[dict[str, Any]]:
    return [i.as_dict() for i in issues]


def blocking(issues: list[EjarIssue]) -> list[EjarIssue]:
    return [i for i in issues if i.severity == "error"]
