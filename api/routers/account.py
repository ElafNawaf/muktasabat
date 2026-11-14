"""My account — self-service profile, credentials and sessions for any user.

Everything here acts on the *calling* user only; admin actions on other users
live under /auth/admin/*.
"""
import hashlib
import io
import secrets
from datetime import timedelta

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from sqlalchemy import func, select

from api.config import get_settings
from api.deps import CurrentUser, DbSession
from api.email import (
    send_email_change_alert,
    send_email_change_confirmation,
    send_password_changed_notice,
)
from api.models import AuditLog, User
from api.routers.auth import _absolute, _client_ip, issue_tokens
from api.schemas.account import (
    ChangeEmailRequest,
    ChangeEmailResponse,
    ChangePasswordRequest,
    ChangePasswordResponse,
    ChangeUsernameRequest,
    ConfirmEmailRequest,
    LoginActivity,
    ProfileRead,
    ProfileUpdate,
)
from api.security import is_expired, utcnow
from api.storage import StorageNotConfigured, delete_object, upload_image

router = APIRouter(prefix="/account", tags=["account"])

AVATAR_MAX_BYTES = 5 * 1024 * 1024
_ACTIVITY_ACTIONS = (
    "login",
    "password_changed",
    "password_reset",
    "username_changed",
    "email_change_requested",
    "email_changed",
    "logout_all",
    "admin_send_reset",
    "admin_revoke_sessions",
)


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _audit(db, user: User, action: str, request: Request | None = None, details: dict | None = None):
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action=action,
            entity_type="user",
            entity_id=str(user.id),
            details=details,
            ip_address=_client_ip(request) if request else None,
        )
    )


def _require_password(user: User, password: str) -> None:
    if not user.check_password(password):
        # 400 rather than 401 so the web client doesn't treat it as a dead session.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")


# ---------------------------------------------------------------- profile


@router.get("/profile", response_model=ProfileRead)
def get_profile(user: CurrentUser):
    return user


@router.put("/profile", response_model=ProfileRead)
def update_profile(payload: ProfileUpdate, db: DbSession, user: CurrentUser):
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        if isinstance(value, str):
            value = value.strip() or None
        if field in ("preferred_locale", "notify_ticket_updates") and value is None:
            continue  # non-nullable columns
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/avatar", response_model=ProfileRead)
async def upload_avatar(db: DbSession, user: CurrentUser, file: UploadFile = File(...)):
    content = await file.read(AVATAR_MAX_BYTES + 1)
    if len(content) > AVATAR_MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Image must be 5 MB or smaller")
    try:
        stored = upload_image(
            io.BytesIO(content),
            content_type=file.content_type or "application/octet-stream",
            prefix=f"avatars/{user.id}",
            original_filename=file.filename,
        )
    except StorageNotConfigured as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    old_key = user.avatar_key
    user.avatar_key = stored.object_key
    user.avatar_url = stored.public_url
    db.commit()
    db.refresh(user)
    delete_object(old_key)
    return user


@router.delete("/avatar", response_model=ProfileRead)
def remove_avatar(db: DbSession, user: CurrentUser):
    old_key = user.avatar_key
    user.avatar_key = None
    user.avatar_url = None
    db.commit()
    db.refresh(user)
    delete_object(old_key)
    return user


# ------------------------------------------------------------ credentials


@router.post("/password", response_model=ChangePasswordResponse)
def change_password(payload: ChangePasswordRequest, request: Request, db: DbSession, user: CurrentUser):
    _require_password(user, payload.current_password)
    if payload.current_password == payload.new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New password must differ from the current one")
    if payload.new_password.lower() in {user.username.lower(), user.email.lower()}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password cannot be your username or email")

    user.set_password(payload.new_password)
    user.password_changed_at = utcnow()
    user.password_reset_token = None
    user.password_reset_expires = None
    # Sign out every other device; this one gets fresh tokens below.
    user.token_version = (user.token_version or 0) + 1
    _audit(db, user, "password_changed", request)
    db.commit()
    db.refresh(user)

    send_password_changed_notice(to=user.email, username=user.username, locale=user.preferred_locale)
    access, refresh = issue_tokens(user)
    return ChangePasswordResponse(access_token=access, refresh_token=refresh)


@router.post("/username", response_model=ProfileRead)
def change_username(payload: ChangeUsernameRequest, request: Request, db: DbSession, user: CurrentUser):
    _require_password(user, payload.current_password)
    new = payload.new_username.strip()
    if new == user.username:
        return user
    clash = db.scalar(select(User).where(func.lower(User.username) == new.lower(), User.id != user.id))
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
    old = user.username
    user.username = new
    _audit(db, user, "username_changed", request, {"from": old, "to": new})
    db.commit()
    db.refresh(user)
    return user


@router.post("/email", response_model=ChangeEmailResponse)
def request_email_change(payload: ChangeEmailRequest, request: Request, db: DbSession, user: CurrentUser):
    """Step 1: store the new address as pending and email it a confirmation link."""
    _require_password(user, payload.current_password)
    new = str(payload.new_email).strip()
    if new.lower() == user.email.lower():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This is already your email address")
    clash = db.scalar(select(User).where(func.lower(User.email) == new.lower(), User.id != user.id))
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already exists")

    raw = secrets.token_urlsafe(32)
    user.pending_email = new
    user.email_change_token = _hash(raw)
    user.email_change_expires = utcnow() + timedelta(hours=24)
    _audit(db, user, "email_change_requested", request, {"to": new})
    db.commit()

    loc = user.preferred_locale if user.preferred_locale in ("ar", "en") else "ar"
    confirm_url = _absolute(f"/{loc}/confirm-email?token={raw}")
    send_email_change_confirmation(to=new, confirm_url=confirm_url, username=user.username, locale=loc)
    send_email_change_alert(to=user.email, new_email=new, username=user.username, locale=loc)

    debug = f"/confirm-email?token={raw}" if get_settings().reset_password_debug else None
    return ChangeEmailResponse(pending_email=new, debug_confirm_url=debug)


@router.delete("/email/pending", response_model=ProfileRead)
def cancel_email_change(db: DbSession, user: CurrentUser):
    user.pending_email = None
    user.email_change_token = None
    user.email_change_expires = None
    db.commit()
    db.refresh(user)
    return user


@router.post("/confirm-email", response_model=ProfileRead)
def confirm_email_change(payload: ConfirmEmailRequest, db: DbSession):
    """Step 2 (public — the link may be opened on another device)."""
    user = db.scalar(select(User).where(User.email_change_token == _hash(payload.token)))
    if user is None or not user.pending_email or is_expired(user.email_change_expires):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired confirmation link")
    new = user.pending_email
    clash = db.scalar(select(User).where(func.lower(User.email) == new.lower(), User.id != user.id))
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already exists")
    old = user.email
    user.email = new
    user.email_verified = True
    user.pending_email = None
    user.email_change_token = None
    user.email_change_expires = None
    _audit(db, user, "email_changed", None, {"from": old, "to": new})
    db.commit()
    db.refresh(user)
    return user


# --------------------------------------------------------------- sessions


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_everywhere(request: Request, db: DbSession, user: CurrentUser):
    """Revoke every access/refresh token issued so far, including this one."""
    user.token_version = (user.token_version or 0) + 1
    _audit(db, user, "logout_all", request)
    db.commit()


@router.get("/activity", response_model=list[LoginActivity])
def recent_activity(db: DbSession, user: CurrentUser):
    rows = db.scalars(
        select(AuditLog)
        .where(
            AuditLog.action.in_(_ACTIVITY_ACTIONS),
            (AuditLog.user_id == user.id) | (AuditLog.entity_id == str(user.id)),
            AuditLog.entity_type == "user",
        )
        .order_by(AuditLog.timestamp.desc())
        .limit(20)
    ).all()
    # Admin actions on this account are logged under the admin's user_id with
    # entity_id = this user; they're relevant to the user too, but a user's own
    # actions on *other* accounts (if admin) are not.
    out = []
    for r in rows:
        if r.action.startswith("admin_") and r.entity_id != str(user.id):
            continue
        out.append(LoginActivity(timestamp=r.timestamp, ip_address=r.ip_address, action=r.action))
    return out
