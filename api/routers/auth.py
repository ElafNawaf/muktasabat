import hashlib
import logging
import secrets
from datetime import timedelta
from typing import Annotated, Optional

from pydantic import BaseModel

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
    MeRead,
    AdminSetPasswordRequest,
    ReinviteRequest,
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
    """OAuth2-compatible login (form-encoded). Returns JWT access + refresh tokens."""
    # Accept the username (any capitalisation) or the account email, so people
    # who only remember the address they reset the password for can sign in.
    ident = (form_data.username or "").strip()
    user = db.scalar(select(User).where(User.username == ident))
    if user is None and ident:
        user = db.scalar(
            select(User).where(
                (func.lower(User.username) == ident.lower()) | (func.lower(User.email) == ident.lower())
            )
        )
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
    # Case-insensitive: users type their address with any capitalisation.
    user = db.scalar(select(User).where(func.lower(User.email) == str(payload.email).strip().lower()))
    debug_url: str | None = None

    if user is not None and user.is_active_user:
        raw = _issue_reset_token(user, hours=1)
        db.add(user)
        db.commit()

        loc = _loc(payload.locale, user)
        reset_url = _absolute(f"/{loc}/reset-password?token={raw}")
        send_password_reset_email(to=user.email, reset_url=reset_url, username=user.username)

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

    # No access until an administrator assigns a role (see api/deps.PENDING_ROLE).
    user = User(username=payload.username, email=payload.email, role="pending")
    user.set_password(payload.password)

    raw = secrets.token_urlsafe(32)
    user.email_verification_token = _hash_verify_token(raw)
    user.email_verification_expires = utcnow() + timedelta(hours=24)

    db.add(user)
    db.commit()
    db.refresh(user)

    verify_url = _absolute(f"/{_loc(None, user)}/verify-email?token={raw}")
    send_email_verification(to=user.email, verify_url=verify_url)
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
    if user.role == "pending":
        # Tell the administrators someone is waiting for a role.
        from api.email import send_account_awaiting_role

        url = _absolute(f"/ar/users?q={user.username}")
        for a in db.scalars(select(User).where(User.role == "admin", User.is_active_user.is_(True))).all():
            if a.email:
                try:
                    send_account_awaiting_role(a.email, user.username, user.email, url)
                except Exception:  # noqa: BLE001 — never fail verification over a notice
                    pass
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
        send_email_verification(to=user.email, verify_url=verify_url)
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


@router.get("/me", response_model=MeRead)
def me(user: CurrentUser, db: DbSession):
    from api.permissions import effective_permissions

    out = MeRead.model_validate(user)
    out.permissions = effective_permissions(db, user)
    return out


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
    if payload.role == "admin" or user.role == "admin":
        require_super_admin_if_set(db, _admin, "Only the super admin can grant or remove administrator rights")
    if user.is_super_admin and payload.role != "admin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hand super admin over to another administrator first")
    user.role = payload.role
    from api.scope import forget as _forget_scope

    _forget_scope(user.id)
    db.commit()
    db.refresh(user)
    return user


class PermissionOverridesIn(BaseModel):
    # {"module": {"action": 1 | 0 | null}}  — null / missing = follow the role
    overrides: dict[str, dict[str, Optional[int]]] = {}


@router.get("/admin/users/{user_id}/permissions")
def get_user_permissions(user_id: int, db: DbSession, _admin: AdminUser):
    """The person's role matrix, their extras and the resulting access."""
    from api.models import Role
    from api.permissions import effective_permissions

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    role = db.get(Role, user.role)
    return {
        "user_id": user.id, "role": user.role, "is_admin": user.is_admin,
        "role_permissions": (role.permissions if role else {}) or {},
        "overrides": user.permission_overrides or {},
        "effective": effective_permissions(db, user),
    }


@router.put("/admin/users/{user_id}/permissions")
def set_user_permissions(user_id: int, payload: PermissionOverridesIn, db: DbSession, admin: AdminUser):
    from api.bootstrap_roles import _MODULES
    from api.models import AuditLog
    from api.permissions import ACTIONS, effective_permissions

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.role in ("owner", "tenant"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Portal accounts don't use staff permissions")
    clean: dict = {}
    for m, acts in (payload.overrides or {}).items():
        if m not in _MODULES or not isinstance(acts, dict):
            continue
        cell = {a: (1 if v else 0) for a, v in acts.items() if a in ACTIONS and v is not None}
        if cell:
            clean[m] = cell
    before = user.permission_overrides or {}
    user.permission_overrides = clean or None
    db.add(AuditLog(user_id=admin.id, username=admin.username, action="permission_overrides", entity_type="user",
                    entity_id=str(user.id), details={"before": before, "after": clean}))
    db.commit()
    db.refresh(user)
    return {"user_id": user.id, "overrides": user.permission_overrides or {}, "effective": effective_permissions(db, user)}


@router.put("/admin/users/{user_id}/toggle-active", response_model=UserRead)
def toggle_active(user_id: int, db: DbSession, _admin: AdminUser):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == _admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot deactivate your own account")
    if user.is_super_admin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The super admin cannot be deactivated")
    if user.role == "admin":
        require_super_admin_if_set(db, _admin, "Only the super admin can deactivate an administrator")
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
    if user.is_super_admin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The super admin cannot be deleted")
    if user.role == "admin":
        require_super_admin_if_set(db, actor, "Only the super admin can delete an administrator")
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
    # Permanent delete. (Suspending is the separate "toggle active" action.)
    # History is kept: audit rows keep the username text, assignments are cleared.
    from sqlalchemy import update

    from api.models import Building, Employee, OwnerUser

    db.execute(update(AuditLog).where(AuditLog.user_id == user.id).values(user_id=None))
    db.execute(update(Building).where(Building.assignee_id == user.id).values(assignee_id=None))
    # Support desk: the user's own tickets go with them; their replies on other
    # tickets stay (author shown as "—"); tickets assigned to them are unassigned.
    from api.models import SupportTicket, SupportTicketMessage

    for t in db.scalars(select(SupportTicket).where(SupportTicket.user_id == user.id)).all():
        db.delete(t)
    db.flush()
    db.execute(update(SupportTicketMessage).where(SupportTicketMessage.author_id == user.id).values(author_id=None))
    db.execute(update(SupportTicket).where(SupportTicket.assignee_id == user.id).values(assignee_id=None))
    link = db.scalar(select(OwnerUser).where(OwnerUser.user_id == user.id))
    if link is not None:
        db.delete(link)
    emp = db.scalar(select(Employee).where(Employee.user_id == user.id))
    if emp is not None:
        emp.owners.clear()
        db.delete(emp)
    db.add(
        AuditLog(
            user_id=actor.id,
            username=actor.username,
            action="user_delete",
            entity_type="user",
            entity_id=str(user.id),
        )
    )
    _release_user_references(db, user.id)
    db.delete(user)
    db.commit()


def _release_user_references(db, user_id: int) -> None:
    """Clear every remaining link to a user before deleting it.

    Modules keep adding tables that point at users (support history, HR, payroll…).
    Nullable links without an ON DELETE rule are set to NULL (history keeps the row,
    the person shows as "—"); CASCADE / SET NULL links are left to the database.
    A required link with no rule means the user still owns data → 409 with the table.
    """
    from sqlalchemy import update

    import api.main  # noqa: F401  — make sure every model is registered
    from api.database import Base

    blocking: list[str] = []
    for table in Base.metadata.sorted_tables:
        for col in table.columns:
            for fk in col.foreign_keys:
                if fk.column.table.name != "users" or (fk.ondelete or "").upper() in ("CASCADE", "SET NULL"):
                    continue
                n = db.scalar(select(func.count()).select_from(table).where(col == user_id))
                if not n:
                    continue
                if col.nullable:
                    db.execute(update(table).where(col == user_id).values({col.name: None}))
                else:
                    blocking.append(f"{table.name} ({n})")
    if blocking:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This user still owns records that can't be cleared automatically: "
            + ", ".join(blocking)
            + ". Suspend the account instead.",
        )
    db.flush()


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
    )

    debug_url = f"/reset-password?token={raw}" if settings.reset_password_debug else None
    return InviteUserResponse(user=UserRead.model_validate(user), debug_invite_url=debug_url)


@router.post("/admin/users/reinvite")
def reinvite_all_users(db: DbSession, admin: AdminUser, payload: ReinviteRequest | None = None):
    """Email users a fresh set-password link and return per-user results.

    Body (optional): `user_ids` — only these users (otherwise every active user
    except `admin`); `kind` — "invite" (invitation + username, 72 h) or "reset"
    ("your administrator sent you a reset link", 24 h)."""
    from api.services.reinvite import reinvite_users

    payload = payload or ReinviteRequest()
    if payload.user_ids:
        targets = db.scalars(select(User).where(User.id.in_(payload.user_ids))).all()
        if any(u.role == "admin" and u.id != admin.id for u in targets):
            require_super_admin_if_set(db, admin, "Only the super admin can send links to other administrators")
    return reinvite_users(
        db,
        exclude_usernames={"admin"},
        actor=admin,
        user_ids=payload.user_ids or None,
        kind=payload.kind,
    )


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
    send_password_reset_email(to=user.email, reset_url=reset_url, username=user.username, hours=24, by_admin=True)
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


# ---------- Super admin ----------


def require_super_admin_if_set(db, actor: User, message: str) -> None:
    """Admin-level changes are super-admin-only once a super admin exists.
    Before one is chosen, any admin may act (nothing gets locked out)."""
    if actor.is_super_admin:
        return
    exists = db.scalar(select(func.count()).select_from(User).where(User.is_super_admin.is_(True)))
    if exists:
        raise HTTPException(status.HTTP_403_FORBIDDEN, message)


@router.post("/admin/super-admin/{user_id}", response_model=UserRead)
def set_super_admin(user_id: int, request: Request, db: DbSession, admin: AdminUser):
    """Make `user_id` THE super admin (there is only ever one).

    Allowed for the current super admin (handover), or — while none exists —
    for the built-in `admin` account (first-time setup)."""
    current = db.scalar(select(User).where(User.is_super_admin.is_(True)))
    if current is not None and current.id != admin.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the super admin can hand this role over")
    if current is None and admin.username != "admin":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Sign in as the built-in 'admin' account to choose the first super admin"
        )
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.role != "admin" or not target.is_active_user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The super admin must be an active administrator")
    for u in db.scalars(select(User).where(User.is_super_admin.is_(True))).all():
        u.is_super_admin = False
    target.is_super_admin = True
    db.add(
        AuditLog(
            user_id=admin.id,
            username=admin.username,
            action="super_admin_set",
            entity_type="user",
            entity_id=str(target.id),
            details={"from": current.username if current else None, "to": target.username},
            ip_address=_client_ip(request),
        )
    )
    db.commit()
    db.refresh(target)
    return target


@router.post("/admin/users/{user_id}/set-password", status_code=status.HTTP_204_NO_CONTENT)
def admin_set_password(user_id: int, payload: AdminSetPasswordRequest, request: Request, db: DbSession, admin: AdminUser):
    """Set a user's password directly (e.g. read it to them over the phone).

    Signs the user out everywhere and e-mails them a "password changed" notice.
    Other administrators' passwords: super admin only (once one exists)."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Use My account → Password & security for your own password")
    if user.role == "admin":
        require_super_admin_if_set(db, admin, "Only the super admin can set another administrator's password")
    if payload.new_password.lower() in {user.username.lower(), (user.email or "").lower()}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password cannot be the username or email")
    user.set_password(payload.new_password)
    user.password_changed_at = utcnow()
    user.password_reset_token = None
    user.password_reset_expires = None
    user.token_version = (user.token_version or 0) + 1
    db.add(
        AuditLog(
            user_id=admin.id,
            username=admin.username,
            action="admin_set_password",
            entity_type="user",
            entity_id=str(user.id),
            ip_address=_client_ip(request),
        )
    )
    db.commit()
    if payload.notify:
        send_password_changed_notice(to=user.email, username=user.username)
