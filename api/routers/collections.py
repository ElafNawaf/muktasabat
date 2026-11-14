"""Collections worklist (التحصيل): overdue and soon-due instalments with an action log.

Staff log what they did on each unpaid instalment — call, WhatsApp reminder,
visit, a promise to pay (date + amount), a dispute, or an escalation to the
manager. A promise whose date passes while the instalment is still unpaid is
"broken" and floats to the top. Emails before/after due dates are already
sent by api/services/payment_alerts.py; this is the human side of collection.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Date, Float, ForeignKey, Integer, String, Text, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from api.database import Base
from api.deps import DbSession
from api.models import Building, Contract, Owner, Payment, Tenant, Unit, User
from api.permissions import Perm
from api.routers.maintenance import _base, _mail, _name

router = APIRouter(prefix="/collections", tags=["collections"])

UPCOMING_DAYS = 7
ActionKind = Literal["call", "no_answer", "whatsapp", "visit", "promise", "dispute", "escalate", "note"]


class CollectionAction(Base):
    __tablename__ = "collection_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    actor: Mapped[Optional[str]] = mapped_column(String(160))
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)
    promise_date: Mapped[Optional[date]] = mapped_column(Date)
    promise_amount: Mapped[Optional[float]] = mapped_column(Float)


def _bucket(days_overdue: int) -> str:
    if days_overdue <= 0:
        return "upcoming"
    if days_overdue <= 30:
        return "d1_30"
    if days_overdue <= 60:
        return "d31_60"
    if days_overdue <= 90:
        return "d61_90"
    return "d90p"


def _actor(u: User) -> str:
    return getattr(u, "full_name", None) or u.username


def _unpaid(db: Session, today: date) -> list[Payment]:
    return db.scalars(
        select(Payment).where(
            Payment.status.in_(["pending", "overdue"]),
            Payment.due_date <= today + timedelta(days=UPCOMING_DAYS),
        ).order_by(Payment.due_date)
    ).all()


def _row(db: Session, p: Payment, today: date, locale: str, acts: list[CollectionAction]) -> dict:
    c = db.get(Contract, p.contract_id)
    u = db.get(Unit, c.unit_id) if c else None
    b = db.get(Building, u.building_id) if u else None
    t = db.get(Tenant, c.tenant_id) if c and c.tenant_id else None
    a = db.get(User, b.assignee_id) if b and b.assignee_id else None
    days = (today - p.due_date).days
    promises = [x for x in acts if x.kind == "promise" and x.promise_date]
    last_promise = promises[-1] if promises else None
    promise_state = None
    if last_promise:
        promise_state = "broken" if last_promise.promise_date < today else "today" if last_promise.promise_date == today else "pending"
    last = acts[-1] if acts else None
    return {
        "payment_id": p.id, "contract_id": c.id if c else None, "contract_number": c.contract_number if c else None,
        "amount": p.amount, "due_date": p.due_date.isoformat(), "days_overdue": days, "bucket": _bucket(days),
        "tenant_id": t.id if t else None, "tenant": _name(t, locale) if t else None, "tenant_phone": t.phone if t else None,
        "building_id": b.id if b else None, "building": _name(b, locale) if b else None,
        "unit": (u.number or _name(u, locale)) if u else None,
        "owner_id": b.owner_id if b else None, "owner": _name(db.get(Owner, b.owner_id), locale) if b and b.owner_id else None,
        "assignee_id": a.id if a else None, "assignee": _actor(a) if a else None,
        "actions": len(acts), "last_action": last.kind if last else None, "last_action_at": last.at.isoformat() if last else None,
        "promise_date": last_promise.promise_date.isoformat() if last_promise else None,
        "promise_amount": last_promise.promise_amount if last_promise else None, "promise_state": promise_state,
        "escalated": any(x.kind == "escalate" for x in acts), "disputed": any(x.kind == "dispute" for x in acts),
    }


def _acts_by_payment(db: Session, ids: list[int]) -> dict[int, list[CollectionAction]]:
    out: dict[int, list[CollectionAction]] = {i: [] for i in ids}
    if ids:
        for x in db.scalars(select(CollectionAction).where(CollectionAction.payment_id.in_(ids)).order_by(CollectionAction.id)).all():
            out[x.payment_id].append(x)
    return out


@router.get("")
def worklist(db: DbSession, _u: Perm("payments", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    today = date.today()
    pays = _unpaid(db, today)
    acts = _acts_by_payment(db, [p.id for p in pays])
    rows = [_row(db, p, today, locale, acts[p.id]) for p in pays]
    rank = {"broken": 0, "today": 1}
    rows.sort(key=lambda r: (rank.get(r["promise_state"] or "", 2), -r["days_overdue"]))
    return rows


@router.get("/stats")
def stats(db: DbSession, _u: Perm("payments", "view")):
    today = date.today()
    pays = _unpaid(db, today)
    acts = _acts_by_payment(db, [p.id for p in pays])
    buckets = {k: {"count": 0, "amount": 0.0} for k in ("upcoming", "d1_30", "d31_60", "d61_90", "d90p")}
    broken = due_today = untouched = 0
    for p in pays:
        d = (today - p.due_date).days
        k = _bucket(d)
        buckets[k]["count"] += 1
        buckets[k]["amount"] += float(p.amount or 0)
        pr = [x for x in acts[p.id] if x.kind == "promise" and x.promise_date]
        if pr:
            if pr[-1].promise_date < today:
                broken += 1
            elif pr[-1].promise_date == today:
                due_today += 1
        if d > 0 and not acts[p.id]:
            untouched += 1
    month_start = today.replace(day=1)
    due_month = db.scalars(select(Payment).where(Payment.due_date >= month_start, Payment.due_date <= today)).all()
    collected = sum(float(p.amount or 0) for p in due_month if p.status == "paid")
    due_total = sum(float(p.amount or 0) for p in due_month)
    for v in buckets.values():
        v["amount"] = round(v["amount"], 2)
    overdue = sum(v["amount"] for k, v in buckets.items() if k != "upcoming")
    return {
        "buckets": buckets, "overdue_amount": round(overdue, 2),
        "overdue_count": sum(v["count"] for k, v in buckets.items() if k != "upcoming"),
        "broken_promises": broken, "promises_today": due_today, "untouched_overdue": untouched,
        "collection_rate_month": round(collected / due_total * 100, 1) if due_total else None,
        "collected_month": round(collected, 2),
    }


@router.get("/{payment_id}/actions")
def list_actions(payment_id: int, db: DbSession, _u: Perm("payments", "view")):
    return [
        {"id": x.id, "at": x.at.isoformat(), "actor": x.actor, "kind": x.kind, "note": x.note,
         "promise_date": x.promise_date.isoformat() if x.promise_date else None, "promise_amount": x.promise_amount}
        for x in db.scalars(select(CollectionAction).where(CollectionAction.payment_id == payment_id).order_by(CollectionAction.id.desc())).all()
    ]


class ActionIn(BaseModel):
    kind: ActionKind
    note: Optional[str] = Field(default=None, max_length=2000)
    promise_date: Optional[date] = None
    promise_amount: Optional[float] = Field(default=None, ge=0, le=100_000_000)


@router.post("/{payment_id}/actions", status_code=status.HTTP_201_CREATED)
def add_action(payment_id: int, payload: ActionIn, db: DbSession, user: Perm("payments", "edit")):
    p = db.get(Payment, payment_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    if payload.kind == "promise":
        if not payload.promise_date:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A promise needs a date.")
        if payload.promise_date < date.today():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The promise date can't be in the past.")
    x = CollectionAction(payment_id=p.id, actor=_actor(user), user_id=user.id, kind=payload.kind, note=payload.note,
                         promise_date=payload.promise_date, promise_amount=payload.promise_amount or (p.amount if payload.kind == "promise" else None))
    db.add(x)
    db.commit()
    if payload.kind == "escalate":
        _escalate(db, p, user, payload.note)
    return {"ok": True, "id": x.id}


def _escalate(db: Session, p: Payment, user: User, note: Optional[str]) -> None:
    """Email the payment-alerts Cc (the CEO) — the person staff escalate to."""
    from html import escape

    from api.services.payment_alerts import ceo_cc

    c = db.get(Contract, p.contract_id)
    days = (date.today() - p.due_date).days
    for to in ceo_cc():
        _mail(
            to, f"تصعيد تحصيل {c.contract_number if c else ''} | Collection escalated {c.contract_number if c else ''}",
            f"<p>صعّد {escape(_actor(user))} دفعة متأخرة {days} يومًا بمبلغ <strong>{p.amount:,.0f} ر.س</strong>.</p>" + (f"<p>{escape(note)}</p>" if note else ""),
            f"<p>{escape(_actor(user))} escalated an instalment {days} days overdue, <strong>SAR {p.amount:,.0f}</strong>.</p>" + (f"<p>{escape(note)}</p>" if note else ""),
            f"{_base()}/ar/collections?open={p.id}", "فتح التحصيل", "Open collections",
        )
