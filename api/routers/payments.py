from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, select

from api.config import get_settings
from api.deps import AdminUser, CurrentUser, DbSession
from api.models import Payment, PaymentAlertLog, PaymentSplit
from api.permissions import Perm
from api.schemas.payment import (
    OwnerTransferRequest,
    PaymentAlertLogRead,
    PaymentMarkPaidRequest,
    PaymentRead,
    PaymentUpdateRequest,
)
from api.services import payment_alerts

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


@router.post("/alerts/run")
def run_payment_alerts(
    db: DbSession,
    _admin: AdminUser,
    dry_run: bool = Query(default=True),
    on: Optional[date] = Query(default=None, description="Pretend today is this date (dry runs only)"),
):
    """Admin: see (dry_run=true, default) or send the payment alerts due today.
    The hourly scheduler does this automatically; this is for checking it."""
    if on is not None and not dry_run:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "`on` is only allowed with dry_run=true")
    return {
        "today": (on or payment_alerts.riyadh_today()).isoformat(),
        "cc": payment_alerts.ceo_cc(),
        "alerts": payment_alerts.run_alerts(db, today=on, dry_run=dry_run),
    }


@router.get("/{payment_id}/alerts", response_model=list[PaymentAlertLogRead])
def payment_alert_history(payment_id: int, db: DbSession, _user: CurrentUser):
    return db.scalars(
        select(PaymentAlertLog)
        .where(PaymentAlertLog.payment_id == payment_id)
        .order_by(PaymentAlertLog.sent_at.desc())
    ).all()


@router.post("/{payment_id}/owner-transfer", response_model=PaymentRead)
def mark_owner_transferred(
    payment_id: int,
    payload: OwnerTransferRequest,
    db: DbSession,
    _user: CurrentUser,
):
    """Record that the owner's share of this instalment was transferred.
    Stops the owner-payout reminders and sends a confirmation."""
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    if payment.status != "paid":
        raise HTTPException(status.HTTP_409_CONFLICT, "The tenant has not paid this instalment yet")
    payment.owner_transferred_date = payload.transferred_date or date.today()
    payment.owner_transfer_reference = payload.reference
    db.commit()
    payment_alerts.notify_owner_transferred(db, payment.id)
    db.refresh(payment)
    return payment


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
    # حصة المالك تُحوَّل خلال OWNER_TRANSFER_DAYS من تاريخ التحصيل
    payment.owner_transfer_due_date = payment.paid_date + timedelta(
        days=get_settings().owner_transfer_days
    )

    _create_payment_splits(db, payment)
    db.commit()
    payment_alerts.notify_payment_received(db, payment.id)
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
    split = payment_alerts.compute_split(payment)
    mgmt_pct, agent_pct = split.management_pct, split.agent_pct
    agent_label = ""
    if contract.agent_id and contract.agent is not None:
        agent_label = contract.agent.name
    elif unit.agent_name:
        agent_label = unit.agent_name

    mgmt_fee, agent_fee, ejar = split.management_fee, split.agent_fee, split.ejar_fee
    owner_share = split.owner_share

    if mgmt_fee > 0:
        db.add(PaymentSplit(
            payment_id=payment.id, split_type="management_fee",
            amount=mgmt_fee, description=f"{mgmt_pct}% management fee",
        ))
    if agent_fee > 0:
        db.add(PaymentSplit(
            payment_id=payment.id, split_type="agent_fee",
            amount=agent_fee, description=f"{agent_pct}% agent fee ({agent_label})",
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
