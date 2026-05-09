from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from api.deps import CurrentUser, DbSession
from api.models import Contract, Payment, Tenant, Unit
from api.schemas.contract import (
    ContractCreateRequest,
    ContractRead,
    ContractUpdateRequest,
)

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
        start_date=payload.start_date,
        end_date=payload.end_date,
        rent_amount=payload.rent_amount,
        payment_cycle=payload.payment_cycle,
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
    contract.start_date = payload.start_date
    contract.end_date = payload.end_date
    contract.rent_amount = payload.rent_amount
    contract.payment_cycle = payload.payment_cycle
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
