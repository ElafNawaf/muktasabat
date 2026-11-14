"""Approvals inbox: everything waiting for a decision, in one place.

Each item is only listed for users who may act on it:
  - work_order  → maintenance.approve   (estimate above the owner's limit)
  - renewal     → contracts.approve     (renewal offer below current rent)
  - payout      → payments.approve      (tenant paid; owner's share due / overdue for transfer)

Workflow-driven items (maintenance cost, renewal offer, HR request, bank
change, expense) are listed only for whoever may decide their *current step*
(see api/services/workflows.py); decisions go through each module's
``workflow_decide`` via ``POST /approvals/{kind}/{id}/decision``.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from api.deps import CurrentUser, DbSession
from api.maintenance_models import WorkOrder, WorkOrderEvent
from api.models import Building, Contract, Owner, Payment, Unit
from api.permissions import has_permission
from api.renewal_models import LeaseRenewal, LeaseRenewalEvent
from api.routers.maintenance import _name
from api.routers.owner_portal import _pct
from api.services import workflows as wf

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


def _step(db, user, key: str, entity_id: int, ctx_fn, locale: str):
    """Current step of an item's chain and whether ``user`` may decide it.
    Returns None when the user can't act on it."""
    t = wf.ensure(db, key, entity_id, ctx_fn)
    if t is None:
        return None
    ok, behalf = wf.can_act(db, user, t)
    if not ok:
        return None
    steps = [x for x in wf.chain(db, key, entity_id) if x.status != "cancelled"]
    return {
        "workflow": key, "step": t.step_index + 1, "steps": len(steps),
        "step_label": wf.task_json(db, t, locale)["label"], "on_behalf": behalf,
        "waiting_on": "owner" if (t.approver or {}).get("type") == "owner" else "company",
        "due": _iso(t.due_at), "overdue": bool(t.due_at and t.due_at < datetime.utcnow()), "escalated": bool(t.escalated_at),
        "chain": [wf.task_json(db, x, locale) for x in steps],
    }


@router.get("")
def inbox(db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    today = date.today()
    items: list[dict] = []
    staff = user.role not in ("owner", "tenant")
    can = {
        "work_order": staff,
        "renewal": staff,
        "payout": has_permission(db, user, "payments", "approve"),
        "hr": staff,
        "bank": staff,
        "expense": staff,
        "form": bool(getattr(user, "is_super_admin", False)),
    }
    from api.routers import maintenance as m_r, renewals as r_r, hr as hr_r, expenses as e_r

    if can["work_order"]:
        for w in db.scalars(select(WorkOrder).where(WorkOrder.status == "awaiting_approval")).all():
            st = _step(db, user, "maintenance_cost", w.id, lambda w=w: m_r._wf_ctx(db, w), locale)
            if not st:
                continue
            since = db.scalar(select(WorkOrderEvent.at).where(WorkOrderEvent.work_order_id == w.id, WorkOrderEvent.action == "approval_requested").order_by(WorkOrderEvent.id.desc())) or w.updated_at
            where, owner, owner_id = _place(db, w.building_id, w.unit_id, locale)
            items.append({
                "kind": "work_order", "id": w.id, "ref": w.number, "title": w.title, "where": where, "owner": owner, "owner_id": owner_id,
                "amount": w.estimate_amount, "limit": w.approval_limit, "since": _iso(since),
                "urgent": w.priority in ("emergency", "high") or st["overdue"], "priority": w.priority,
                "href": f"maintenance?open={w.id}", **st,
            })

    if can["renewal"]:
        for r in db.scalars(select(LeaseRenewal).where(LeaseRenewal.stage == "awaiting_owner")).all():
            st = _step(db, user, "renewal_offer", r.id, lambda r=r: r_r._wf_ctx(db, r), locale)
            if not st:
                continue
            since = db.scalar(select(LeaseRenewalEvent.at).where(LeaseRenewalEvent.renewal_id == r.id, LeaseRenewalEvent.action == "owner_approval_requested").order_by(LeaseRenewalEvent.id.desc())) or r.updated_at
            c = db.get(Contract, r.contract_id)
            where, owner, owner_id = _place(db, r.building_id, r.unit_id, locale)
            items.append({
                "kind": "renewal", "id": r.id, "ref": c.contract_number if c else None,
                "title": None, "where": where, "owner": owner, "owner_id": owner_id,
                "amount": r.proposed_rent, "current": r.current_rent,
                "change_pct": round((r.proposed_rent - r.current_rent) / r.current_rent * 100, 1) if r.proposed_rent is not None and r.current_rent else None,
                "since": _iso(since), "urgent": (r.end_date - today).days <= 30 or st["overdue"],
                "days_left": (r.end_date - today).days, "href": f"renewals?open={r.id}", **st,
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

    if can["hr"]:
        from api.hr_models import HrRequest
        from api.models import User as _U

        for r in db.scalars(select(HrRequest).where(HrRequest.status == "pending", HrRequest.user_id != user.id)).all():
            st = _step(db, user, "hr_request", r.id, lambda r=r: hr_r._wf_ctx(r), locale)
            if not st:
                continue
            emp = db.get(_U, r.user_id)
            items.append({
                "kind": "hr", "id": r.id, "ref": r.number, "title": hr_r._uname(emp, locale), "where": hr_r._summary(r, locale), "owner": None, "owner_id": None,
                "hr_kind": r.kind, "amount": r.estimated_cost if r.kind == "ticket" else None, "reason": r.reason,
                "since": _iso(r.created_at),
                "urgent": bool(r.start_date and (r.start_date - today).days <= 2) or st["overdue"], "href": f"hr?open={r.id}", **st,
            })

    if can["bank"]:
        from api.hr_people_models import HrPersonal
        from api.models import User as _U
        from api.routers.hr_people import _mask

        for per in db.scalars(select(HrPersonal).where(HrPersonal.pending_iban.is_not(None), HrPersonal.user_id != user.id)).all():
            st = _step(db, user, "bank_change", per.user_id, lambda per=per: {"requester_id": per.user_id}, locale)
            if not st:
                continue
            emp = db.get(_U, per.user_id)
            items.append({
                "kind": "bank", "id": per.user_id, "ref": None, "title": hr_r._uname(emp, locale),
                "where": f"{per.pending_bank_name or ''} — {_mask(per.pending_iban)}", "owner": None, "owner_id": None,
                "amount": None, "since": _iso(per.pending_bank_at), "urgent": st["overdue"], "href": f"hr/people/{per.user_id}", **st,
            })

    if can["expense"]:
        from api.models import Expense

        for e in db.scalars(select(Expense).where(Expense.approval_status == "pending").execution_options(all_expenses=True)).all():
            st = _step(db, user, "expense", e.id, lambda e=e: e_r._ctx(e), locale)
            if not st:
                continue
            where, owner, owner_id = _place(db, e.building_id, e.unit_id, locale)
            desc = (e.description_en if locale == "en" else e.description_ar) or e.description
            items.append({
                "kind": "expense", "id": e.id, "ref": e.receipt_number, "title": desc, "where": where or (e.vendor_name or ""),
                "owner": owner, "owner_id": owner_id, "amount": e.amount, "category": e.category, "paid_by": e.paid_by,
                "vendor": e.vendor_name, "since": _iso(e.created_at), "urgent": st["overdue"], "href": f"expenses?open={e.id}", **st,
            })

    if can["form"]:
        from api.form_models import FormChangeRequest
        from api.routers.forms import ENTITIES as _FE

        for r in db.scalars(select(FormChangeRequest).where(FormChangeRequest.status == "pending")).all():
            e = _FE.get(r.entity, {})
            items.append({
                "kind": "form", "id": r.id, "ref": r.number, "title": (e.get("ar") if locale == "ar" else e.get("en")) or r.entity,
                "where": f"{len(r.changes or [])} " + ("تغيير" if locale == "ar" else "change(s)"), "owner": None, "owner_id": None,
                "requested_by": r.requested_by, "reason": r.reason, "since": _iso(r.created_at), "waiting_on": "company",
                "urgent": False, "href": f"forms?entity={r.entity}&request={r.id}",
            })

    if can["hr"]:
        from api.models import User as _U2
        from api.payroll_models import EmployeeLoan, PayrollRun, Payslip
        from api.routers.hr import _uname as _un
        from api.services.payroll import totals as _ptot

        for pr in db.scalars(select(PayrollRun).where(PayrollRun.status == "submitted", PayrollRun.submitted_by_id != user.id)).all():
            from api.hr_people_models import HrCompany as _C

            co = db.get(_C, pr.company_id)
            t = _ptot(db.scalars(select(Payslip).where(Payslip.run_id == pr.id)).all())
            items.append({
                "kind": "payroll", "id": pr.id, "ref": pr.month, "title": (co.name_ar if locale == "ar" else (co.name_en or co.name_ar)) if co else None,
                "where": f"{t['employees']} " + ("موظف" if locale == "ar" else "employees"), "owner": None, "owner_id": None,
                "amount": t["net"], "since": _iso(pr.submitted_at), "waiting_on": "company", "urgent": True, "href": f"hr/payroll/{pr.id}",
                "reason": pr.submitted_by,
            })
        for ln in db.scalars(select(EmployeeLoan).where(EmployeeLoan.status == "pending", EmployeeLoan.user_id != user.id)).all():
            items.append({
                "kind": "loan", "id": ln.id, "ref": ln.number, "title": _un(db.get(_U2, ln.user_id), locale),
                "where": (("سلفة" if ln.kind == "advance" else "قرض") if locale == "ar" else ln.kind.title()) + f" · {ln.installments}×",
                "owner": None, "owner_id": None, "amount": ln.amount, "reason": ln.reason, "since": _iso(ln.created_at),
                "waiting_on": "company", "urgent": False, "href": "hr?tab=payroll",
            })

    def sort_key(i: dict):
        return (not i["urgent"], i.get("since") or "")

    items.sort(key=sort_key)
    kinds = list(can) + ["payroll", "loan"]
    return {"items": items, "can": can, "counts": {k: sum(1 for i in items if i["kind"] == k) for k in kinds}}


class DecisionIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=1000)


@router.post("/{kind}/{item_id}/decision")
def decide(kind: str, item_id: int, payload: DecisionIn, db: DbSession, user: CurrentUser):
    """One endpoint for every workflow-driven approval (used by the inbox)."""
    from fastapi import HTTPException, status

    if kind == "work_order":
        from api.routers import maintenance as m_r

        res = m_r.workflow_decide(db, m_r._get(db, item_id), user, payload.approve, payload.note, m_r._actor(user))
    elif kind == "renewal":
        from api.routers import renewals as r_r

        r = db.get(LeaseRenewal, item_id)
        if not r:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
        res = r_r.workflow_decide(db, r, user, payload.approve, payload.note, r_r._actor(user))
    elif kind == "hr":
        from api.hr_models import HrRequest
        from api.routers import hr as hr_r

        r = db.get(HrRequest, item_id)
        if not r:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
        res = hr_r.workflow_decide(db, r, user, payload.approve, payload.note)
    elif kind == "bank":
        from api.routers.hr_people import workflow_decide_bank

        res = workflow_decide_bank(db, item_id, user, payload.approve, payload.note)
    elif kind == "expense":
        from api.routers import expenses as e_r

        res = e_r.workflow_decide(db, e_r._get(db, item_id), user, payload.approve, payload.note)
    else:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown approval kind")
    return {"ok": True, "result": res}


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
    if has_permission(db, user, "hr", "view"):
        from api.hr_models import HrRequest
        from api.routers.hr import _summary, _uname
        from api.models import User as _U

        for r in db.scalars(select(HrRequest).where(HrRequest.decided_at.is_not(None), HrRequest.decided_at >= since).order_by(HrRequest.decided_at.desc()).limit(200)).all():
            out.append({"kind": "hr", "id": r.id, "ref": r.number, "title": _uname(db.get(_U, r.user_id), locale), "where": _summary(r, locale), "owner": None,
                        "decision": "rejected" if r.status == "rejected" else "approved", "auto": False,
                        "by": _uname(db.get(_U, r.decided_by_id), locale) if r.decided_by_id else None, "note": r.decision_note,
                        "at": _iso(r.decided_at), "amount": None, "href": f"hr?open={r.id}"})
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
