"""Re-send account invitations (username + 72-hour set-password link).

Used by `POST /auth/admin/users/reinvite` and by one-off ops runs. Existing
passwords keep working until the user sets a new one through the link.
"""
from __future__ import annotations

import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.config import get_settings
from api.email import send_account_invite
from api.models import AuditLog, User

logger = logging.getLogger(__name__)

INVITE_HOURS = 72
_PLACEHOLDER = re.compile(r"@(muktasbat\.app|example\.(com|org)|localhost|.*\.local)$", re.I)


def _mask(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"


def reinvite_users(db: Session, *, exclude_usernames: set[str] | None = None, actor: User | None = None) -> dict:
    from api.routers.auth import _hash_reset_token  # same token format as password reset

    exclude = {u.lower() for u in (exclude_usernames or {"admin"})}
    base = get_settings().web_base_url.rstrip("/")
    report = {"sent": [], "failed": [], "skipped": []}
    for user in db.scalars(select(User).order_by(User.id)).all():
        tag = f"#{user.id} {user.role}"
        if user.username.lower() in exclude:
            report["skipped"].append(f"{tag} excluded")
            continue
        if not user.is_active_user:
            report["skipped"].append(f"{tag} deactivated")
            continue
        email = (user.email or "").strip()
        if not email or _PLACEHOLDER.search(email):
            report["skipped"].append(f"{tag} no real email")
            continue
        raw = secrets.token_urlsafe(32)
        user.password_reset_token = _hash_reset_token(raw)
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=INVITE_HOURS)
        db.commit()
        url = f"{base}/ar/reset-password?token={raw}"
        portal = "owner" if user.role == "owner" else "staff"
        ok = send_account_invite(email, user.username, url, INVITE_HOURS, portal)
        (report["sent"] if ok else report["failed"]).append(f"{tag} {_mask(email)}")
        db.add(
            AuditLog(
                user_id=actor.id if actor else None,
                username=actor.username if actor else "system",
                action="user_reinvite",
                entity_type="user",
                entity_id=str(user.id),
            )
        )
        db.commit()
    logger.info("reinvite: sent=%d failed=%d skipped=%d", len(report["sent"]), len(report["failed"]), len(report["skipped"]))
    return report
