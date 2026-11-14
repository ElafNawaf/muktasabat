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
from api.email import last_send_error, send_account_invite, send_password_reset_email
from api.models import AuditLog, User

logger = logging.getLogger(__name__)

INVITE_HOURS = 72
RESET_HOURS = 24
_PLACEHOLDER = re.compile(r"@(muktasbat\.app|example\.(com|org)|localhost|.*\.local)$", re.I)


def _mask(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"


def reinvite_users(
    db: Session,
    *,
    exclude_usernames: set[str] | None = None,
    actor: User | None = None,
    user_ids: list[int] | None = None,
    kind: str = "invite",
) -> dict:
    """Email users a set-password link.

    kind="invite" → invitation e-mail (username + 72 h link), for people who
    never set a password; kind="reset" → "your administrator sent you a reset
    link" e-mail (24 h). `user_ids` limits it to those users (no exclusions
    other than deactivated / placeholder addresses); without it, everyone
    except `exclude_usernames` is e-mailed.
    """
    from api.routers.auth import _hash_reset_token  # same token format as password reset

    if kind not in ("invite", "reset"):
        raise ValueError("kind must be 'invite' or 'reset'")
    hours = INVITE_HOURS if kind == "invite" else RESET_HOURS
    exclude = set() if user_ids else {u.lower() for u in (exclude_usernames or {"admin"})}
    base = get_settings().web_base_url.rstrip("/")
    report = {"sent": [], "failed": [], "skipped": []}
    links: list[dict] = []
    stmt = select(User).order_by(User.id)
    if user_ids:
        stmt = stmt.where(User.id.in_(user_ids))
    for user in db.scalars(stmt).all():
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
        user.password_reset_expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=hours)
        db.commit()
        loc = user.preferred_locale if getattr(user, "preferred_locale", None) in ("ar", "en") else "ar"
        url = f"{base}/{loc}/reset-password?token={raw}"
        if kind == "invite":
            portal = "owner" if user.role == "owner" else "staff"
            ok = send_account_invite(email, user.username, url, INVITE_HOURS, portal)
        else:
            ok = send_password_reset_email(email, url, user.username, hours=RESET_HOURS, by_admin=True)
        (report["sent"] if ok else report["failed"]).append(f"{tag} {_mask(email)}")
        links.append({
            "id": user.id, "username": user.username, "email": email, "role": user.role,
            "emailed": ok, "url": url, "reason": None if ok else last_send_error(),
        })
        db.add(
            AuditLog(
                user_id=actor.id if actor else None,
                username=actor.username if actor else "system",
                action="user_reinvite" if kind == "invite" else "admin_send_reset",
                entity_type="user",
                entity_id=str(user.id),
            )
        )
        db.commit()
    logger.info("reinvite: sent=%d failed=%d skipped=%d", len(report["sent"]), len(report["failed"]), len(report["skipped"]))
    return {**report, "links": links, "kind": kind, "hours": hours}
