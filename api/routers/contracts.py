from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select

from api.deps import CurrentUser, DbSession
from api.models import Contract, ContractAttachment, Payment, Tenant, Unit
from api.schemas.contract import (
    ContractAttachmentRead,
    ContractCreateRequest,
    ContractRead,
    ContractUpdateRequest,
)
from api.storage import StorageNotConfigured, delete_object, upload_document

router = APIRouter(prefix="/contracts", tags=["contracts"])


@router.get("", response_model=list[ContractRead])
def list_contracts(db: DbSession, _user: CurrentUser):
    return db.scalars(select(Contract).order_by(Contract.created_at.desc())).all()


@router.get("/{contract_id}", response_model=ContractRead)
def get_contract(contract_id: int, db: DbSession, _user: CurrentUser):
    contract = db.get(Contract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    return contract


@router.post("", response_model=ContractRead, status_code=status.HTTP_201_CREATED)
def create_contract(
    payload: ContractCreateRequest,
    db: DbSession,
    _user: CurrentUser,
):
    unit = db.get(Unit, payload.unit_id)
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unit not found")
    if not unit.is_available:
        raise HTTPException(status.HTTP_409_CONFLICT, "Unit is not available")

    if db.get(Tenant, payload.tenant_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")

    if db.scalar(select(Contract).where(Contract.contract_number == payload.contract_number)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Contract number already exists")

    contract = Contract(
        unit_id=payload.unit_id,
        tenant_id=payload.tenant_id,
        contract_number=payload.contract_number,
        branch=payload.branch,
        contract_type=payload.contract_type,
        validity_type=payload.validity_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        duration_years=payload.duration_years,
        duration_months=payload.duration_months,
        duration_days=payload.duration_days,
        total_rent_amount=payload.total_rent_amount,
        rent_amount=payload.rent_amount,
        ejar_contract_number=payload.ejar_contract_number,
        payment_type=payload.payment_type,
        payment_count=payload.payment_count,
        payment_cycle=payload.payment_cycle,
        electricity_on_tenant=payload.electricity_on_tenant,
        electricity_split_percentage=payload.electricity_split_percentage,
        water_on_tenant=payload.water_on_tenant,
        water_split_percentage=payload.water_split_percentage,
        services_amount=payload.services_amount,
        insurance_amount=payload.insurance_amount,
        notes=payload.notes,
    )
    db.add(contract)
    unit.is_available = False
    db.flush()

    _generate_payments(db, contract)
    db.commit()
    db.refresh(contract)
    return contract


@router.put("/{contract_id}", response_model=ContractRead)
def update_contract(
    contract_id: int,
    payload: ContractUpdateRequest,
    db: DbSession,
    _user: CurrentUser,
):
    contract = db.get(Contract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")

    contract.contract_number = payload.contract_number
    contract.branch = payload.branch
    contract.contract_type = payload.contract_type
    contract.validity_type = payload.validity_type
    contract.start_date = payload.start_date
    contract.end_date = payload.end_date
    contract.duration_years = payload.duration_years
    contract.duration_months = payload.duration_months
    contract.duration_days = payload.duration_days
    contract.total_rent_amount = payload.total_rent_amount
    contract.rent_amount = payload.rent_amount
    contract.ejar_contract_number = payload.ejar_contract_number
    contract.payment_type = payload.payment_type
    contract.payment_count = payload.payment_count
    contract.payment_cycle = payload.payment_cycle
    contract.electricity_on_tenant = payload.electricity_on_tenant
    contract.electricity_split_percentage = payload.electricity_split_percentage
    contract.water_on_tenant = payload.water_on_tenant
    contract.water_split_percentage = payload.water_split_percentage
    contract.services_amount = payload.services_amount
    contract.insurance_amount = payload.insurance_amount
    contract.status = payload.status
    contract.notes = payload.notes
    db.commit()
    db.refresh(contract)
    return contract


@router.post("/{contract_id}/terminate", response_model=ContractRead)
def terminate_contract(contract_id: int, db: DbSession, _user: CurrentUser):
    contract = db.get(Contract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")

    contract.status = "terminated"
    unit = db.get(Unit, contract.unit_id)
    if unit:
        unit.is_available = True
    db.commit()
    db.refresh(contract)
    return contract


# ---------- Attachments (مرفقات العقد) ----------


@router.post(
    "/{contract_id}/attachments",
    response_model=ContractAttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_contract_attachment(
    contract_id: int,
    db: DbSession,
    _user: CurrentUser,
    file: UploadFile = File(...),
):
    contract = db.get(Contract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")

    try:
        stored = upload_document(
            file.file,
            content_type=file.content_type or "application/octet-stream",
            prefix=f"contracts/{contract_id}/attachments",
            original_filename=file.filename,
        )
    except StorageNotConfigured as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    next_order = (max((a.sort_order for a in contract.attachments), default=-1)) + 1
    attachment = ContractAttachment(
        contract_id=contract.id,
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
    "/{contract_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_contract_attachment(
    contract_id: int,
    attachment_id: int,
    db: DbSession,
    _user: CurrentUser,
):
    attachment = db.get(ContractAttachment, attachment_id)
    if attachment is None or attachment.contract_id != contract_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    object_key = attachment.object_key
    db.delete(attachment)
    db.commit()
    delete_object(object_key)


def _generate_payments(db, contract: Contract) -> None:
    """Auto-generate payment installments based on payment_cycle."""
    cycle_months = contract.payment_cycle
    current_date = contract.start_date
    installment_amount = contract.rent_amount * cycle_months

    while current_date < contract.end_date:
        db.add(
            Payment(
                contract_id=contract.id,
                amount=installment_amount,
                due_date=current_date,
                status="pending",
            )
        )
        current_date += relativedelta(months=cycle_months)
