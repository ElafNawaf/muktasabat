"""Approvals inbox: everything waiting for a decision, in one place.

Each item is only listed for users who may act on it:
  - work_order  → maintenance.approve   (estimate above the owner's limit)
  - renewal     → contracts.approve     (renewal offer below current rent)
  - payout      → payments.approve      (tenant paid; owner's share due / overdue for transfer)

Decisions are made through the existing endpoints of each module, so rules,
emails and activity logs stay in one place. This router only reads.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Query
from sqlalchemy import select

from api.deps import CurrentUser, DbSession
from api.maintenance_models import WorkOrder, WorkOrderEvent
from api.models import Building, Contract, Owner, Payment, Unit
from api.permissions import has_permission
from api.renewal_models import LeaseRenewal, LeaseRenewalEvent
from api.routers.maintenance import _name
from api.routers.owner_portal import _pct

router = APIRouter(prefix="/approvals", tags=["approvals"])

PAYOUT_HORIZON_DAYS = 7  # also show payouts falling due within a week


def _place(db, building_id: Optional[int], unit_id: Optional[int], locale: str) -> tuple[str, Optional[str], Optional[int]]:
    b = db.get(Building, building_id) if building_id else None
    u = db.get(Unit, unit_id) if unit_id else None
    owner = db.get(Owner, b.owner_id) if b and b.owner_id else None
    where = _name(b, locale) if b else ""
    if u:
        where += f" · {u.number or _name(u, locale)}"
    return where, (_name(owner, locale) if owner else None), (owner.id if owner else None)


def _iso(x) -> Optional[str]:
    return x.isoformat() if x else None


@router.get("")
def inbox(db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    today = date.today()
    items: list[dict] = []
    can = {
        "work_order": has_permission(db, user, "maintenance", "approve"),
        "renewal": has_permission(db, user, "contracts", "approve"),
        "payout": has_permission(db, user, "payments", "approve"),
    }

    if can["work_order"]:
        for w in db.scalars(select(WorkOrder).where(WorkOrder.status == "awaiting_approval")).all():
            since = db.scalar(select(WorkOrderEvent.at).where(WorkOrderEvent.work_order_id == w.id, WorkOrderEvent.action == "approval_requested").order_by(WorkOrderEvent.id.desc())) or w.updated_at
            where, owner, owner_id = _place(db, w.building_id, w.unit_id, locale)
            items.append({
                "kind": "work_order", "id": w.id, "ref": w.number, "title": w.title, "where": where, "owner": owner, "owner_id": owner_id,
                "amount": w.estimate_amount, "limit": w.approval_limit, "since": _iso(since),
                "waiting_on": "owner", "urgent": w.priority in ("emergency", "high"), "priority": w.priority,
                "href": f"maintenance?open={w.id}",
            })

    if can["renewal"]:
        for r in db.scalars(select(LeaseRenewal).where(LeaseRenewal.stage == "awaiting_owner")).all():
            since = db.scalar(select(LeaseRenewalEvent.at).where(LeaseRenewalEvent.renewal_id == r.id, LeaseRenewalEvent.action == "owner_approval_requested").order_by(LeaseRenewalEvent.id.desc())) or r.updated_at
            c = db.get(Contract, r.contract_id)
            where, owner, owner_id = _place(db, r.building_id, r.unit_id, locale)
            items.append({
                "kind": "renewal", "id": r.id, "ref": c.contract_number if c else None,
                "title": None, "where": where, "owner": owner, "owner_id": owner_id,
                "amount": r.proposed_rent, "current": r.current_rent,
                "change_pct": round((r.proposed_rent - r.current_rent) / r.current_rent * 100, 1) if r.proposed_rent is not None and r.current_rent else None,
                "since": _iso(since), "waiting_on": "owner", "urgent": (r.end_date - today).days <= 30,
                "days_left": (r.end_date - today).days, "href": f"renewals?open={r.id}",
            })

    if can["payout"]:
        q = select(Payment).where(
            Payment.status == "paid", Payment.owner_transferred_date.is_(None),
            Payment.owner_transfer_due_date.is_not(None),
            Payment.owner_transfer_due_date <= today + timedelta(days=PAYOUT_HORIZON_DAYS),
        )
        for p in db.scalars(q).all():
            c = db.get(Contract, p.contract_id)
            u = db.get(Unit, c.unit_id) if c else None
            where, owner, owner_id = _place(db, u.building_id if u else None, u.id if u else None, locale)
            fee_pct = (_pct(c.management_percentage, u.management_percentage) + _pct(c.agent_percentage, u.agent_percentage)) if c and u else 0
            items.append({
                "kind": "payout", "id": p.id, "ref": c.contract_number if c else None, "title": None,
                "where": where, "owner": owner, "owner_id": owner_id,
                "amount": round(float(p.amount or 0) * (1 - fee_pct / 100), 2), "gross": p.amount,
                "since": _iso(p.paid_date), "due": _iso(p.owner_transfer_due_date),
                "days_late": (today - p.owner_transfer_due_date).days,
                "waiting_on": "company", "urgent": p.owner_transfer_due_date < today, "href": "payments",
            })

    def sort_key(i: dict):
        return (not i["urgent"], i.get("since") or "")

    items.sort(key=sort_key)
    return {"items": items, "can": can, "counts": {k: sum(1 for i in items if i["kind"] == k) for k in can}}


@router.get("/history")
def history(db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$"), days: int = Query(30, ge=1, le=365)):
    """Audit trail of recent decisions across modules."""
    since = datetime.utcnow() - timedelta(days=days)
    out: list[dict] = []
    if has_permission(db, user, "maintenance", "view"):
        for e in db.scalars(select(WorkOrderEvent).where(WorkOrderEvent.at >= since, WorkOrderEvent.action.in_(["approved", "rejected", "auto_approved"])).order_by(WorkOrderEvent.id.desc()).limit(200)).all():
            w = db.get(WorkOrder, e.work_order_id)
            if not w:
                continue
            where, owner, _ = _place(db, w.building_id, w.unit_id, locale)
            out.append({"kind": "work_order", "id": w.id, "ref": w.number, "title": w.title, "where": where, "owner": owner,
                        "decision": "approved" if e.action != "rejected" else "rejected", "auto": e.action == "auto_approved",
                        "by": e.actor, "note": e.note, "at": _iso(e.at), "amount": w.estimate_amount, "href": f"maintenance?open={w.id}"})
    if has_permission(db, user, "contracts", "view"):
        for e in db.scalars(select(LeaseRenewalEvent).where(LeaseRenewalEvent.at >= since, LeaseRenewalEvent.action.in_(["owner_approved", "owner_rejected"])).order_by(LeaseRenewalEvent.id.desc()).limit(200)).all():
            r = db.get(LeaseRenewal, e.renewal_id)
            if not r:
                continue
            c = db.get(Contract, r.contract_id)
            where, owner, _ = _place(db, r.building_id, r.unit_id, locale)
            out.append({"kind": "renewal", "id": r.id, "ref": c.contract_number if c else None, "title": None, "where": where, "owner": owner,
                        "decision": "approved" if e.action == "owner_approved" else "rejected", "auto": False,
                        "by": e.actor, "note": e.note, "at": _iso(e.at), "amount": r.proposed_rent, "href": f"renewals?open={r.id}"})
    if has_permission(db, user, "payments", "view"):
        cutoff = (date.today() - timedelta(days=days))
        for p in db.scalars(select(Payment).where(Payment.owner_transferred_date.is_not(None), Payment.owner_transferred_date >= cutoff).order_by(Payment.owner_transferred_date.desc()).limit(200)).all():
            c = db.get(Contract, p.contract_id)
            u = db.get(Unit, c.unit_id) if c else None
            where, owner, _ = _place(db, u.building_id if u else None, u.id if u else None, locale)
            late = (p.owner_transferred_date - p.owner_transfer_due_date).days if p.owner_transfer_due_date else 0
            out.append({"kind": "payout", "id": p.id, "ref": c.contract_number if c else None, "title": None, "where": where, "owner": owner,
                        "decision": "transferred", "auto": False, "by": None, "note": p.owner_transfer_reference,
                        "at": _iso(p.owner_transferred_date), "amount": p.amount, "days_late": late, "href": "payments"})
    out.sort(key=lambda x: x["at"] or "", reverse=True)
    return out[:300]
