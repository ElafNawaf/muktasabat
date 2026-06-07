from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, select

from api.deps import CurrentUser, DbSession
from api.models import Payment, PaymentSplit
from api.permissions import Perm
from api.schemas.payment import (
    PaymentMarkPaidRequest,
    PaymentRead,
    PaymentUpdateRequest,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("", response_model=list[PaymentRead])
def list_payments(
    db: DbSession,
    _user: CurrentUser,
    status_filter: Optional[str] = Query(default=None, alias="status"),
):
    """List payments. `status` may be: pending, paid, overdue."""
    stmt = select(Payment)
    if status_filter == "pending":
        stmt = stmt.where(Payment.status == "pending")
    elif status_filter == "paid":
        stmt = stmt.where(Payment.status == "paid")
    elif status_filter == "overdue":
        stmt = stmt.where(Payment.status == "pending", Payment.due_date < date.today())
    return db.scalars(stmt.order_by(Payment.due_date.asc())).all()


@router.get("/{payment_id}", response_model=PaymentRead)
def get_payment(payment_id: int, db: DbSession, _user: CurrentUser):
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    return payment


@router.post("/{payment_id}/pay", response_model=PaymentRead)
def mark_paid(
    payment_id: int,
    payload: PaymentMarkPaidRequest,
    db: DbSession,
    _user: CurrentUser,
):
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")

    payment.status = "paid"
    payment.paid_date = payload.paid_date or date.today()
    payment.payment_method = payload.payment_method
    payment.receipt_number = payload.receipt_number
    payment.notes = payload.notes

    _create_payment_splits(db, payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.put("/{payment_id}", response_model=PaymentRead)
def update_payment(
    payment_id: int,
    payload: PaymentUpdateRequest,
    db: DbSession,
    _user: CurrentUser,
):
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    payment.amount = payload.amount
    payment.due_date = payload.due_date
    payment.notes = payload.notes
    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(payment_id: int, db: DbSession, _user: Perm("payments", "delete")):
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    db.execute(delete(PaymentSplit).where(PaymentSplit.payment_id == payment.id))
    db.delete(payment)
    db.commit()


def _create_payment_splits(db, payment: Payment) -> None:
    """Auto-split a payment into owner share, management fee, agent fee, ejar fee."""
    db.execute(delete(PaymentSplit).where(PaymentSplit.payment_id == payment.id))

    unit = payment.contract.unit
    contract = payment.contract
    amount = payment.amount
    mgmt_pct = unit.management_percentage or 0
    agent_pct = contract.agent_percentage if contract.agent_percentage else (unit.agent_percentage or 0)

    mgmt_fee = round(amount * mgmt_pct / 100, 2)
    agent_fee = round(amount * agent_pct / 100, 2)
    ejar = round(unit.ejar_fee or 0, 2)
    owner_share = round(amount - mgmt_fee - agent_fee - ejar, 2)

    if mgmt_fee > 0:
        db.add(PaymentSplit(
            payment_id=payment.id, split_type="management_fee",
            amount=mgmt_fee, description=f"{mgmt_pct}% management fee",
        ))
    if agent_fee > 0:
        db.add(PaymentSplit(
            payment_id=payment.id, split_type="agent_fee",
            amount=agent_fee, description=f"{agent_pct}% agent fee ({unit.agent_name or ''})",
        ))
    if ejar > 0:
        db.add(PaymentSplit(
            payment_id=payment.id, split_type="ejar_fee",
            amount=ejar, description="Ejar platform fee",
        ))
    db.add(PaymentSplit(
        payment_id=payment.id, split_type="owner_share",
        amount=owner_share, description="Net amount to owner",
    ))
