import hashlib
import logging
import secrets
from datetime import timedelta
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select

from api.config import get_settings
from api.deps import AdminUser, CurrentUser, DbSession
from api.permissions import Perm
from api.email import (
    send_email_verification,
    send_password_changed_notice,
    send_password_reset_email,
    send_user_invite,
)
from api.models import AuditLog, User
from api.schemas.auth import (
    AccessTokenResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    InviteUserRequest,
    InviteUserResponse,
    LoginResponse,
    RefreshRequest,
    RegisterRequest,
    ResendVerificationRequest,
    ResendVerificationResponse,
    ResetPasswordRequest,
    RoleUpdateRequest,
    UserRead,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from api.security import create_token, decode_token, is_expired, token_matches_user, utcnow

logger = logging.getLogger(__name__)


def _hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _hash_verify_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _absolute(path: str) -> str:
    base = get_settings().web_base_url.rstrip("/")
    return f"{base}{path}"


def _loc(locale: str | None, user: User | None = None) -> str:
    """Locale for links in emails: explicit request locale, else the user's."""
    for v in (locale, getattr(user, "preferred_locale", None)):
        if v in ("ar", "en"):
            return v
    return "ar"


def _find_login_user(db, identifier: str) -> User | None:
    """Sign in with either the username or the email address."""
    ident = identifier.strip()
    user = db.scalar(select(User).where(User.username == ident))
    if user is None and "@" in ident:
        user = db.scalar(select(User).where(func.lower(User.email) == ident.lower()))
    return user


def issue_tokens(user: User) -> tuple[str, str]:
    v = user.token_version or 0
    return create_token(user.id, "access", version=v), create_token(user.id, "refresh", version=v)


def _issue_reset_token(user: User, hours: int) -> str:
    raw = secrets.token_urlsafe(32)
    user.password_reset_token = _hash_reset_token(raw)
    user.password_reset_expires = utcnow() + timedelta(hours=hours)
    return raw

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(
    db: DbSession,
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
):
    """OAuth2-compatible login (form-encoded). `username` may be the username or
    the email address. Returns JWT access + refresh tokens."""
    user = _find_login_user(db, form_data.username)
    if user is None or not user.check_password(form_data.password) or not user.is_active_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            action="login",
            entity_type="user",
            ip_address=_client_ip(request),
        )
    )
    user.last_login_at = utcnow()
    db.commit()
    db.refresh(user)

    access, refresh_tok = issue_tokens(user)
    return LoginResponse(
        access_token=access,
        refresh_token=refresh_tok,
        user=UserRead.model_validate(user),
    )


def _client_ip(request: Request) -> str | None:
    """Real client IP — Next.js forwards X-Forwarded-For from Caddy."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()[:45]
    return request.client.host if request.client else None


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: DbSession):
    """Request a password reset. Always returns success message (no email enumeration)."""
    settings = get_settings()
    user = db.scalar(select(User).where(func.lower(User.email) == str(payload.email).lower()))
    debug_url: str | None = None

    if user is not None and user.is_active_user:
        raw = _issue_reset_token(user, hours=1)
        db.add(user)
        db.commit()

        loc = _loc(payload.locale, user)
        reset_url = _absolute(f"/{loc}/reset-password?token={raw}")
        send_password_reset_email(to=user.email, reset_url=reset_url, locale=user.preferred_locale)

        if settings.reset_password_debug:
            debug_url = f"/reset-password?token={raw}"
            logger.warning(
                "reset_password_debug is enabled: reset token issued for user_id=%s (do not use in production)",
                user.id,
            )

    return ForgotPasswordResponse(
        ok=True,
        message="If an account exists for this email, password reset instructions have been sent.",
        debug_reset_url=debug_url,
    )


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(payload: ResetPasswordRequest, db: DbSession):
    """Complete password reset using token from forgot-password email (or debug URL)."""
    digest = _hash_reset_token(payload.token)
    user = db.scalar(select(User).where(User.password_reset_token == digest))
    if user is None or is_expired(user.password_reset_expires):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset link")

    user.set_password(payload.new_password)
    user.password_reset_token = None
    user.password_reset_expires = None
    user.password_changed_at = utcnow()
    # Following an emailed link proves the inbox.
    user.email_verified = True
    # Revoke every existing session — whoever had the old password is out.
    user.token_version = (user.token_version or 0) + 1
    db.add(
        AuditLog(user_id=user.id, username=user.username, action="password_reset", entity_type="user")
    )
    db.add(user)
    db.commit()
    send_password_changed_notice(to=user.email, username=user.username, locale=user.preferred_locale)
    return None


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: DbSession):
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already exists")

    user = User(username=payload.username, email=payload.email, role="viewer")
    user.set_password(payload.password)

    raw = secrets.token_urlsafe(32)
    user.email_verification_token = _hash_verify_token(raw)
    user.email_verification_expires = utcnow() + timedelta(hours=24)

    db.add(user)
    db.commit()
    db.refresh(user)

    verify_url = _absolute(f"/{_loc(None, user)}/verify-email?token={raw}")
    send_email_verification(to=user.email, verify_url=verify_url, locale=user.preferred_locale)
    return user


@router.post("/verify-email", response_model=VerifyEmailResponse)
def verify_email(payload: VerifyEmailRequest, db: DbSession):
    digest = _hash_verify_token(payload.token)
    user = db.scalar(select(User).where(User.email_verification_token == digest))
    if user is None or is_expired(user.email_verification_expires):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification link")

    user.email_verified = True
    user.email_verification_token = None
    user.email_verification_expires = None
    db.add(user)
    db.commit()
    return VerifyEmailResponse(ok=True, user_id=user.id)


@router.post("/resend-verification", response_model=ResendVerificationResponse)
def resend_verification(payload: ResendVerificationRequest, db: DbSession):
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == str(payload.email)))
    debug_url: str | None = None

    if user is not None and not user.email_verified:
        raw = secrets.token_urlsafe(32)
        user.email_verification_token = _hash_verify_token(raw)
        user.email_verification_expires = utcnow() + timedelta(hours=24)
        db.add(user)
        db.commit()
        verify_url = _absolute(f"/{_loc(None, user)}/verify-email?token={raw}")
        send_email_verification(to=user.email, verify_url=verify_url, locale=user.preferred_locale)
        if settings.reset_password_debug:
            debug_url = f"/verify-email?token={raw}"

    return ResendVerificationResponse(debug_verify_url=debug_url)


@router.post("/refresh", response_model=AccessTokenResponse)
def refresh(payload: RefreshRequest, db: DbSession):
    try:
        decoded = decode_token(payload.refresh_token)
        if decoded.get("type") != "refresh":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
        user_id = int(decoded["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    user = db.get(User, user_id)
    if user is None or not user.is_active_user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer active")
    if not token_matches_user(decoded, user):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session was signed out")

    return AccessTokenResponse(
        access_token=create_token(user.id, "access", version=user.token_version or 0)
    )


@router.get("/me", response_model=UserRead)
def me(user: CurrentUser):
    return user


@router.get("/users", response_model=list[UserRead])
def list_users_for_picker(db: DbSession, _user: CurrentUser):
    """Lightweight user list for assignee/owner pickers (any authenticated user)."""
    return db.scalars(select(User).where(User.is_active_user.is_(True)).order_by(User.username)).all()


# ---------- Admin: User Management ----------

@router.get("/admin/users", response_model=list[UserRead])
def list_users(db: DbSession, _admin: AdminUser):
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return users


@router.put("/admin/users/{user_id}/role", response_model=UserRead)
def change_role(
    user_id: int,
    payload: RoleUpdateRequest,
    db: DbSession,
    _admin: AdminUser,
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.role = payload.role
    db.commit()
    db.refresh(user)
    return user


@router.put("/admin/users/{user_id}/toggle-active", response_model=UserRead)
def toggle_active(user_id: int, db: DbSession, _admin: AdminUser):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == _admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot deactivate your own account")
    user.is_active_user = not user.is_active_user
    if not user.is_active_user:
        user.token_version = (user.token_version or 0) + 1
    db.commit()
    db.refresh(user)
    return user


@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: DbSession, actor: Perm("users", "delete")):
    if user_id == actor.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete your own account")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.role == "admin":
        admin_count = db.scalar(
            select(func.count()).select_from(User).where(
                User.role == "admin",
                User.is_active_user.is_(True),
            )
        )
        if admin_count is not None and admin_count <= 1:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Cannot delete the last active administrator",
            )
    user.is_active_user = False
    db.commit()


@router.post(
    "/admin/users/invite",
    response_model=InviteUserResponse,
    status_code=status.HTTP_201_CREATED,
)
def invite_user(payload: InviteUserRequest, db: DbSession, _admin: AdminUser):
    """Create a user with a random temp password and email them a reset link.

    The invitee never sees the temp password — they're sent the standard
    reset-password link, which sets their final password and lets them log in.
    Email-verified is set to True since the invite proves the address.
    """
    settings = get_settings()
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
    if db.scalar(select(User).where(User.email == str(payload.email))):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already exists")

    user = User(
        username=payload.username,
        email=str(payload.email),
        role=payload.role,
        is_active_user=True,
        email_verified=True,
    )
    user.set_password(secrets.token_urlsafe(24))

    # 24h window matches the email copy.
    raw = _issue_reset_token(user, hours=24)

    db.add(user)
    db.commit()
    db.refresh(user)

    accept_url = _absolute(f"/{_loc(None, user)}/reset-password?token={raw}")
    send_user_invite(
        to=user.email,
        username=user.username,
        role=user.role,
        accept_url=accept_url,
        locale=user.preferred_locale,
    )

    debug_url = f"/reset-password?token={raw}" if settings.reset_password_debug else None
    return InviteUserResponse(user=UserRead.model_validate(user), debug_invite_url=debug_url)


@router.post("/admin/users/{user_id}/send-reset", response_model=ForgotPasswordResponse)
def admin_send_reset(user_id: int, db: DbSession, admin: AdminUser):
    """Admin helpdesk action: email the user a fresh password-reset link (24h)."""
    settings = get_settings()
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if not user.is_active_user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User is deactivated")
    raw = _issue_reset_token(user, hours=24)
    db.add(
        AuditLog(
            user_id=admin.id,
            username=admin.username,
            action="admin_send_reset",
            entity_type="user",
            entity_id=str(user.id),
        )
    )
    db.commit()
    reset_url = _absolute(f"/{_loc(None, user)}/reset-password?token={raw}")
    send_password_reset_email(to=user.email, reset_url=reset_url, locale=user.preferred_locale)
    return ForgotPasswordResponse(
        message="Reset link sent.",
        debug_reset_url=f"/reset-password?token={raw}" if settings.reset_password_debug else None,
    )


@router.post("/admin/users/{user_id}/revoke-sessions", status_code=status.HTTP_204_NO_CONTENT)
def admin_revoke_sessions(user_id: int, db: DbSession, admin: AdminUser):
    """Sign a user out of every device (e.g. lost laptop)."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.token_version = (user.token_version or 0) + 1
    db.add(
        AuditLog(
            user_id=admin.id,
            username=admin.username,
            action="admin_revoke_sessions",
            entity_type="user",
            entity_id=str(user.id),
        )
    )
    db.commit()
