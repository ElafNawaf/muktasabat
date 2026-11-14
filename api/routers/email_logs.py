"""Super-admin e-mail log: every e-mail the system tried to send.

Rows are written by api.email.send_email() (payment alerts, invitations,
password resets, verification, account notices, support tickets, website
enquiries, owner-portal mail). One-time links are redacted before storage.
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, or_, select

from api.deps import CurrentUser, DbSession
from api.models import EmailLog, User

router = APIRouter(prefix="/admin/email-logs", tags=["email-log"])


def require_super_admin(user: CurrentUser) -> User:
    if not user.is_super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Super admin only")
    return user


class EmailLogRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    category: str
    to_email: str
    cc_emails: str | None = None
    subject: str
    status: str
    error: str | None = None


class EmailLogDetail(EmailLogRow):
    text_body: str | None = None
    html_body: str | None = None


class EmailLogPage(BaseModel):
    items: list[EmailLogRow]
    total: int
    # Totals for the current filter window (ignoring the status filter).
    sent: int
    failed: int
    console: int
    categories: list[str]


@router.get("", response_model=EmailLogPage)
def list_email_logs(
    db: DbSession,
    _sa: User = Depends(require_super_admin),
    q: Optional[str] = Query(default=None, max_length=200, description="Recipient, Cc or subject"),
    status_: Optional[str] = Query(default=None, alias="status", pattern="^(sent|failed|console)$"),
    category: Optional[str] = Query(default=None, max_length=40),
    days: int = Query(default=30, ge=1, le=3650),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    since = datetime.utcnow() - timedelta(days=days)
    base = select(EmailLog).where(EmailLog.created_at >= since)
    if category:
        base = base.where(EmailLog.category == category)
    if q:
        like = f"%{q.strip()}%"
        base = base.where(
            or_(EmailLog.to_email.ilike(like), EmailLog.cc_emails.ilike(like), EmailLog.subject.ilike(like))
        )
    sub = base.subquery()
    counts = dict(db.execute(select(sub.c.status, func.count()).group_by(sub.c.status)).all())
    stmt = base.where(EmailLog.status == status_) if status_ else base
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(EmailLog.created_at.desc(), EmailLog.id.desc()).limit(limit).offset(offset)).all()
    cats = db.scalars(select(EmailLog.category).distinct().order_by(EmailLog.category)).all()
    return EmailLogPage(
        items=[EmailLogRow.model_validate(r) for r in rows],
        total=total,
        sent=counts.get("sent", 0),
        failed=counts.get("failed", 0),
        console=counts.get("console", 0),
        categories=list(cats),
    )


@router.get("/{log_id}", response_model=EmailLogDetail)
def get_email_log(log_id: int, db: DbSession, _sa: User = Depends(require_super_admin)):
    row = db.get(EmailLog, log_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return row
