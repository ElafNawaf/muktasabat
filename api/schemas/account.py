"""My-account (self-service) schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

USERNAME_PATTERN = r"^[A-Za-z0-9._-]{3,80}$"


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str  # read model: placeholder addresses of no-email staff must not fail
    role: str
    email_verified: bool = False
    created_at: datetime
    full_name: str | None = None
    full_name_ar: str | None = None
    phone: str | None = None
    job_title: str | None = None
    avatar_url: str | None = None
    preferred_locale: str = "ar"
    notify_ticket_updates: bool = True
    pending_email: str | None = None
    password_changed_at: datetime | None = None
    last_login_at: datetime | None = None


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=150)
    full_name_ar: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, max_length=20)
    job_title: str | None = Field(default=None, max_length=120)
    preferred_locale: Literal["ar", "en"] | None = None
    notify_ticket_updates: bool | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip().replace(" ", "")
        if v and not all(c.isdigit() or c == "+" for c in v):
            raise ValueError("Phone may contain digits and a leading + only")
        return v or None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordResponse(BaseModel):
    """Fresh tokens: the old session generation is revoked by the change."""

    access_token: str
    refresh_token: str


class ChangeUsernameRequest(BaseModel):
    new_username: str = Field(pattern=USERNAME_PATTERN)
    current_password: str = Field(min_length=1, max_length=128)


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    current_password: str = Field(min_length=1, max_length=128)


class ChangeEmailResponse(BaseModel):
    ok: bool = True
    pending_email: str
    debug_confirm_url: str | None = None


class ConfirmEmailRequest(BaseModel):
    token: str = Field(min_length=10, max_length=256)


class LoginActivity(BaseModel):
    timestamp: datetime
    ip_address: str | None = None
    action: str
