"""Technical support tickets (الدعم الفني).

Any signed-in user can open tickets and talk to support in a thread.

* **Support staff** — users with the `support.edit` permission (admins by
  default): see every ticket, triage it (status / priority / category /
  assignee), reply, and leave internal notes the requester never sees.
* **Technicians** — any staff user a ticket is *assigned* to: they get the same
  powers on the tickets assigned to them, even without `support.edit`.
* **Requesters** — see their own tickets, the assignee, status history and
  service-level targets; can reply, close, reopen and rate the service.

Every change is written to an activity log (``support_ticket_events``) and the
right people get a detailed bilingual e-mail (see ``api/services/support_mail``).
"""
import io
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from api.config import get_settings
from api.deps import CurrentUser, DbSession
from api.models import SupportTicket, SupportTicketEvent, SupportTicketMessage, User
from api.permissions import has_permission
from api.routers.auth import _absolute
from api.schemas.support import (
    TicketCategory,
    TicketDetail,
    TicketEventRead,
    TicketMessageRead,
    TicketPriority,
    TicketRating,
    TicketStats,
    TicketSummary,
    TicketUpdate,
    TicketUser,
)
from api.security import utcnow
from api.services import support_mail as mail
from api.services.support_mail import Change, TicketMail
from api.storage import StorageNotConfigured, upload_document

router = APIRouter(prefix="/support", tags=["support"])

ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
ACTIVE = ("open", "in_progress", "waiting_user")
# Kept for callers that import it; labels now live in support_mail.
STATUS_LABELS = {k: (v[0], v[1]) for k, v in mail.STATUS.items()}

# Service-level targets by priority: (first response, resolution).
SLA = {
    "urgent": (timedelta(hours=2), timedelta(hours=24)),
    "high": (timedelta(hours=8), timedelta(days=3)),
    "normal": (timedelta(hours=24), timedelta(days=5)),
    "low": (timedelta(hours=72), timedelta(days=10)),
}

ref = mail.ref


# ── Permissions ───────────────────────────────────────────────────────────────


def is_staff(db: Session, user: User) -> bool:
    return has_permission(db, user, "support", "edit")


def can_manage(t: SupportTicket, user: User, staff: bool) -> bool:
    """Support staff, or the technician the ticket is assigned to."""
    return staff or (t.assignee_id == user.id and user.role != "owner")


def _ticket_url(ticket: SupportTicket, locale: str | None, viewer: User | None = None) -> str:
    """Link for an e-mail. Owners live in the owner portal (/owner/…); staff
    pages redirect them away, so their links must point there."""
    loc = locale if locale in ("ar", "en") else "ar"
    prefix = "/owner" if viewer is not None and viewer.role == "owner" else ""
    return _absolute(f"/{loc}{prefix}/support/{ticket.id}")


def _staff_recipients(db: Session) -> list[str]:
    configured = get_settings().support_email.strip()
    if configured:
        return [e.strip() for e in configured.split(",") if e.strip()]
    rows = db.scalars(
        select(User.email).where(User.role == "admin", User.is_active_user.is_(True))
    ).all()
    return sorted(set(rows))


def _load(db: Session, ticket_id: int) -> SupportTicket:
    t = db.scalar(
        select(SupportTicket)
        .where(SupportTicket.id == ticket_id)
        .options(
            selectinload(SupportTicket.messages).selectinload(SupportTicketMessage.author),
            selectinload(SupportTicket.events).selectinload(SupportTicketEvent.actor),
            selectinload(SupportTicket.user),
            selectinload(SupportTicket.assignee),
        )
        .execution_options(populate_existing=True)
    )
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return t


def _get_visible(db: Session, user: User, ticket_id: int) -> tuple[SupportTicket, bool]:
    t = _load(db, ticket_id)
    staff = is_staff(db, user)
    if not staff and t.user_id != user.id and not can_manage(t, user, False):
        # 404, not 403 — don't confirm other people's ticket ids exist.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return t, staff


def _event(db: Session, t: SupportTicket, actor: User | None, kind: str,
           old: str | None = None, new: str | None = None, public: bool = True, at: datetime | None = None) -> None:
    db.add(SupportTicketEvent(
        ticket_id=t.id, actor_id=actor.id if actor else None, kind=kind,
        from_value=(old or None) and str(old)[:200], to_value=(new or None) and str(new)[:200],
        public=public, created_at=at or utcnow(),
    ))


def _name(u: User | None) -> str:
    return mail._name(u)


def _apply_sla(t: SupportTicket) -> None:
    resp, resolve = SLA.get(t.priority, SLA["normal"])
    t.response_due_at = t.created_at + resp
    t.resolve_due_at = t.created_at + resolve


def _sla_state(t: SupportTicket, now: datetime) -> str:
    if t.first_response_at:
        return "met" if (t.response_due_at is None or t.first_response_at <= t.response_due_at) else "late"
    if t.status not in ACTIVE or t.response_due_at is None:
        return "none"
    if now > t.response_due_at:
        return "breached"
    window = (t.response_due_at - t.created_at).total_seconds() or 1
    return "due_soon" if (t.response_due_at - now).total_seconds() < window * 0.25 else "on_track"


# ── Serialisation ─────────────────────────────────────────────────────────────


def _summary(t: SupportTicket, viewer_is_staff: bool, viewer_id: int, now: datetime | None = None) -> dict:
    now = now or utcnow()
    public = [m for m in t.messages if not m.internal]
    last = public[-1] if public else None
    handler = viewer_is_staff or t.assignee_id == viewer_id
    awaiting = False
    if last is not None and t.status in ACTIVE:
        if handler and t.user_id != viewer_id:
            awaiting = not last.is_staff
        else:
            awaiting = last.is_staff
    return dict(
        id=t.id,
        reference=ref(t.id),
        subject=t.subject,
        category=t.category,
        priority=t.priority,
        status=t.status,
        created_at=t.created_at,
        updated_at=t.updated_at,
        closed_at=t.closed_at,
        user=TicketUser.model_validate(t.user),
        assignee=TicketUser.model_validate(t.assignee) if t.assignee else None,
        message_count=len(public),
        awaiting_me=awaiting,
        assigned_at=t.assigned_at,
        first_response_at=t.first_response_at,
        response_due_at=t.response_due_at,
        resolve_due_at=t.resolve_due_at,
        resolved_at=t.resolved_at,
        sla_state=_sla_state(t, now),
        rating=t.rating,
    )


def _detail(t: SupportTicket, viewer: User, viewer_is_staff: bool) -> TicketDetail:
    manage = can_manage(t, viewer, viewer_is_staff)
    msgs = [m for m in t.messages if manage or not m.internal]
    events = [e for e in t.events if manage or e.public]
    return TicketDetail(
        **_summary(t, viewer_is_staff, viewer.id),
        page_url=t.page_url,
        user_agent=t.user_agent if manage else None,
        resolution=t.resolution,
        rating_comment=t.rating_comment,
        rated_at=t.rated_at,
        can_manage=manage,
        messages=[TicketMessageRead.model_validate(m) for m in msgs],
        events=[TicketEventRead.model_validate(e) for e in events],
    )


async def _store_attachment(ticket_id: int, file: Optional[UploadFile]) -> tuple[str | None, str | None, str | None]:
    if file is None or not file.filename:
        return None, None, None
    content = await file.read(ATTACHMENT_MAX_BYTES + 1)
    if len(content) > ATTACHMENT_MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Attachment must be 10 MB or smaller")
    try:
        stored = upload_document(
            io.BytesIO(content),
            content_type=file.content_type or "application/octet-stream",
            prefix=f"support/{ticket_id}",
            original_filename=file.filename,
        )
    except StorageNotConfigured as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return stored.object_key, stored.public_url, file.filename[:255]


# ── Notifications ─────────────────────────────────────────────────────────────


def _requester_wants(t: SupportTicket) -> bool:
    return bool(t.user and t.user.is_active_user and t.user.notify_ticket_updates)


def _to_requester(t: SupportTicket, kind: str, **kw) -> None:
    if not _requester_wants(t):
        return
    mail.send(t, TicketMail(kind=kind, to=t.user.email, url=_ticket_url(t, t.user.preferred_locale, t.user),
                            for_requester=True, **kw), utcnow())


def _to_handlers(db: Session, t: SupportTicket, kind: str, *, exclude: User | None = None, **kw) -> None:
    """The assignee — or, while unassigned, the support inbox / admins."""
    if t.assignee is not None:
        if t.assignee.is_active_user and (exclude is None or t.assignee.id != exclude.id):
            targets = [t.assignee.email]
        else:
            targets = []
    else:
        targets = [a for a in _staff_recipients(db) if exclude is None or a != exclude.email]
    for addr in targets:
        mail.send(t, TicketMail(kind=kind, to=addr, url=_ticket_url(t, "ar"), for_requester=False, **kw), utcnow())


# ── Reads ─────────────────────────────────────────────────────────────────────


@router.get("/me")
def support_context(db: DbSession, user: CurrentUser):
    """Tells the UI whether the caller gets the staff (triage) view, and whether
    they have tickets assigned to them as a technician."""
    staff = is_staff(db, user)
    assigned = db.scalar(
        select(func.count()).select_from(SupportTicket).where(SupportTicket.assignee_id == user.id)
    ) or 0
    return {"is_staff": staff, "is_technician": staff or (assigned > 0 and user.role != "owner")}


@router.get("/stats", response_model=TicketStats)
def ticket_stats(db: DbSession, user: CurrentUser):
    staff = is_staff(db, user)
    base = select(SupportTicket)
    if not staff:
        base = base.where(or_(SupportTicket.user_id == user.id, SupportTicket.assignee_id == user.id))
    tickets = db.scalars(base).all()
    now = utcnow()
    out = TicketStats()
    for t in tickets:
        if hasattr(out, t.status):
            setattr(out, t.status, getattr(out, t.status) + 1)
        if t.status in ACTIVE:
            out.urgent_open += t.priority == "urgent"
            out.unassigned += t.assignee_id is None
            out.assigned_to_me += t.assignee_id == user.id
            out.breached += _sla_state(t, now) == "breached"
    rated = [t.rating for t in tickets if t.rating]
    out.avg_rating = round(sum(rated) / len(rated), 2) if rated else None
    return out


@router.get("/staff", response_model=list[TicketUser])
def staff_members(db: DbSession, user: CurrentUser):
    """Assignee picker: every active staff (non-owner) account. Support staff
    first; anyone else becomes a technician on the tickets assigned to them."""
    if user.role == "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Support staff only")
    users = db.scalars(
        select(User).where(User.is_active_user.is_(True), User.role != "owner").order_by(User.username)
    ).all()
    return sorted(users, key=lambda u: (not is_staff(db, u), (u.full_name or u.username).lower()))


@router.get("/tickets", response_model=list[TicketSummary])
def list_tickets(
    db: DbSession,
    user: CurrentUser,
    status_: Optional[str] = Query(default=None, alias="status"),
    scope: str = Query(default="auto", pattern="^(auto|mine|all|assigned|unassigned)$"),
    q: Optional[str] = Query(default=None, max_length=100),
):
    """`status` accepts a single status or `active` (open + in progress + waiting)."""
    staff = is_staff(db, user)
    stmt = select(SupportTicket).options(
        selectinload(SupportTicket.messages),
        selectinload(SupportTicket.user),
        selectinload(SupportTicket.assignee),
    )
    if scope == "mine":
        stmt = stmt.where(SupportTicket.user_id == user.id)
    elif scope == "assigned":
        stmt = stmt.where(SupportTicket.assignee_id == user.id)
    elif not staff:
        stmt = stmt.where(or_(SupportTicket.user_id == user.id, SupportTicket.assignee_id == user.id))
    elif scope == "unassigned":
        stmt = stmt.where(SupportTicket.assignee_id.is_(None))

    if status_ == "active":
        stmt = stmt.where(SupportTicket.status.in_(ACTIVE))
    elif status_:
        stmt = stmt.where(SupportTicket.status == status_)

    if q:
        term = q.strip()
        conds = [SupportTicket.subject.ilike(f"%{term}%")]
        digits = term.upper().removeprefix("TCK-").lstrip("0")
        if digits.isdigit():
            conds.append(SupportTicket.id == int(digits))
        if staff:
            conds.append(SupportTicket.user.has(User.username.ilike(f"%{term}%")))
        stmt = stmt.where(or_(*conds))

    stmt = stmt.order_by(SupportTicket.updated_at.desc()).limit(300)
    now = utcnow()
    return [_summary(t, staff, user.id, now) for t in db.scalars(stmt).all()]


@router.get("/tickets/{ticket_id}", response_model=TicketDetail)
def get_ticket(ticket_id: int, db: DbSession, user: CurrentUser):
    t, staff = _get_visible(db, user, ticket_id)
    return _detail(t, user, staff)


# ── Writes ────────────────────────────────────────────────────────────────────


@router.post("/tickets", response_model=TicketDetail, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    subject: str = Form(..., min_length=3, max_length=200),
    body: str = Form(..., min_length=5, max_length=10000),
    category: TicketCategory = Form("technical"),
    priority: TicketPriority = Form("normal"),
    page_url: Optional[str] = Form(default=None, max_length=500),
    file: Optional[UploadFile] = File(default=None),
):
    now = utcnow()
    t = SupportTicket(
        user_id=user.id,
        subject=subject.strip(),
        category=category,
        priority=priority,
        status="open",
        page_url=(page_url or "").strip() or None,
        user_agent=(request.headers.get("user-agent") or "")[:300] or None,
        created_at=now,
        updated_at=now,
    )
    _apply_sla(t)
    db.add(t)
    db.flush()  # need the id for the attachment prefix
    key, url, name = await _store_attachment(t.id, file)
    db.add(
        SupportTicketMessage(
            ticket_id=t.id,
            author_id=user.id,
            body=body.strip(),
            is_staff=False,
            attachment_key=key,
            attachment_url=url,
            attachment_name=name,
            created_at=now,
        )
    )
    _event(db, t, user, "created", new=priority, at=now)
    db.commit()

    t = _load(db, t.id)
    first = t.messages[0] if t.messages else None
    for addr in _staff_recipients(db):
        mail.send(t, TicketMail(kind="created_staff", to=addr, url=_ticket_url(t, "ar"), for_requester=False,
                                message=first), utcnow())
    if user.is_active_user:
        # Always confirm receipt (the requester just acted).
        mail.send(t, TicketMail(kind="created_requester", to=user.email,
                                url=_ticket_url(t, user.preferred_locale, user), for_requester=True,
                                message=first), utcnow())
    return _detail(t, user, is_staff(db, user))


@router.post("/tickets/{ticket_id}/messages", response_model=TicketDetail)
async def reply(
    ticket_id: int,
    db: DbSession,
    user: CurrentUser,
    body: str = Form(default="", max_length=10000),
    internal: bool = Form(default=False),
    file: Optional[UploadFile] = File(default=None),
):
    t, staff = _get_visible(db, user, ticket_id)
    if t.status == "closed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Ticket is closed — reopen it to reply")
    has_file = file is not None and bool(file.filename)
    if not body.strip() and not has_file:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Write a message or attach a file")

    # A handler replying on their *own* ticket is acting as the requester.
    as_staff = can_manage(t, user, staff) and t.user_id != user.id
    internal = bool(internal and as_staff)

    key, url, name = await _store_attachment(t.id, file)
    now = utcnow()
    msg = SupportTicketMessage(
        ticket_id=t.id,
        author_id=user.id,
        body=body.strip(),
        is_staff=as_staff,
        internal=internal,
        attachment_key=key,
        attachment_url=url,
        attachment_name=name,
        created_at=now,
    )
    db.add(msg)
    _event(db, t, user, "note" if internal else "reply", public=not internal, at=now)
    old_status = t.status
    if not internal:
        if as_staff:
            if t.first_response_at is None:
                t.first_response_at = now
            if t.status in ("open", "in_progress"):
                t.status = "waiting_user"
            if t.assignee_id is None:
                t.assignee_id = user.id
                t.assigned_at = now
                _event(db, t, user, "assigned", new=_name(user), at=now)
        elif t.status in ("waiting_user", "resolved"):
            t.status = "open"
            t.closed_at = None
            t.resolved_at = None
        if t.status != old_status:
            _event(db, t, user, "status", old_status, t.status, at=now)
    t.updated_at = now
    db.commit()

    t = _load(db, t.id)
    msg = next((m for m in t.messages if m.id == msg.id), None)
    if internal:
        _to_handlers(db, t, "note_staff", exclude=user, message=msg, actor_name=_name(user))
    elif as_staff:
        _to_requester(t, "reply_requester", message=msg, actor_name=_name(user))
    else:
        _to_handlers(db, t, "reply_staff", exclude=user, message=msg, actor_name=_name(user))
    return _detail(t, user, staff)


@router.put("/tickets/{ticket_id}", response_model=TicketDetail)
def triage(ticket_id: int, payload: TicketUpdate, db: DbSession, user: CurrentUser):
    t, staff = _get_visible(db, user, ticket_id)
    if not can_manage(t, user, staff):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Support staff only")
    now = utcnow()
    changes: list[Change] = []
    old_assignee = t.assignee
    new_assignee: User | None = None

    if payload.priority and payload.priority != t.priority:
        changes.append(Change("priority", t.priority, payload.priority))
        _event(db, t, user, "priority", t.priority, payload.priority, at=now)
        t.priority = payload.priority
        _apply_sla(t)
    if payload.category and payload.category != t.category:
        changes.append(Change("category", t.category, payload.category))
        _event(db, t, user, "category", t.category, payload.category, at=now)
        t.category = payload.category

    if payload.unassign and t.assignee_id is not None:
        changes.append(Change("assignee", _name(old_assignee), None))
        _event(db, t, user, "unassigned", _name(old_assignee), None, at=now)
        t.assignee_id = None
        t.assigned_at = None
    elif payload.assignee_id is not None and payload.assignee_id != t.assignee_id:
        new_assignee = db.get(User, payload.assignee_id)
        if new_assignee is None or not new_assignee.is_active_user or new_assignee.role == "owner":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Assignee must be an active staff member")
        if not staff and new_assignee.id != user.id:
            # A technician without support.edit may only hand a ticket to support staff.
            if not is_staff(db, new_assignee):
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Only support staff can assign tickets to other technicians")
        changes.append(Change("assignee", _name(old_assignee) if old_assignee else None, _name(new_assignee)))
        _event(db, t, user, "assigned", _name(old_assignee) if old_assignee else None, _name(new_assignee), at=now)
        t.assignee_id = new_assignee.id
        t.assigned_at = now
        if t.status == "open" and not payload.status:
            payload.status = "in_progress"

    if payload.resolution is not None:
        t.resolution = payload.resolution.strip() or None
    new_status = payload.status
    if new_status and new_status != t.status:
        if new_status == "resolved" and not (t.resolution or "").strip():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Write a short resolution summary before resolving")
        changes.append(Change("status", t.status, new_status))
        kind = {"resolved": "resolved", "closed": "closed"}.get(new_status, "status")
        if t.status in ("resolved", "closed") and new_status in ACTIVE:
            kind = "reopened"
        _event(db, t, user, kind if kind != "status" else "status", t.status, new_status, at=now)
        _set_status(t, new_status)

    if not changes and payload.resolution is None:
        return _detail(t, user, staff)
    t.updated_at = now
    db.commit()
    t = _load(db, t.id)

    actor = _name(user)
    status_change = next((c for c in changes if c.field == "status"), None)
    if new_assignee is not None and new_assignee.id != user.id:
        mail.send(t, TicketMail(kind="assigned", to=new_assignee.email, url=_ticket_url(t, "ar"), for_requester=False,
                                changes=changes, actor_name=actor, show_description=True,
                                message=next((m for m in reversed(t.messages) if not m.internal), None)), utcnow())
    elif changes and t.assignee is not None and t.assignee.id != user.id:
        mail.send(t, TicketMail(kind="updated", to=t.assignee.email, url=_ticket_url(t, "ar"), for_requester=False,
                                changes=changes, actor_name=actor), utcnow())
    if changes:
        kind = "resolved" if status_change and status_change.new == "resolved" else "updated"
        _to_requester(t, kind, changes=changes, actor_name=actor)
    return _detail(t, user, staff)


def _set_status(t: SupportTicket, new_status: str) -> None:
    now = utcnow()
    t.status = new_status
    if new_status == "resolved":
        t.resolved_at = t.resolved_at or now
    if new_status in ("resolved", "closed"):
        t.closed_at = t.closed_at or now
    else:
        t.closed_at = None
        t.resolved_at = None


@router.post("/tickets/{ticket_id}/close", response_model=TicketDetail)
def close_ticket(ticket_id: int, db: DbSession, user: CurrentUser):
    """Requester (or staff) marks the issue as done."""
    t, staff = _get_visible(db, user, ticket_id)
    if t.status == "closed":
        return _detail(t, user, staff)
    old = t.status
    _event(db, t, user, "closed", old, "closed")
    _set_status(t, "closed")
    t.updated_at = utcnow()
    db.commit()
    t = _load(db, t.id)
    if t.user_id == user.id:
        _to_handlers(db, t, "closed_staff", exclude=user, changes=[Change("status", old, "closed")], actor_name=_name(user))
    else:
        _to_requester(t, "updated", changes=[Change("status", old, "closed")], actor_name=_name(user))
    return _detail(t, user, staff)


@router.post("/tickets/{ticket_id}/reopen", response_model=TicketDetail)
def reopen_ticket(ticket_id: int, db: DbSession, user: CurrentUser):
    t, staff = _get_visible(db, user, ticket_id)
    if t.status not in ("resolved", "closed"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ticket is already open")
    old = t.status
    _event(db, t, user, "reopened", old, "open")
    _set_status(t, "open")
    t.updated_at = utcnow()
    db.commit()
    t = _load(db, t.id)
    if t.user_id == user.id:
        _to_handlers(db, t, "reopened_staff", exclude=user, changes=[Change("status", old, "open")], actor_name=_name(user))
    else:
        _to_requester(t, "updated", changes=[Change("status", old, "open")], actor_name=_name(user))
    return _detail(t, user, staff)


@router.post("/tickets/{ticket_id}/rate", response_model=TicketDetail)
def rate_ticket(ticket_id: int, payload: TicketRating, db: DbSession, user: CurrentUser):
    """Requester rates the service once the ticket is resolved or closed."""
    t, staff = _get_visible(db, user, ticket_id)
    if t.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the requester can rate this ticket")
    if t.status not in ("resolved", "closed"):
        raise HTTPException(status.HTTP_409_CONFLICT, "You can rate the ticket once it is resolved")
    now = utcnow()
    t.rating = payload.rating
    t.rating_comment = (payload.comment or "").strip() or None
    t.rated_at = now
    _event(db, t, user, "rated", None, str(payload.rating), at=now)
    t.updated_at = now
    db.commit()
    t = _load(db, t.id)
    _to_handlers(db, t, "rated_staff", exclude=user, actor_name=_name(user))
    return _detail(t, user, staff)
