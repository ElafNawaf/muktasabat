"""Row previews for the Payments, Collections and Contracts tables.

* ``/payments/{id}/preview``  — the instalment, its money split, evidence, owner payout,
                                tenant report, alerts sent and its place in the schedule
* ``/contracts/{id}/preview`` — the lease: parties, amounts, schedule with states,
                                collected / remaining / overdue, attachments, renewal
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.deps import DbSession
from api.i18n import localized_value
from api.models import Contract, Payment, PaymentAlertLog, Unit
from api.permissions import Perm

router = APIRouter(tags=["previews"])


def r2(x) -> float:
    return round(float(x or 0), 2)


def _iso(d) -> Optional[str]:
    return d.isoformat() if d else None


def _state(p: Payment, today: date) -> str:
    if (p.status or "") == "paid":
        return "paid"
    if p.due_date < today:
        return "overdue"
    if p.due_date <= today + timedelta(days=14):
        return "due_soon"
    return "upcoming"


def _payout(p: Payment, today: date) -> str:
    if (p.status or "") != "paid":
        return "not_paid"
    if p.owner_transferred_date:
        return "transferred"
    if p.owner_transfer_due_date and p.owner_transfer_due_date < today:
        return "late"
    return "pending"


def _party(obj, locale: str) -> Optional[dict]:
    if obj is None:
        return None
    return {"id": obj.id, "name": localized_value(obj, "name", locale) or obj.name, "phone": getattr(obj, "phone", None), "email": getattr(obj, "email", None)}


def _load_contract(db, contract_id: int) -> Contract:
    c = db.scalar(
        select(Contract)
        .where(Contract.id == contract_id)
        .options(
            selectinload(Contract.payments).selectinload(Payment.splits),
            selectinload(Contract.attachments),
            selectinload(Contract.tenant),
            selectinload(Contract.agent),
            selectinload(Contract.unit).selectinload(Unit.building),
        )
    )
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    return c


def _contract_head(c: Contract, locale: str, today: date) -> dict:
    u = c.unit
    b = u.building if u else None
    owner = b.owner if b else None
    return {
        "id": c.id, "contract_number": c.contract_number, "ejar_contract_number": c.ejar_contract_number,
        "contract_type": c.contract_type, "status": c.status, "ejar_status": c.ejar_status,
        "start_date": _iso(c.start_date), "end_date": _iso(c.end_date), "days_left": (c.end_date - today).days,
        "tenant": _party(c.tenant, locale), "owner": _party(owner, locale), "agent": _party(c.agent, locale),
        "building": None if b is None else {"id": b.id, "name": localized_value(b, "name", locale) or b.name},
        "unit": None if u is None else {"id": u.id, "number": u.number},
    }


def _schedule(c: Contract, today: date) -> list[dict]:
    pays = sorted(c.payments, key=lambda p: (p.due_date, p.id))
    return [
        {"id": p.id, "seq": i + 1, "due_date": _iso(p.due_date), "paid_date": _iso(p.paid_date), "amount": r2(p.amount),
         "state": _state(p, today), "receipt_number": p.receipt_number, "has_receipt": bool(p.receipt_url)}
        for i, p in enumerate(pays)
    ]


@router.get("/payments/{payment_id}/preview")
def payment_preview(payment_id: int, db: DbSession, _u: Perm("payments", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    p = db.get(Payment, payment_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    today = date.today()
    c = _load_contract(db, p.contract_id)
    sched = _schedule(c, today)
    seq = next((s["seq"] for s in sched if s["id"] == p.id), None)
    split = {s.split_type: r2(s.amount) for s in p.splits}
    if not split:
        # Not split yet (unpaid): show what the split will be.
        from api.routers.owner_portal import _pct

        u = c.unit
        amt = float(p.amount or 0)
        first = sched and sched[0]["id"] == p.id
        mg = amt * _pct(c.management_percentage, u.management_percentage if u else 0) / 100
        ag = amt * _pct(c.agent_percentage, u.agent_percentage if u else 0) / 100
        ej = float(c.ejar_registration_fee or (u.ejar_fee if u else 0) or 0) if first else 0.0
        split = {"management_fee": r2(mg), "agent_fee": r2(ag), "ejar_fee": r2(ej), "owner_share": r2(amt - mg - ag - ej), "_estimated": True}
    report = None
    try:
        from api.tenant_portal_models import PaymentReport

        rep = db.scalar(select(PaymentReport).where(PaymentReport.payment_id == p.id).order_by(PaymentReport.id.desc()))
        if rep is not None:
            report = {"status": rep.status, "paid_on": _iso(rep.paid_on), "amount": r2(rep.amount), "method": rep.method, "reference": rep.reference,
                      "note": rep.note, "receipt_url": rep.receipt_url, "receipt_name": rep.receipt_name, "sent_at": rep.created_at.isoformat(),
                      "review_note": rep.review_note}
    except Exception:  # noqa: BLE001
        report = None
    alerts = db.scalars(select(PaymentAlertLog).where(PaymentAlertLog.payment_id == p.id).order_by(PaymentAlertLog.sent_at.desc()).limit(12)).all()
    return {
        "id": p.id, "amount": r2(p.amount), "due_date": _iso(p.due_date), "paid_date": _iso(p.paid_date), "status": p.status,
        "state": _state(p, today), "days": (p.due_date - today).days, "method": p.payment_method, "receipt_number": p.receipt_number,
        "receipt_url": p.receipt_url, "receipt_name": p.receipt_name, "notes": p.notes,
        "seq": seq, "of": len(sched),
        "split": split,
        "payout": {
            "state": _payout(p, today), "due_date": _iso(p.owner_transfer_due_date), "date": _iso(p.owner_transferred_date),
            "reference": p.owner_transfer_reference, "receipt_url": p.owner_transfer_receipt_url, "receipt_name": p.owner_transfer_receipt_name,
        },
        "report": report,
        "alerts": [{"kind": a.kind, "stage": a.stage, "delivered": a.delivered, "sent_at": a.sent_at.isoformat()} for a in alerts],
        "contract": _contract_head(c, locale, today),
        "schedule": sched,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("/contracts/{contract_id}/preview")
def contract_preview(contract_id: int, db: DbSession, _u: Perm("contracts", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    today = date.today()
    c = _load_contract(db, contract_id)
    sched = _schedule(c, today)
    paid = sum(s["amount"] for s in sched if s["state"] == "paid")
    over = [s for s in sched if s["state"] == "overdue"]
    nxt = next((s for s in sched if s["state"] != "paid"), None)
    total_days = max((c.end_date - c.start_date).days, 1)
    elapsed = min(100, max(0, round(100 * (today - c.start_date).days / total_days)))
    renewal = None
    try:
        from api.renewal_models import LeaseRenewal

        rn = db.scalar(select(LeaseRenewal).where(LeaseRenewal.contract_id == c.id))
        if rn is not None:
            renewal = {"id": rn.id, "stage": rn.stage, "tenant_intent": rn.tenant_intent, "proposed_rent": rn.proposed_rent,
                       "new_contract_number": rn.new_contract_number}
    except Exception:  # noqa: BLE001
        renewal = None
    u = c.unit
    return {
        **_contract_head(c, locale, today),
        "validity_type": c.validity_type, "payment_type": c.payment_type, "payment_count": c.payment_count, "payment_cycle": c.payment_cycle,
        "elapsed_pct": elapsed,
        "amounts": {
            "rent_annual": r2(c.rent_amount), "total_rent": r2(c.total_rent_amount), "services": r2(c.services_amount),
            "insurance": r2(c.insurance_amount), "vat_rate": c.vat_rate, "vat": r2(c.vat_amount), "total": r2(c.total_amount),
            "electricity": r2(c.electricity_amount), "water": r2(c.water_amount),
            "electricity_on_tenant": c.electricity_on_tenant, "water_on_tenant": c.water_on_tenant,
            "management_pct": c.management_percentage or (u.management_percentage if u else 0),
            "agent_pct": c.agent_percentage or (u.agent_percentage if u else 0),
            "ejar_fee": r2(c.ejar_registration_fee),
        },
        "collected": r2(paid),
        "scheduled": r2(sum(s["amount"] for s in sched)),
        "remaining": r2(sum(s["amount"] for s in sched if s["state"] != "paid")),
        "overdue": r2(sum(s["amount"] for s in over)),
        "overdue_count": len(over),
        "next": nxt,
        "schedule": sched,
        "attachments": [{"id": a.id, "url": a.url, "name": a.filename, "type": a.file_type} for a in sorted(c.attachments, key=lambda a: a.sort_order)],
        "renewal": renewal,
        "notes": c.notes,
        "meters": {"electricity": c.electricity_meter_number, "water": c.water_meter_number},
    }
