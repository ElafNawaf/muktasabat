from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from api.deps import AdminUser, CurrentUser, DbSession
from api.models import AuditLog, User
from api.schemas.auth import (
    AccessTokenResponse,
    LoginResponse,
    RefreshRequest,
    RegisterRequest,
    RoleUpdateRequest,
    UserRead,
)
from api.security import create_token, decode_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(
    db: DbSession,
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
):
    """OAuth2-compatible login (form-encoded). Returns JWT access + refresh tokens."""
    user = db.scalar(select(User).where(User.username == form_data.username))
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
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()

    return LoginResponse(
        access_token=create_token(user.id, "access"),
        refresh_token=create_token(user.id, "refresh"),
        user=UserRead.model_validate(user),
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: DbSession):
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already exists")

    user = User(username=payload.username, email=payload.email, role="viewer")
    user.set_password(payload.password)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


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

    return AccessTokenResponse(access_token=create_token(user.id, "access"))


@router.get("/me", response_model=UserRead)
def me(user: CurrentUser):
    return user


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
    user.is_active_user = not user.is_active_user
    db.commit()
    db.refresh(user)
    return user
