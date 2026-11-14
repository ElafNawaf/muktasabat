from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Role = Literal["admin", "manager", "accountant", "agent", "viewer", "owner", "content_editor"]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr
    # Plain str (not the Role literal): custom roles created in the roles
    # matrix (e.g. content_editor) must still be able to sign in.
    role: str
    is_active_user: bool
    email_verified: bool = False
    created_at: datetime
    full_name: str | None = None
    full_name_ar: str | None = None
    avatar_url: str | None = None
    preferred_locale: str = "ar"
    last_login_at: datetime | None = None
    is_super_admin: bool = False
    permission_overrides: dict | None = None


class MeRead(UserRead):
    # Effective module × action matrix (role + this person's extras).
    permissions: dict = {}


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RoleUpdateRequest(BaseModel):
    role: Role


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    # UI locale the request came from — used for the link in the email.
    locale: str | None = None


class ForgotPasswordResponse(BaseModel):
    ok: bool = True
    message: str = "If an account exists for this email, password reset instructions have been sent."
    debug_reset_url: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=10, max_length=256)


class VerifyEmailResponse(BaseModel):
    ok: bool = True
    user_id: int | None = None


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ResendVerificationResponse(BaseModel):
    ok: bool = True
    message: str = "If your account exists and is unverified, a new email has been sent."
    debug_verify_url: str | None = None


class InviteUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: EmailStr
    role: Role = "viewer"


class InviteUserResponse(BaseModel):
    user: UserRead
    debug_invite_url: str | None = None


class ReinviteRequest(BaseModel):
    user_ids: list[int] | None = None
    kind: Literal["invite", "reset"] = "invite"


class AdminSetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)
    # E-mail the user a "your password was changed" notice.
    notify: bool = True
