from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

TenantType = Literal["individual", "company"]


class TenantBase(BaseModel):
    tenant_type: TenantType = "individual"
    name: str = Field(min_length=1, max_length=150)
    name_en: Optional[str] = Field(default=None, max_length=150)
    name_ar: Optional[str] = Field(default=None, max_length=150)
    phone: str = Field(min_length=1, max_length=20)
    national_id: str = Field(min_length=1, max_length=20)
    date_of_birth: Optional[date] = None
    cr_number: Optional[str] = Field(default=None, max_length=20)
    absher_phone: Optional[str] = Field(default=None, max_length=20)
    representative_national_id: Optional[str] = Field(default=None, max_length=20)
    representative_date_of_birth: Optional[date] = None
    email: Optional[EmailStr] = None
    notes: Optional[str] = None
    notes_en: Optional[str] = None
    notes_ar: Optional[str] = None


class TenantCreate(TenantBase):
    pass


class TenantUpdate(TenantBase):
    pass


class TenantRead(TenantBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    email: Optional[str] = Field(default=None, max_length=120)
