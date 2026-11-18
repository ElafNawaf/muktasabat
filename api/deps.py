from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from api.database import get_db, release_connection
from api.models import User
from api.security import decode_token, token_matches_user

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

DbSession = Annotated[Session, Depends(get_db)]


# Owner accounts (role "owner") may only reach these API paths. Every other
# route is staff-only: many staff endpoints are not owner-scoped, so letting an
# owner call them would expose other owners' data.
OWNER_ALLOWED_PREFIXES = (
    "/api/v1/owner-portal/",
    "/api/v1/notifications",
    "/api/v1/auth/me",
    # Self-service: own profile/password/sessions, and own support tickets
    # (both routers only ever act on the calling user's data for non-staff).
    "/api/v1/account/",
    "/api/v1/support/",
)

# Tenant accounts (role "tenant"): same idea, scoped to the tenant portal.
TENANT_ALLOWED_PREFIXES = (
    "/api/v1/tenant-portal/",
    "/api/v1/notifications",
    "/api/v1/auth/me",
    "/api/v1/account/",
    "/api/v1/support/",
)


# Self-registered accounts (role "pending") have no access until an administrator
# assigns a role — they can only see who they are, manage their own account and sign out.
PENDING_ROLE = "pending"
PENDING_ALLOWED_PREFIXES = (
    "/api/v1/auth/me",
    "/api/v1/auth/logout",
    "/api/v1/account/",
)


def get_current_user(
    db: DbSession,
    token: Annotated[str, Depends(oauth2_scheme)],
    request: Request,
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_error
        user_id_raw = payload.get("sub")
        if user_id_raw is None:
            raise credentials_error
        user_id = int(user_id_raw)
    except (jwt.InvalidTokenError, ValueError):
        raise credentials_error

    user = db.get(User, user_id)
    if user is None or not user.is_active_user:
        raise credentials_error
    if user.role == "owner":
        path = request.url.path
        if not path.startswith(OWNER_ALLOWED_PREFIXES) or path.startswith("/api/v1/owner-portal/admin"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Owner accounts can only use the owner portal")
    if user.role == PENDING_ROLE and not request.url.path.startswith(PENDING_ALLOWED_PREFIXES):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your account is waiting for an administrator to assign a role.",
        )
    if user.role == "tenant":
        path = request.url.path
        if not path.startswith(TENANT_ALLOWED_PREFIXES) or path.startswith("/api/v1/tenant-portal/admin"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Tenant accounts can only use the tenant portal")
    # Revoked by a password change or "sign out of all devices".
    if not token_matches_user(payload, user):
        raise credentials_error
    from api.scope import SCOPE_KEY, scope_for

    db.info[SCOPE_KEY] = scope_for(db, user)
    release_connection(db)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: CurrentUser, db: DbSession) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    release_connection(db)
    return user


AdminUser = Annotated[User, Depends(require_admin)]
