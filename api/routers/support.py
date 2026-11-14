"""Technical support tickets (الدعم الفني).

Any signed-in user can open tickets and talk to support in a thread. Users with
the `support.edit` permission (admins by default) are *staff*: they see every
ticket, triage it (status / priority / assignee) and can leave internal notes
that the requester never sees.
"""
import io
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from api.config import get_settings
from api.deps import CurrentUser, DbSession
from api.email import (
    send_ticket_created_to_staff,
    send_ticket_received,
    send_ticket_reply_to_user,
    send_ticket_status_to_user,
    send_ticket_user_reply_to_staff,
)
from api.models import SupportTicket, SupportTicketMessage, User
from api.permissions import has_permission
from api.routers.auth import _absolute
from api.schemas.support import (
    TicketCategory,
    TicketDetail,
    TicketMessageRead,
    TicketPriority,
    TicketStats,
    TicketSummary,
    TicketUpdate,
    TicketUser,
)
from api.security import utcnow
from api.storage import StorageNotConfigured, upload_document

router = APIRouter(prefix="/support", tags=["support"])

ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
ACTIVE = ("open", "in_progress", "waiting_user")
STATUS_LABELS = {
    "open": ("مفتوحة", "Open"),
    "in_progress": ("قيد المعالجة", "In progress"),
    "waiting_user": ("بانتظار ردك", "Waiting for your reply"),
    "resolved": ("تم الحل", "Resolved"),
    "closed": ("مغلقة", "Closed"),
}


def ref(ticket_id: int) -> str:
    return f"TCK-{ticket_id:05d}"


def is_staff(db: Session, user: User) -> bool:
    return has_permission(db, user, "support", "edit")


def _ticket_url(ticket: SupportTicket, locale: str | None) -> str:
    loc = locale if locale in ("ar", "en") else "ar"
    return _absolute(f"/{loc}/support/{ticket.id}")


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
            selectinload(SupportTicket.user),
            selectinload(SupportTicket.assignee),
        )
    )
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return t


def _get_visible(db: Session, user: User, ticket_id: int) -> tuple[SupportTicket, bool]:
    t = _load(db, ticket_id)
    staff = is_staff(db, user)
    if not staff and t.user_id != user.id:
        # 404, not 403 — don't confirm other people's ticket ids exist.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return t, staff


def _summary(t: SupportTicket, viewer_is_staff: bool, viewer_id: int) -> dict:
    public = [m for m in t.messages if not m.internal]
    last = public[-1] if public else None
    awaiting = False
    if last is not None and t.status in ACTIVE:
        if viewer_is_staff and t.user_id != viewer_id:
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
    )


def _detail(t: SupportTicket, viewer_is_staff: bool, viewer_id: int) -> TicketDetail:
    msgs = [m for m in t.messages if viewer_is_staff or not m.internal]
    return TicketDetail(
        **_summary(t, viewer_is_staff, viewer_id),
        page_url=t.page_url,
        user_agent=t.user_agent if viewer_is_staff else None,
        messages=[TicketMessageRead.model_validate(m) for m in msgs],
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


# ------------------------------------------------------------------ reads


@router.get("/me")
def support_context(db: DbSession, user: CurrentUser):
    """Tells the UI whether the caller gets the staff (triage) view."""
    return {"is_staff": is_staff(db, user)}


@router.get("/stats", response_model=TicketStats)
def ticket_stats(db: DbSession, user: CurrentUser):
    staff = is_staff(db, user)
    q = select(SupportTicket.status, func.count()).group_by(SupportTicket.status)
    urgent_q = select(func.count()).select_from(SupportTicket).where(
        SupportTicket.priority == "urgent", SupportTicket.status.in_(ACTIVE)
    )
    if not staff:
        q = q.where(SupportTicket.user_id == user.id)
        urgent_q = urgent_q.where(SupportTicket.user_id == user.id)
    out = TicketStats()
    for st, n in db.execute(q).all():
        if hasattr(out, st):
            setattr(out, st, n)
    out.urgent_open = db.scalar(urgent_q) or 0
    return out


@router.get("/staff", response_model=list[TicketUser])
def staff_members(db: DbSession, user: CurrentUser):
    """Assignee picker — users who can handle tickets."""
    if not is_staff(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Support staff only")
    users = db.scalars(select(User).where(User.is_active_user.is_(True)).order_by(User.username)).all()
    return [u for u in users if is_staff(db, u)]


@router.get("/tickets", response_model=list[TicketSummary])
def list_tickets(
    db: DbSession,
    user: CurrentUser,
    status_: Optional[str] = Query(default=None, alias="status"),
    scope: str = Query(default="auto", pattern="^(auto|mine|all|assigned)$"),
    q: Optional[str] = Query(default=None, max_length=100),
):
    """`status` accepts a single status or `active` (open + in progress + waiting)."""
    staff = is_staff(db, user)
    stmt = select(SupportTicket).options(
        selectinload(SupportTicket.messages),
        selectinload(SupportTicket.user),
        selectinload(SupportTicket.assignee),
    )
    if not staff or scope == "mine":
        stmt = stmt.where(SupportTicket.user_id == user.id)
    elif scope == "assigned":
        stmt = stmt.where(SupportTicket.assignee_id == user.id)

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
    return [_summary(t, staff, user.id) for t in db.scalars(stmt).all()]


@router.get("/tickets/{ticket_id}", response_model=TicketDetail)
def get_ticket(ticket_id: int, db: DbSession, user: CurrentUser):
    t, staff = _get_visible(db, user, ticket_id)
    return _detail(t, staff, user.id)


# ----------------------------------------------------------------- writes


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
    db.commit()

    t = _load(db, t.id)
    requester = user.full_name or user.username
    for addr in _staff_recipients(db):
        send_ticket_created_to_staff(
            to=addr,
            ticket_ref=ref(t.id),
            subject=t.subject,
            requester=requester,
            priority=t.priority,
            url=_ticket_url(t, "ar"),
        )
    send_ticket_received(
        to=user.email,
        ticket_ref=ref(t.id),
        subject=t.subject,
        url=_ticket_url(t, user.preferred_locale),
        locale=user.preferred_locale,
    )
    return _detail(t, is_staff(db, user), user.id)


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

    # A staff member replying on their *own* ticket is acting as the requester.
    as_staff = staff and t.user_id != user.id
    internal = bool(internal and as_staff)

    key, url, name = await _store_attachment(t.id, file)
    now = utcnow()
    db.add(
        SupportTicketMessage(
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
    )
    if not internal:
        if as_staff and t.status in ("open", "in_progress"):
            t.status = "waiting_user"
        elif not as_staff and t.status in ("waiting_user", "resolved"):
            t.status = "open"
            t.closed_at = None
        if as_staff and t.assignee_id is None:
            t.assignee_id = user.id
    t.updated_at = now
    db.commit()

    t = _load(db, t.id)
    if not internal:
        if as_staff:
            if t.user.notify_ticket_updates and t.user.is_active_user:
                send_ticket_reply_to_user(
                    to=t.user.email,
                    ticket_ref=ref(t.id),
                    subject=t.subject,
                    excerpt=(body.strip()[:280] or (name or "")),
                    url=_ticket_url(t, t.user.preferred_locale),
                    locale=t.user.preferred_locale,
                )
        else:
            targets = [t.assignee.email] if t.assignee else _staff_recipients(db)
            for addr in targets:
                send_ticket_user_reply_to_staff(
                    to=addr,
                    ticket_ref=ref(t.id),
                    subject=t.subject,
                    requester=user.full_name or user.username,
                    url=_ticket_url(t, "ar"),
                )
    return _detail(t, staff, user.id)


@router.put("/tickets/{ticket_id}", response_model=TicketDetail)
def triage(ticket_id: int, payload: TicketUpdate, db: DbSession, user: CurrentUser):
    t, staff = _get_visible(db, user, ticket_id)
    if not staff:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Support staff only")
    old_status = t.status
    if payload.priority:
        t.priority = payload.priority
    if payload.unassign:
        t.assignee_id = None
    elif payload.assignee_id is not None:
        assignee = db.get(User, payload.assignee_id)
        if assignee is None or not assignee.is_active_user or not is_staff(db, assignee):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Assignee must be an active support staff member")
        t.assignee_id = assignee.id
    if payload.status:
        _set_status(t, payload.status)
    t.updated_at = utcnow()
    db.commit()
    t = _load(db, t.id)
    if payload.status and payload.status != old_status:
        _notify_status(t)
    return _detail(t, staff, user.id)


def _set_status(t: SupportTicket, new_status: str) -> None:
    t.status = new_status
    if new_status in ("resolved", "closed"):
        t.closed_at = t.closed_at or utcnow()
    else:
        t.closed_at = None


def _notify_status(t: SupportTicket) -> None:
    if t.status not in ("resolved", "closed", "in_progress"):
        return
    if not (t.user.notify_ticket_updates and t.user.is_active_user):
        return
    ar, en = STATUS_LABELS[t.status]
    send_ticket_status_to_user(
        to=t.user.email,
        ticket_ref=ref(t.id),
        subject=t.subject,
        status_ar=ar,
        status_en=en,
        url=_ticket_url(t, t.user.preferred_locale),
        locale=t.user.preferred_locale,
    )


@router.post("/tickets/{ticket_id}/close", response_model=TicketDetail)
def close_ticket(ticket_id: int, db: DbSession, user: CurrentUser):
    """Requester (or staff) marks the issue as done."""
    t, staff = _get_visible(db, user, ticket_id)
    _set_status(t, "closed")
    t.updated_at = utcnow()
    db.commit()
    return _detail(_load(db, t.id), staff, user.id)


@router.post("/tickets/{ticket_id}/reopen", response_model=TicketDetail)
def reopen_ticket(ticket_id: int, db: DbSession, user: CurrentUser):
    t, staff = _get_visible(db, user, ticket_id)
    if t.status not in ("resolved", "closed"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ticket is already open")
    _set_status(t, "open")
    t.updated_at = utcnow()
    db.commit()
    return _detail(_load(db, t.id), staff, user.id)
