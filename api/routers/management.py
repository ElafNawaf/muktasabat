"""Ejar establishment profile + property management contracts (عقود إدارة الأملاك).

Two resources live here because they are two halves of the same Ejar concept:
a management contract can only be filed by a licensed establishment, so the
office profile is part of the contract's data even though it is stored once.
"""

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.deps import CurrentUser, DbSession
from api.management_fees import compute_management_fee
from api.models import (
    Building,
    ManagementCompany,
    ManagementContract,
    ManagementContractAttachment,
    ManagementContractProperty,
    Owner,
    Unit,
)
from api.permissions import Perm
from api.schemas.management import (
    EjarIssueRead,
    EjarReadinessResponse,
    ManagementAttachmentRead,
    ManagementCompanyRead,
    ManagementCompanyUpsert,
    ManagementContractCreate,
    ManagementContractRead,
    ManagementContractUpdate,
    ManagementSyncResponse,
)
from api.services.ejar import get_ejar_service
from api.services.ejar_mapping import (
    blocking,
    build_management_payload,
    check_company_readiness,
    check_management_readiness,
    get_active_company,
    issues_as_dicts,
)
from api.services.ejar_sync import sync_management_contracts
from api.storage import StorageNotConfigured, delete_object, upload_document

router = APIRouter(prefix="/management", tags=["management"])


# ══════════════════════════════════════════════════════════════════════════════
# Establishment profile (المنشأة العقارية)
# ══════════════════════════════════════════════════════════════════════════════


@router.get("/company", response_model=ManagementCompanyRead | None)
def get_company(db: DbSession, _user: CurrentUser):
    """Return the active establishment profile, or null when none is set up."""
    return get_active_company(db)


@router.put("/company", response_model=ManagementCompanyRead)
def upsert_company(
    payload: ManagementCompanyUpsert,
    db: DbSession,
    _user: Perm("users", "edit"),
):
    """Create or update the establishment this portal files Ejar contracts under."""
    company = get_active_company(db)
    if company is None:
        company = ManagementCompany(**payload.model_dump())
        db.add(company)
    else:
        for field, value in payload.model_dump().items():
            setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company


# ══════════════════════════════════════════════════════════════════════════════
# Management contracts (عقود إدارة الأملاك)
# ══════════════════════════════════════════════════════════════════════════════


def _annual_rent_base(db: Session, contract: ManagementContract) -> float:
    """Yearly rent of the portfolio under management, used to size the fee.

    A portfolio entry without a unit covers the whole building, so every unit in
    it counts; an entry with a unit contributes only that unit.
    """
    total = 0.0
    seen_units: set[int] = set()
    for entry in contract.properties:
        if entry.unit_id is not None:
            unit = db.get(Unit, entry.unit_id)
            if unit and unit.id not in seen_units:
                seen_units.add(unit.id)
                total += (unit.rent_amount or 0) * 12
            continue
        units = db.scalars(select(Unit).where(Unit.building_id == entry.building_id)).all()
        for unit in units:
            if unit.id in seen_units:
                continue
            seen_units.add(unit.id)
            total += (unit.rent_amount or 0) * 12
    return round(total, 2)


def _apply_fee_totals(db: Session, contract: ManagementContract) -> None:
    fee, vat_amount, total = compute_management_fee(
        fee_type=contract.fee_type,
        fee_percentage=contract.fee_percentage,
        fee_fixed_amount=contract.fee_fixed_amount,
        annual_rent_base=_annual_rent_base(db, contract),
        vat_rate=contract.vat_rate,
    )
    contract.estimated_annual_fee = fee
    contract.vat_amount = vat_amount
    contract.total_fee_amount = total


def _replace_properties(db: Session, contract: ManagementContract, payload) -> None:
    """Rebuild the managed portfolio from the request, validating each entry."""
    contract.properties.clear()
    db.flush()
    for entry in payload.properties:
        building = db.get(Building, entry.building_id)
        if building is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, f"Building {entry.building_id} not found"
            )
        if building.owner_id != payload.owner_id:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Building '{building.name}' does not belong to the selected owner",
            )
        if entry.unit_id is not None:
            unit = db.get(Unit, entry.unit_id)
            if unit is None or unit.building_id != building.id:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"Unit {entry.unit_id} does not belong to building '{building.name}'",
                )
        contract.properties.append(
            ManagementContractProperty(
                building_id=entry.building_id,
                unit_id=entry.unit_id,
                fee_percentage_override=entry.fee_percentage_override,
            )
        )


@router.get("/contracts", response_model=list[ManagementContractRead])
def list_management_contracts(db: DbSession, _user: CurrentUser):
    return db.scalars(
        select(ManagementContract).order_by(ManagementContract.created_at.desc())
    ).all()


@router.get("/contracts/{contract_id}", response_model=ManagementContractRead)
def get_management_contract(contract_id: int, db: DbSession, _user: CurrentUser):
    contract = db.get(ManagementContract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Management contract not found")
    return contract


@router.post(
    "/contracts",
    response_model=ManagementContractRead,
    status_code=status.HTTP_201_CREATED,
)
def create_management_contract(
    payload: ManagementContractCreate,
    db: DbSession,
    _user: Perm("contracts", "create"),
):
    if db.get(Owner, payload.owner_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Owner not found")
    if db.scalar(
        select(ManagementContract).where(
            ManagementContract.contract_number == payload.contract_number
        )
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Contract number already exists")

    company_id = payload.company_id
    if company_id is None:
        active = get_active_company(db)
        company_id = active.id if active else None

    data = payload.model_dump(exclude={"properties", "company_id"})
    contract = ManagementContract(**data, company_id=company_id)
    db.add(contract)
    db.flush()
    _replace_properties(db, contract, payload)
    db.flush()
    _apply_fee_totals(db, contract)
    db.commit()
    db.refresh(contract)
    return contract


@router.put("/contracts/{contract_id}", response_model=ManagementContractRead)
def update_management_contract(
    contract_id: int,
    payload: ManagementContractUpdate,
    db: DbSession,
    _user: Perm("contracts", "edit"),
):
    contract = db.get(ManagementContract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Management contract not found")
    if db.get(Owner, payload.owner_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Owner not found")

    clash = db.scalar(
        select(ManagementContract).where(
            ManagementContract.contract_number == payload.contract_number,
            ManagementContract.id != contract_id,
        )
    )
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Contract number already exists")

    for field, value in payload.model_dump(exclude={"properties"}).items():
        setattr(contract, field, value)
    _replace_properties(db, contract, payload)
    db.flush()
    _apply_fee_totals(db, contract)
    db.commit()
    db.refresh(contract)
    return contract


@router.post("/contracts/{contract_id}/terminate", response_model=ManagementContractRead)
def terminate_management_contract(
    contract_id: int,
    db: DbSession,
    _user: Perm("contracts", "delete"),
):
    contract = db.get(ManagementContract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Management contract not found")
    contract.status = "terminated"
    db.commit()
    db.refresh(contract)
    return contract


@router.delete("/contracts/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_management_contract(
    contract_id: int,
    db: DbSession,
    _user: Perm("contracts", "delete"),
):
    contract = db.get(ManagementContract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Management contract not found")
    if contract.lease_contracts:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{len(contract.lease_contracts)} lease contract(s) are filed under this "
            "management contract — unlink or delete them first",
        )
    keys = [a.object_key for a in contract.attachments if a.object_key]
    db.delete(contract)
    db.commit()
    for key in keys:
        delete_object(key)


# ── Attachments (مرفقات العقد) ────────────────────────────────────────────────


@router.post(
    "/contracts/{contract_id}/attachments",
    response_model=ManagementAttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_management_attachment(
    contract_id: int,
    db: DbSession,
    _user: CurrentUser,
    file: UploadFile = File(...),
):
    contract = db.get(ManagementContract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Management contract not found")

    try:
        stored = upload_document(
            file.file,
            content_type=file.content_type or "application/octet-stream",
            prefix=f"management-contracts/{contract_id}/attachments",
            original_filename=file.filename,
        )
    except StorageNotConfigured as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    next_order = (max((a.sort_order for a in contract.attachments), default=-1)) + 1
    attachment = ManagementContractAttachment(
        management_contract_id=contract.id,
        url=stored.public_url,
        object_key=stored.object_key,
        filename=file.filename or "attachment",
        file_type=file.content_type,
        sort_order=next_order,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.delete(
    "/contracts/{contract_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_management_attachment(
    contract_id: int,
    attachment_id: int,
    db: DbSession,
    _user: Perm("contracts", "delete"),
):
    attachment = db.get(ManagementContractAttachment, attachment_id)
    if attachment is None or attachment.management_contract_id != contract_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    object_key = attachment.object_key
    db.delete(attachment)
    db.commit()
    delete_object(object_key)


# ══════════════════════════════════════════════════════════════════════════════
# Ejar integration (تكامل منصة إيجار)
# ══════════════════════════════════════════════════════════════════════════════


def _readiness(db: Session, contract: ManagementContract) -> EjarReadinessResponse:
    issues = check_management_readiness(db, contract)
    errors = blocking(issues)
    return EjarReadinessResponse(
        ready=not errors,
        is_stub_mode=get_ejar_service().is_stub,
        error_count=len(errors),
        warning_count=len(issues) - len(errors),
        issues=[EjarIssueRead(**i) for i in issues_as_dicts(issues)],
    )


@router.get(
    "/contracts/{contract_id}/ejar/validate", response_model=EjarReadinessResponse
)
def validate_management_contract(contract_id: int, db: DbSession, _user: CurrentUser):
    """Report which fields Ejar would reject, without submitting anything."""
    contract = db.get(ManagementContract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Management contract not found")
    return _readiness(db, contract)


@router.post("/contracts/{contract_id}/ejar/register", response_model=ManagementContractRead)
async def register_management_contract_on_ejar(
    contract_id: int,
    db: DbSession,
    _user: Perm("contracts", "create"),
):
    """Register this property management contract on Ejar.

    Validation runs first so the caller gets a precise list of missing fields
    instead of an opaque rejection from the platform.
    """
    contract = db.get(ManagementContract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Management contract not found")

    if contract.ejar_status == "registered":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Already registered on Ejar (contract {contract.ejar_contract_number})",
        )

    errors = blocking(check_management_readiness(db, contract))
    if errors:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            {
                "message": "Contract is not ready for Ejar registration",
                "issues": issues_as_dicts(errors),
            },
        )

    try:
        payload = build_management_payload(db, contract)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    result = await get_ejar_service().register_management_contract(payload)

    if not result.success:
        contract.ejar_status = "failed"
        contract.ejar_last_error = result.error_message
        contract.ejar_response_data = result.raw
        db.commit()
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Ejar registration failed: {result.error_message}",
        )

    contract.ejar_status = "registered"
    contract.ejar_contract_number = result.ejar_contract_number
    contract.ejar_reference = result.ejar_reference
    contract.ejar_registered_at = result.registered_at
    contract.ejar_last_error = None
    contract.ejar_response_data = result.raw
    db.commit()
    db.refresh(contract)
    return contract


@router.post("/contracts/{contract_id}/ejar/cancel", response_model=ManagementContractRead)
async def cancel_management_contract_on_ejar(
    contract_id: int,
    db: DbSession,
    _user: Perm("contracts", "delete"),
):
    """Cancel this management contract's registration on Ejar."""
    contract = db.get(ManagementContract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Management contract not found")
    if contract.ejar_status != "registered":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Contract is not registered on Ejar — cannot cancel",
        )

    active_leases = [c for c in contract.lease_contracts if c.ejar_status == "registered"]
    if active_leases:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{len(active_leases)} lease(s) are still registered on Ejar under this "
            "management contract — cancel them first",
        )

    ref = contract.ejar_reference or contract.ejar_contract_number or ""
    ok = await get_ejar_service().cancel_management_contract(ejar_reference=ref)
    if not ok:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Ejar cancellation request failed")

    contract.ejar_status = "cancelled"
    db.commit()
    db.refresh(contract)
    return contract


@router.get("/contracts/{contract_id}/ejar/status", response_model=ManagementContractRead)
async def refresh_management_contract_status(
    contract_id: int,
    db: DbSession,
    _user: CurrentUser,
):
    """Pull the live status from Ejar and store it on the contract."""
    contract = db.get(ManagementContract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Management contract not found")

    if contract.ejar_status in (None, "failed"):
        return contract

    ref = contract.ejar_reference or contract.ejar_contract_number or ""
    result = await get_ejar_service().get_management_status(ejar_reference=ref)
    contract.ejar_status = result.status
    if result.status in ("cancelled", "expired"):
        contract.status = "terminated" if result.status == "cancelled" else "expired"
    db.commit()
    db.refresh(contract)
    return contract


@router.post("/ejar/sync", response_model=ManagementSyncResponse)
async def sync_management_contracts_from_ejar(
    db: DbSession,
    _user: Perm("contracts", "create"),
):
    """Import every management contract registered for this establishment on Ejar.

    Matching is by Ejar contract number, so re-running updates rows instead of
    duplicating them. Owners referenced by an imported contract are created when
    they do not exist yet.
    """
    ejar = get_ejar_service()
    try:
        summaries = await ejar.list_management_contracts()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Failed to fetch management contracts from Ejar: {exc}",
        )

    result = sync_management_contracts(db, summaries)
    return ManagementSyncResponse(is_stub_mode=ejar.is_stub, **result.as_dict())


@router.get("/company/ejar/validate", response_model=EjarReadinessResponse)
def validate_company(db: DbSession, _user: CurrentUser):
    """Check the establishment profile on its own (licence, CR, signatory)."""
    issues = check_company_readiness(db)
    errors = blocking(issues)
    return EjarReadinessResponse(
        ready=not errors,
        is_stub_mode=get_ejar_service().is_stub,
        error_count=len(errors),
        warning_count=len(issues) - len(errors),
        issues=[EjarIssueRead(**i) for i in issues_as_dicts(issues)],
    )
