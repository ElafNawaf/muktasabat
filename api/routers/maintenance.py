"""Maintenance work orders: intake → assignment → estimate → approval → work → completion.

Staff endpoints are under /maintenance (module `maintenance`); owners decide on
jobs that need their approval from the owner portal (/owner-portal/work-orders).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from html import escape
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.config import get_settings
from api.deps import CurrentUser, DbSession
from api.email import EmailMessage, _branded, _button, send_email
from api.maintenance_models import WorkOrder, WorkOrderAttachment, WorkOrderEvent, WorkOrderTenant
from api.models import Building, Contract, Expense, ManagementContract, ManagementContractProperty, Owner, OwnerUser, Tenant, Unit, User
from api.permissions import Perm, has_permission

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/maintenance", tags=["maintenance"])
owner_router = APIRouter(prefix="/owner-portal/work-orders", tags=["owner-portal"])
tenant_router = APIRouter(prefix="/tenant-portal/maintenance", tags=["tenant-portal"])

# What the tenant / owner may see in a job's history (staff-only notes and
# internal edits stay internal). "reply" = a staff note shared with them.
TENANT_EVENTS = {"created", "assigned", "approval_requested", "approved", "auto_approved", "rejected", "started",
                 "completed", "closed", "cancelled", "reply", "tenant_note", "owner_note", "reopened", "tenant_confirmed"}
OWNER_EVENTS = TENANT_EVENTS | {"estimated", "expense_posted"}
MAX_PHOTOS = 5
PHOTO_MAX_BYTES = 10 * 1024 * 1024

DEFAULT_LIMIT = 1000.0  # SAR pre-authorised when the management contract sets no limit
SLA_HOURS = {"emergency": 4, "high": 24, "normal": 72, "low": 168}
OPEN = {"new", "assigned", "awaiting_approval", "approved", "in_progress"}

Category = Literal["plumbing", "electrical", "ac", "carpentry", "painting", "cleaning", "pest", "appliances", "structural", "elevator", "fire_safety", "other"]
Priority = Literal["emergency", "high", "normal", "low"]
ChargeTo = Literal["owner", "tenant", "company"]


# ───────────────────────── helpers ─────────────────────────


def _name(obj, locale: str = "ar") -> str:
    if obj is None:
        return ""
    for f in (f"name_{locale}", "name", "name_en", "name_ar"):
        v = getattr(obj, f, None)
        if v:
            return str(v)
    return f"#{obj.id}"


def _limit_for(db: Session, building: Building) -> float:
    mc = db.scalar(
        select(ManagementContract)
        .join(ManagementContractProperty, ManagementContractProperty.management_contract_id == ManagementContract.id)
        .where(ManagementContractProperty.building_id == building.id, ManagementContract.status == "active")
        .order_by(ManagementContract.id.desc())
    )
    if mc is not None and (mc.maintenance_limit_amount or 0) > 0:
        return float(mc.maintenance_limit_amount)
    return DEFAULT_LIMIT


def _log(wo: WorkOrder, actor: str | None, action: str, note: str | None = None) -> None:
    wo.events.append(WorkOrderEvent(actor=actor, action=action, note=(note or None)))


def _sla_state(wo: WorkOrder, now: datetime | None = None) -> str:
    now = now or datetime.utcnow()
    if wo.status not in OPEN or wo.due_at is None:
        return "done" if wo.status in {"completed", "closed"} else "none"
    if now > wo.due_at:
        return "breached"
    if now > wo.due_at - (wo.due_at - wo.created_at) * 0.25:
        return "at_risk"
    return "on_track"


def _out(db: Session, wo: WorkOrder, locale: str, detail: bool = False) -> dict:
    b = db.get(Building, wo.building_id)
    u = db.get(Unit, wo.unit_id) if wo.unit_id else None
    a = db.get(User, wo.assignee_id) if wo.assignee_id else None
    d = {
        "id": wo.id, "number": wo.number, "title": wo.title, "description": wo.description,
        "category": wo.category, "priority": wo.priority, "status": wo.status,
        "building_id": wo.building_id, "building": _name(b, locale), "unit_id": wo.unit_id,
        "unit": (u.number or _name(u, locale)) if u else None,
        "owner_id": b.owner_id if b else None, "owner": _name(db.get(Owner, b.owner_id), locale) if b and b.owner_id else None,
        "reported_by": wo.reported_by, "reporter_name": wo.reporter_name, "reporter_phone": wo.reporter_phone,
        "assignee_id": wo.assignee_id, "assignee": (getattr(a, "full_name", None) or a.username) if a else None,
        "vendor_name": wo.vendor_name, "vendor_phone": wo.vendor_phone,
        "estimate_amount": wo.estimate_amount, "actual_cost": wo.actual_cost, "charge_to": wo.charge_to,
        "approval_limit": wo.approval_limit, "approval_required": wo.approval_required,
        "approved_by": wo.approved_by, "approved_at": wo.approved_at, "decision_note": wo.decision_note,
        "due_at": wo.due_at, "scheduled_for": wo.scheduled_for, "started_at": wo.started_at,
        "completed_at": wo.completed_at, "closed_at": wo.closed_at, "resolution": wo.resolution,
        "rating": wo.rating, "expense_id": wo.expense_id, "created_at": wo.created_at, "updated_at": wo.updated_at,
        "sla": _sla_state(wo),
    }
    link = db.scalar(select(WorkOrderTenant).where(WorkOrderTenant.work_order_id == wo.id))
    d["tenant_request"] = None if link is None else {
        "tenant_id": link.tenant_id, "preferred_time": link.preferred_time, "allow_entry": link.allow_entry,
    }
    if detail:
        d["events"] = [{"at": e.at, "actor": e.actor, "action": e.action, "note": e.note} for e in wo.events]
        d["attachments"] = [
            {"id": a.id, "url": a.url, "name": a.name, "content_type": a.content_type, "source": a.source, "by": a.uploaded_by, "at": a.at}
            for a in db.scalars(select(WorkOrderAttachment).where(WorkOrderAttachment.work_order_id == wo.id).order_by(WorkOrderAttachment.id)).all()
        ]
    return d


def _public(db: Session, wo: WorkOrder, locale: str, audience: str) -> dict:
    """The job as a tenant or owner sees it: no staff contacts, a filtered history."""
    d = _out(db, wo, locale, detail=True)
    keep = TENANT_EVENTS if audience == "tenant" else OWNER_EVENTS
    staff_label = "فريق الصيانة" if locale == "ar" else "Maintenance team"
    ev = []
    for e in d["events"]:
        if e["action"] not in keep:
            continue
        actor = e["actor"] or ""
        if not (actor.startswith("owner:") or actor.startswith("tenant:") or actor == "system"):
            actor = staff_label
        note = e["note"]
        if e["action"] in {"assigned", "approval_requested", "auto_approved", "expense_posted"}:
            note = None  # internal detail (who / limits / ids)
        elif e["action"] == "estimated" and note:
            note = note.split(" — ", 1)[1] if " — " in note else None  # amount is shown in the details card
        elif audience == "tenant" and e["action"] == "completed" and note and wo.charge_to != "tenant":
            note = note.split(" — ", 1)[1] if " — " in note else None  # cost is between us and the owner
        ev.append({**e, "actor": actor, "note": note})
    d["events"] = ev
    for k in ("reporter_phone", "vendor_phone", "assignee_id", "assignee", "created_by_id", "expense_id"):
        d.pop(k, None)
    if audience == "tenant":
        for k in ("estimate_amount", "approval_limit", "approval_required", "owner", "owner_id", "approved_by", "charge_to"):
            d.pop(k, None)
        if wo.charge_to == "tenant":
            d["charge_to"] = "tenant"
            d["estimate_amount"] = wo.estimate_amount
        else:
            d["actual_cost"] = None
    return d


def _get(db: Session, wo_id: int) -> WorkOrder:
    wo = db.get(WorkOrder, wo_id)
    if wo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Work order not found")
    return wo


def _actor(u: User) -> str:
    return getattr(u, "full_name", None) or u.username


def _require_state(wo: WorkOrder, allowed: set[str], action: str) -> None:
    if wo.status not in allowed:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot {action} a work order that is '{wo.status}'.")


def _mail(to: str | None, subject: str, ar: str, en: str, url: str, label_ar: str, label_en: str) -> None:
    if not to:
        return
    try:
        html = _branded(f"{ar}{_button(url, label_ar)}", f"{en}{_button(url, label_en)}", preheader=subject)
        send_email(EmailMessage(to=to, subject=subject, text_body=f"{subject}\n{url}", html_body=html))
    except Exception:  # noqa: BLE001 — never block the workflow on email
        logger.exception("work-order email failed")


def _base() -> str:
    return get_settings().web_base_url.rstrip("/")


# ───────────────────────── schemas ─────────────────────────


class WorkOrderIn(BaseModel):
    building_id: int
    unit_id: Optional[int] = None
    title: str = Field(min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    category: Category = "other"
    priority: Priority = "normal"
    reported_by: Literal["staff", "tenant", "owner", "inspection"] = "staff"
    reporter_name: Optional[str] = Field(default=None, max_length=120)
    reporter_phone: Optional[str] = Field(default=None, max_length=30)
    assignee_id: Optional[int] = None
    vendor_name: Optional[str] = Field(default=None, max_length=160)
    vendor_phone: Optional[str] = Field(default=None, max_length=30)
    scheduled_for: Optional[datetime] = None


class WorkOrderUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    category: Optional[Category] = None
    priority: Optional[Priority] = None
    unit_id: Optional[int] = None
    vendor_name: Optional[str] = Field(default=None, max_length=160)
    vendor_phone: Optional[str] = Field(default=None, max_length=30)
    scheduled_for: Optional[datetime] = None


class AssignIn(BaseModel):
    assignee_id: Optional[int] = None
    vendor_name: Optional[str] = Field(default=None, max_length=160)
    vendor_phone: Optional[str] = Field(default=None, max_length=30)


class EstimateIn(BaseModel):
    amount: float = Field(ge=0, le=10_000_000)
    charge_to: ChargeTo = "owner"
    note: Optional[str] = Field(default=None, max_length=1000)
    # Send to the owner even when the estimate is within the pre-authorised limit.
    require_owner: Optional[bool] = None


class DecisionIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=1000)


class CompleteIn(BaseModel):
    actual_cost: float = Field(ge=0, le=10_000_000)
    resolution: Optional[str] = Field(default=None, max_length=5000)
    post_expense: bool = True


class NoteIn(BaseModel):
    note: str = Field(min_length=1, max_length=2000)
    # Shared with the tenant and owner (shows in their history) instead of internal.
    public: bool = False


# ───────────────────────── staff endpoints ─────────────────────────


@router.get("/work-orders")
def list_work_orders(
    db: DbSession,
    _u: Perm("maintenance", "view"),
    locale: str = Query("ar", pattern="^(ar|en)$"),
    state: Optional[str] = Query(None, max_length=20),
    building_id: Optional[int] = None,
    assignee_id: Optional[int] = None,
):
    q = select(WorkOrder).order_by(WorkOrder.id.desc())
    if state == "open":
        q = q.where(WorkOrder.status.in_(OPEN))
    elif state:
        q = q.where(WorkOrder.status == state)
    if building_id:
        q = q.where(WorkOrder.building_id == building_id)
    if assignee_id:
        q = q.where(WorkOrder.assignee_id == assignee_id)
    return [_out(db, w, locale) for w in db.scalars(q.limit(1000)).all()]


@router.get("/stats")
def stats(db: DbSession, _u: Perm("maintenance", "view")):
    rows = db.scalars(select(WorkOrder)).all()
    now = datetime.utcnow()
    month_start = date.today().replace(day=1)
    done = [w for w in rows if w.completed_at]
    hours = [(w.completed_at - w.created_at).total_seconds() / 3600 for w in done]
    within = [w for w in done if w.due_at and w.completed_at <= w.due_at]
    return {
        "open": sum(1 for w in rows if w.status in OPEN),
        "emergency_open": sum(1 for w in rows if w.status in OPEN and w.priority == "emergency"),
        "awaiting_approval": sum(1 for w in rows if w.status == "awaiting_approval"),
        "breached": sum(1 for w in rows if _sla_state(w, now) == "breached"),
        "completed_month": sum(1 for w in done if w.completed_at.date() >= month_start),
        "cost_month": round(sum(w.actual_cost or 0 for w in done if w.completed_at.date() >= month_start), 2),
        "avg_resolution_hours": round(sum(hours) / len(hours), 1) if hours else None,
        "sla_met_pct": round(100 * len(within) / len(done), 1) if done else None,
    }


@router.get("/work-orders/{wo_id}")
def get_work_order(wo_id: int, db: DbSession, _u: Perm("maintenance", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    return _out(db, _get(db, wo_id), locale, detail=True)


def _create(db: Session, b: Building, fields: dict, actor: str, created_by_id: Optional[int], assignee_id: Optional[int]) -> WorkOrder:
    seq = (db.scalar(select(func.max(WorkOrder.id))) or 0) + 1
    now = datetime.utcnow()
    wo = WorkOrder(
        **fields,
        number=f"WO-{seq:05d}",
        status="new",
        due_at=now + timedelta(hours=SLA_HOURS[fields.get("priority") or "normal"]),
        created_by_id=created_by_id,
        created_at=now,
    )
    db.add(wo)
    _log(wo, actor, "created", fields.get("title"))
    # The employee responsible for the building gets the job unless someone else is named.
    aid = assignee_id or b.assignee_id
    if aid and db.get(User, aid):
        wo.assignee_id = aid
        wo.status = "assigned"
        _log(wo, actor, "assigned", None if assignee_id else "auto: building's responsible employee")
    db.flush()
    return wo


@router.post("/work-orders", status_code=status.HTTP_201_CREATED)
def create_work_order(payload: WorkOrderIn, db: DbSession, user: Perm("maintenance", "create")):
    b = db.get(Building, payload.building_id)
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Building not found")
    if payload.unit_id and (u := db.get(Unit, payload.unit_id)) is not None and u.building_id != b.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unit does not belong to this building")
    wo = _create(db, b, payload.model_dump(exclude={"assignee_id"}), _actor(user), user.id, payload.assignee_id)
    db.commit()
    db.refresh(wo)
    if wo.assignee_id:
        _notify_assignee(db, wo)
    return _out(db, wo, "ar", detail=True)


@router.put("/work-orders/{wo_id}")
def update_work_order(wo_id: int, payload: WorkOrderUpdate, db: DbSession, user: Perm("maintenance", "edit")):
    wo = _get(db, wo_id)
    _require_state(wo, OPEN, "edit")
    data = payload.model_dump(exclude_unset=True)
    if "priority" in data and data["priority"] != wo.priority:
        wo.due_at = wo.created_at + timedelta(hours=SLA_HOURS[data["priority"]])
    for k, v in data.items():
        setattr(wo, k, v)
    _log(wo, _actor(user), "updated", ", ".join(data.keys()))
    db.commit()
    return _out(db, wo, "ar", detail=True)


@router.post("/work-orders/{wo_id}/assign")
def assign(wo_id: int, payload: AssignIn, db: DbSession, user: Perm("maintenance", "edit")):
    wo = _get(db, wo_id)
    _require_state(wo, OPEN, "assign")
    if payload.assignee_id and db.get(User, payload.assignee_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    wo.assignee_id = payload.assignee_id
    wo.vendor_name, wo.vendor_phone = payload.vendor_name, payload.vendor_phone
    if wo.status == "new" and (wo.assignee_id or wo.vendor_name):
        wo.status = "assigned"
    who = " / ".join(x for x in [(_actor(db.get(User, wo.assignee_id)) if wo.assignee_id else None), wo.vendor_name] if x)
    _log(wo, _actor(user), "assigned", who or None)
    db.commit()
    if wo.assignee_id:
        _notify_assignee(db, wo)
    return _out(db, wo, "ar", detail=True)


@router.post("/work-orders/{wo_id}/estimate")
def estimate(wo_id: int, payload: EstimateIn, db: DbSession, user: Perm("maintenance", "edit")):
    wo = _get(db, wo_id)
    _require_state(wo, {"new", "assigned", "awaiting_approval", "approved", "rejected"}, "estimate")
    b = db.get(Building, wo.building_id)
    limit = _limit_for(db, b)
    wo.estimate_amount, wo.charge_to, wo.approval_limit = payload.amount, payload.charge_to, limit
    # Tenant-raised jobs billed to the owner always go to the owner; staff can
    # also send any job to the owner, or skip it explicitly (require_owner=False).
    from_tenant = wo.reported_by == "tenant" and _tenant_link(db, wo) is not None
    want_owner = payload.require_owner if payload.require_owner is not None else from_tenant
    above = payload.amount > limit
    wo.approval_required = payload.charge_to == "owner" and (above or want_owner)
    wo.approved_by = wo.approved_at = wo.decision_note = None
    _log(wo, _actor(user), "estimated", f"{payload.amount:,.0f} SAR → {payload.charge_to}" + (f" — {payload.note}" if payload.note else ""))
    if wo.approval_required:
        wo.status = "awaiting_approval"
        _log(wo, "system", "approval_requested", f"above the owner's limit of {limit:,.0f} SAR" if above else "owner approval required")
        db.commit()
        _notify_owner_for_approval(db, wo)
        _notify_tenant(db, wo, "awaiting_owner")
    else:
        wo.status = "approved"
        wo.approved_by, wo.approved_at = "auto", datetime.utcnow()
        _log(wo, "system", "auto_approved", f"within limit ({limit:,.0f} SAR)" if payload.charge_to == "owner" else f"charged to {payload.charge_to}")
        db.commit()
    return _out(db, wo, "ar", detail=True)


def _decide(db: Session, wo: WorkOrder, approve: bool, note: str | None, actor: str) -> None:
    _require_state(wo, {"awaiting_approval"}, "decide on")
    wo.status = "approved" if approve else "rejected"
    wo.approved_by, wo.approved_at, wo.decision_note = actor, datetime.utcnow(), note
    _log(wo, actor, "approved" if approve else "rejected", note)
    db.commit()
    _notify_decision(db, wo)
    _notify_tenant(db, wo, "approved" if approve else "rejected")


@router.post("/work-orders/{wo_id}/decision")
def staff_decision(wo_id: int, payload: DecisionIn, db: DbSession, user: Perm("maintenance", "approve")):
    wo = _get(db, wo_id)
    _decide(db, wo, payload.approve, payload.note, _actor(user))
    return _out(db, wo, "ar", detail=True)


@router.post("/work-orders/{wo_id}/start")
def start(wo_id: int, db: DbSession, user: Perm("maintenance", "edit")):
    wo = _get(db, wo_id)
    if wo.status == "awaiting_approval":
        raise HTTPException(status.HTTP_409_CONFLICT, "This job is waiting for approval of its estimate.")
    _require_state(wo, {"new", "assigned", "approved"}, "start")
    wo.status, wo.started_at = "in_progress", datetime.utcnow()
    _log(wo, _actor(user), "started")
    db.commit()
    _notify_tenant(db, wo, "started")
    return _out(db, wo, "ar", detail=True)


@router.post("/work-orders/{wo_id}/complete")
def complete(wo_id: int, payload: CompleteIn, db: DbSession, user: Perm("maintenance", "edit")):
    wo = _get(db, wo_id)
    _require_state(wo, {"in_progress", "approved", "assigned"}, "complete")
    wo.status, wo.completed_at = "completed", datetime.utcnow()
    wo.actual_cost, wo.resolution = payload.actual_cost, payload.resolution
    _log(wo, _actor(user), "completed", f"{payload.actual_cost:,.0f} SAR" + (f" — {payload.resolution}" if payload.resolution else ""))
    if payload.post_expense and payload.actual_cost > 0 and wo.expense_id is None:
        b = db.get(Building, wo.building_id)
        e = Expense(
            owner_id=b.owner_id if b else None, building_id=wo.building_id, unit_id=wo.unit_id,
            category="maintenance", description=f"{wo.number} — {wo.title}", description_ar=f"{wo.number} — {wo.title}",
            amount=payload.actual_cost, expense_date=date.today(),
            paid_by={"owner": "owner", "tenant": "tenant"}.get(wo.charge_to, "company"),
            vendor_name=wo.vendor_name, notes=payload.resolution,
        )
        db.add(e)
        db.flush()
        wo.expense_id = e.id
        _log(wo, "system", "expense_posted", f"#{e.id}")
    db.commit()
    _notify_tenant(db, wo, "completed")
    return _out(db, wo, "ar", detail=True)


@router.post("/work-orders/{wo_id}/close")
def close(wo_id: int, db: DbSession, user: Perm("maintenance", "edit"), rating: Optional[int] = Query(None, ge=1, le=5)):
    wo = _get(db, wo_id)
    _require_state(wo, {"completed"}, "close")
    wo.status, wo.closed_at, wo.rating = "closed", datetime.utcnow(), rating
    _log(wo, _actor(user), "closed", f"rating {rating}/5" if rating else None)
    db.commit()
    return _out(db, wo, "ar", detail=True)


@router.post("/work-orders/{wo_id}/cancel")
def cancel(wo_id: int, payload: NoteIn, db: DbSession, user: Perm("maintenance", "delete")):
    wo = _get(db, wo_id)
    _require_state(wo, OPEN | {"rejected"}, "cancel")
    wo.status = "cancelled"
    _log(wo, _actor(user), "cancelled", payload.note)
    db.commit()
    return _out(db, wo, "ar", detail=True)


@router.post("/work-orders/{wo_id}/notes")
def add_note(wo_id: int, payload: NoteIn, db: DbSession, user: Perm("maintenance", "view")):
    wo = _get(db, wo_id)
    _log(wo, _actor(user), "reply" if payload.public else "note", payload.note)
    db.commit()
    if payload.public:
        _notify_tenant(db, wo, "reply", payload.note)
    return _out(db, wo, "ar", detail=True)


# ───────────────────────── notifications ─────────────────────────


def _notify_assignee(db: Session, wo: WorkOrder) -> None:
    a = db.get(User, wo.assignee_id) if wo.assignee_id else None
    b = db.get(Building, wo.building_id)
    if not a or not a.email:
        return
    t = escape(wo.title)
    _mail(
        a.email,
        f"أمر صيانة جديد {wo.number} | New work order {wo.number}",
        f"<p>أُسند إليك أمر الصيانة <strong>{wo.number}</strong>: {t}</p><p>المبنى: {escape(_name(b, 'ar'))} — الأولوية: {wo.priority}</p>",
        f"<p>Work order <strong>{wo.number}</strong> is assigned to you: {t}</p><p>Building: {escape(_name(b, 'en'))} — priority: {wo.priority}</p>",
        f"{_base()}/ar/maintenance?open={wo.id}", "فتح أمر الصيانة", "Open work order",
    )


def _notify_owner_for_approval(db: Session, wo: WorkOrder) -> None:
    b = db.get(Building, wo.building_id)
    owner = db.get(Owner, b.owner_id) if b and b.owner_id else None
    link = db.scalar(select(OwnerUser).where(OwnerUser.owner_id == owner.id)) if owner else None
    to = (db.get(User, link.user_id).email if link else None) or (owner.email if owner else None)
    amt = f"{wo.estimate_amount:,.0f}"
    t = escape(wo.title)
    _mail(
        to,
        f"طلب موافقة على صيانة {wo.number} | Maintenance approval needed {wo.number}",
        f"<p>نحتاج موافقتك على أعمال صيانة في <strong>{escape(_name(b, 'ar'))}</strong>:</p><p>{t}</p>"
        f"<p>التكلفة التقديرية: <strong>{amt} ر.س</strong> (أعلى من الحد المفوَّض {wo.approval_limit:,.0f} ر.س).</p>",
        f"<p>We need your approval for maintenance at <strong>{escape(_name(b, 'en'))}</strong>:</p><p>{t}</p>"
        f"<p>Estimated cost: <strong>SAR {amt}</strong> (above your pre-authorised limit of SAR {wo.approval_limit:,.0f}).</p>",
        f"{_base()}/ar/owner/maintenance", "مراجعة الطلب", "Review request",
    )


def _notify_decision(db: Session, wo: WorkOrder) -> None:
    targets = {x for x in [wo.assignee_id, wo.created_by_id] if x}
    for uid in targets:
        u = db.get(User, uid)
        if not u or not u.email:
            continue
        ok = wo.status == "approved"
        _mail(
            u.email,
            f"{'تمت الموافقة على' if ok else 'رُفض'} {wo.number} | {wo.number} {'approved' if ok else 'rejected'}",
            f"<p>{'تمت الموافقة على' if ok else 'رُفض'} تقدير أمر الصيانة <strong>{wo.number}</strong> من {escape(wo.approved_by or '')}.</p>"
            + (f"<p>ملاحظة: {escape(wo.decision_note)}</p>" if wo.decision_note else ""),
            f"<p>The estimate for work order <strong>{wo.number}</strong> was {'approved' if ok else 'rejected'} by {escape(wo.approved_by or '')}.</p>"
            + (f"<p>Note: {escape(wo.decision_note)}</p>" if wo.decision_note else ""),
            f"{_base()}/ar/maintenance?open={wo.id}", "فتح أمر الصيانة", "Open work order",
        )


# ───────────────────────── owner portal ─────────────────────────


def _owner_scope(db: Session, user: User, as_owner: Optional[int]) -> int:
    if user.role == "owner":
        link = db.scalar(select(OwnerUser).where(OwnerUser.user_id == user.id))
        if link is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is not linked to an owner yet.")
        return link.owner_id
    if as_owner is None or not has_permission(db, user, "owner_portal", "view"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Owners only")
    return as_owner


@owner_router.get("")
def owner_work_orders(db: DbSession, user: CurrentUser, as_owner: Annotated[Optional[int], Query(ge=1)] = None, locale: str = Query("ar", pattern="^(ar|en)$")):
    oid = _owner_scope(db, user, as_owner)
    bids = [b.id for b in db.scalars(select(Building).where(Building.owner_id == oid)).all()]
    if not bids:
        return []
    rows = db.scalars(select(WorkOrder).where(WorkOrder.building_id.in_(bids), WorkOrder.status != "cancelled").order_by(WorkOrder.id.desc()).limit(300)).all()
    out = []
    for w in rows:
        d = _out(db, w, locale)
        # Owners see the job and its money, not staff contact details.
        for k in ("reporter_phone", "vendor_phone", "assignee_id", "reporter_name"):
            d.pop(k, None)
        out.append(d)
    return out


@owner_router.post("/{wo_id}/decision")
def owner_decision(wo_id: int, payload: DecisionIn, db: DbSession, user: CurrentUser):
    if user.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can approve from the owner portal.")
    oid = _owner_scope(db, user, None)
    wo = _get(db, wo_id)
    b = db.get(Building, wo.building_id)
    if b is None or b.owner_id != oid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Work order not found")
    owner = db.get(Owner, oid)
    _decide(db, wo, payload.approve, payload.note, f"owner: {_name(owner, 'ar')}")
    return {"ok": True, "status": wo.status}


@owner_router.get("/{wo_id}")
def owner_work_order(wo_id: int, db: DbSession, user: CurrentUser, as_owner: Annotated[Optional[int], Query(ge=1)] = None,
                     locale: str = Query("ar", pattern="^(ar|en)$")):
    oid = _owner_scope(db, user, as_owner)
    wo = _get(db, wo_id)
    b = db.get(Building, wo.building_id)
    if b is None or b.owner_id != oid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Work order not found")
    return _public(db, wo, locale, "owner")


@owner_router.post("/{wo_id}/notes")
def owner_note(wo_id: int, payload: NoteIn, db: DbSession, user: CurrentUser):
    if user.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can comment from the owner portal.")
    oid = _owner_scope(db, user, None)
    wo = _get(db, wo_id)
    b = db.get(Building, wo.building_id)
    if b is None or b.owner_id != oid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Work order not found")
    _log(wo, f"owner: {_name(db.get(Owner, oid), 'ar')}", "owner_note", payload.note)
    db.commit()
    _notify_staff_comment(db, wo, "owner", payload.note)
    return {"ok": True}


# ───────────────────────── tenant portal ─────────────────────────


def _tenant_link(db: Session, wo: WorkOrder) -> Optional[WorkOrderTenant]:
    return db.scalar(select(WorkOrderTenant).where(WorkOrderTenant.work_order_id == wo.id))


TENANT_MAIL = {
    "received": ("استلمنا طلب الصيانة", "We received your maintenance request"),
    "awaiting_owner": ("طلبك بانتظار موافقة المالك", "Your request is waiting for the owner's approval"),
    "approved": ("تمت الموافقة على طلب الصيانة", "Your maintenance request was approved"),
    "rejected": ("لم تتم الموافقة على طلب الصيانة", "Your maintenance request was not approved"),
    "started": ("بدأ فريق الصيانة العمل", "Our team has started the work"),
    "completed": ("اكتملت أعمال الصيانة — نرجو التأكيد والتقييم", "The work is done — please confirm and rate it"),
    "reply": ("ردّ جديد على طلب الصيانة", "New reply on your maintenance request"),
}


def _notify_tenant(db: Session, wo: WorkOrder, kind: str, note: Optional[str] = None) -> None:
    """Email the tenant who raised the job (if any) about a step in the workflow."""
    link = _tenant_link(db, wo)
    if link is None or kind not in TENANT_MAIL:
        return
    from api.routers.tenant_portal import _tenant_email

    to = _tenant_email(db, link.tenant_id)
    ar, en = TENANT_MAIL[kind]
    extra_ar = f"<p>{escape(note)}</p>" if note else (f"<p>ملاحظة: {escape(wo.decision_note)}</p>" if kind == "rejected" and wo.decision_note else "")
    extra_en = f"<p>{escape(note)}</p>" if note else (f"<p>Note: {escape(wo.decision_note)}</p>" if kind == "rejected" and wo.decision_note else "")
    _mail(
        to,
        f"{ar} {wo.number} | {en}",
        f"<p>{ar}: <strong>{escape(wo.title)}</strong> ({wo.number}).</p>{extra_ar}",
        f"<p>{en}: <strong>{escape(wo.title)}</strong> ({wo.number}).</p>{extra_en}",
        f"{_base()}/ar/tenant/maintenance/{wo.id}", "متابعة الطلب", "Track request",
    )


def _notify_staff_comment(db: Session, wo: WorkOrder, who: str, note: str) -> None:
    targets = {x for x in [wo.assignee_id, wo.created_by_id] if x}
    for uid in targets:
        u = db.get(User, uid)
        if not u or not u.email or u.role in ("tenant", "owner"):
            continue
        src_ar, src_en = ("المستأجر", "The tenant") if who == "tenant" else ("المالك", "The owner")
        _mail(
            u.email,
            f"تعليق جديد على {wo.number} | New comment on {wo.number}",
            f"<p>{src_ar} علّق على أمر الصيانة <strong>{wo.number}</strong>:</p><p>{escape(note)}</p>",
            f"<p>{src_en} commented on work order <strong>{wo.number}</strong>:</p><p>{escape(note)}</p>",
            f"{_base()}/ar/maintenance?open={wo.id}", "فتح أمر الصيانة", "Open work order",
        )


async def _store_photos(db: Session, wo: WorkOrder, files: list[UploadFile], who: str, source: str) -> int:
    from api.storage import StorageNotConfigured, upload_document

    n = 0
    for f in (files or [])[:MAX_PHOTOS]:
        if f is None or not f.filename:
            continue
        content = await f.read(PHOTO_MAX_BYTES + 1)
        if len(content) > PHOTO_MAX_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Each photo must be 10 MB or smaller")
        try:
            import io

            st = upload_document(io.BytesIO(content), content_type=f.content_type or "application/octet-stream",
                                 prefix=f"maintenance/{wo.id}", original_filename=f.filename)
        except StorageNotConfigured as e:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
        except ValueError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
        db.add(WorkOrderAttachment(work_order_id=wo.id, object_key=st.object_key, url=st.public_url, name=f.filename[:255],
                                   content_type=f.content_type, uploaded_by=who, source=source))
        n += 1
    return n


def _tenant_units(db: Session, tenant_id: int, locale: str) -> list[dict]:
    today = date.today()
    out = []
    for c in db.scalars(select(Contract).where(Contract.tenant_id == tenant_id)).all():
        st = (c.status or "active").lower()
        if st in {"terminated", "cancelled", "canceled", "expired", "draft"} or c.end_date < today - timedelta(days=30):
            continue
        u = db.get(Unit, c.unit_id)
        b = db.get(Building, u.building_id) if u else None
        if u and b:
            out.append({"contract_id": c.id, "unit_id": u.id, "unit": u.number, "building_id": b.id, "building": _name(b, locale)})
    return out


def _own_wo(db: Session, tenant_id: int, wo_id: int) -> WorkOrder:
    link = db.scalar(select(WorkOrderTenant).where(WorkOrderTenant.work_order_id == wo_id, WorkOrderTenant.tenant_id == tenant_id))
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    return _get(db, wo_id)


def _tenant_actor(t: Tenant) -> str:
    return f"tenant: {t.name}"


from api.routers.tenant_portal import ScopeDep as _TScope  # noqa: E402


@tenant_router.get("")
def tenant_requests(scope: _TScope, db: DbSession, locale: str = Query("ar", pattern="^(ar|en)$")):
    ids = [l.work_order_id for l in db.scalars(select(WorkOrderTenant).where(WorkOrderTenant.tenant_id == scope.tenant.id)).all()]
    rows = db.scalars(select(WorkOrder).where(WorkOrder.id.in_(ids or [0])).order_by(WorkOrder.id.desc())).all()
    return {"units": _tenant_units(db, scope.tenant.id, locale), "requests": [_public(db, w, locale, "tenant") for w in rows]}


@tenant_router.get("/{wo_id}")
def tenant_request(wo_id: int, scope: _TScope, db: DbSession, locale: str = Query("ar", pattern="^(ar|en)$")):
    return _public(db, _own_wo(db, scope.tenant.id, wo_id), locale, "tenant")


def _no_preview(scope) -> None:
    if scope.preview:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Preview is read-only")


@tenant_router.post("", status_code=status.HTTP_201_CREATED)
async def tenant_create(
    scope: _TScope,
    db: DbSession,
    user: CurrentUser,
    unit_id: Annotated[int, Form()],
    title: Annotated[str, Form(min_length=2, max_length=200)],
    category: Annotated[Category, Form()] = "other",
    urgent: Annotated[bool, Form()] = False,
    description: Annotated[Optional[str], Form(max_length=5000)] = None,
    preferred_time: Annotated[Optional[str], Form(max_length=120)] = None,
    allow_entry: Annotated[bool, Form()] = False,
    phone: Annotated[Optional[str], Form(max_length=30)] = None,
    photos: Annotated[list[UploadFile], File()] = [],  # noqa: B006
):
    _no_preview(scope)
    t = scope.tenant
    units = {u["unit_id"]: u for u in _tenant_units(db, t.id, "ar")}
    if unit_id not in units:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick one of your leased units")
    b = db.get(Building, units[unit_id]["building_id"])
    fields = {
        "building_id": b.id, "unit_id": unit_id, "title": title.strip(), "description": (description or "").strip() or None,
        "category": category, "priority": "high" if urgent else "normal", "reported_by": "tenant",
        "reporter_name": t.name, "reporter_phone": (phone or t.phone or None),
    }
    wo = _create(db, b, fields, _tenant_actor(t), user.id, None)
    db.add(WorkOrderTenant(work_order_id=wo.id, tenant_id=t.id, user_id=user.id, contract_id=units[unit_id]["contract_id"],
                           preferred_time=(preferred_time or "").strip() or None, allow_entry=allow_entry))
    await _store_photos(db, wo, photos, _tenant_actor(t), "tenant")
    db.commit()
    db.refresh(wo)
    if wo.assignee_id:
        _notify_assignee(db, wo)
    _notify_tenant(db, wo, "received")
    return _public(db, wo, "ar", "tenant")


@tenant_router.post("/{wo_id}/comment")
async def tenant_comment(
    wo_id: int, scope: _TScope, db: DbSession,
    note: Annotated[str, Form(min_length=1, max_length=2000)],
    photos: Annotated[list[UploadFile], File()] = [],  # noqa: B006
):
    _no_preview(scope)
    wo = _own_wo(db, scope.tenant.id, wo_id)
    if wo.status in {"closed", "cancelled"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "This request is closed.")
    n = await _store_photos(db, wo, photos, _tenant_actor(scope.tenant), "tenant")
    _log(wo, _tenant_actor(scope.tenant), "tenant_note", note + (f" (📷 {n})" if n else ""))
    db.commit()
    _notify_staff_comment(db, wo, "tenant", note)
    return {"ok": True}


class TenantCloseIn(BaseModel):
    resolved: bool
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    note: Optional[str] = Field(default=None, max_length=2000)


@tenant_router.post("/{wo_id}/confirm")
def tenant_confirm(wo_id: int, payload: TenantCloseIn, scope: _TScope, db: DbSession):
    """After the job is completed the tenant confirms it (closes with a rating) or reopens it."""
    _no_preview(scope)
    wo = _own_wo(db, scope.tenant.id, wo_id)
    _require_state(wo, {"completed"}, "confirm")
    who = _tenant_actor(scope.tenant)
    if payload.resolved:
        wo.status, wo.closed_at, wo.rating = "closed", datetime.utcnow(), payload.rating
        _log(wo, who, "tenant_confirmed", (f"★ {payload.rating}/5" if payload.rating else "") + (f" — {payload.note}" if payload.note else ""))
    else:
        wo.status, wo.completed_at = "in_progress", None
        _log(wo, who, "reopened", payload.note or None)
        wo.due_at = datetime.utcnow() + timedelta(hours=SLA_HOURS["high"])
    db.commit()
    if not payload.resolved:
        _notify_staff_comment(db, wo, "tenant", payload.note or "Reopened — not fixed")
    return {"ok": True, "status": wo.status}


@tenant_router.post("/{wo_id}/cancel")
def tenant_cancel(wo_id: int, payload: NoteIn, scope: _TScope, db: DbSession):
    _no_preview(scope)
    wo = _own_wo(db, scope.tenant.id, wo_id)
    _require_state(wo, {"new", "assigned", "awaiting_approval"}, "cancel")
    wo.status = "cancelled"
    _log(wo, _tenant_actor(scope.tenant), "cancelled", payload.note)
    db.commit()
    return {"ok": True}
