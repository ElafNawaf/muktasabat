from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

OwnerType = Literal["individual", "company"]
# نوع الهوية في منصة إيجار
EjarIdType = Literal[
    "national_id", "iqama", "gcc_id", "passport", "visitor", "cr", "endowment"
]


class OwnerBase(BaseModel):
    owner_type: OwnerType = "individual"
    name: str = Field(min_length=1, max_length=150)
    name_en: Optional[str] = Field(default=None, max_length=150)
    name_ar: Optional[str] = Field(default=None, max_length=150)
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[EmailStr] = None
    national_id: Optional[str] = Field(default=None, max_length=20)
    date_of_birth: Optional[date] = None
    cr_number: Optional[str] = Field(default=None, max_length=20)
    representative_national_id: Optional[str] = Field(default=None, max_length=20)
    representative_date_of_birth: Optional[date] = None
    representative_phone: Optional[str] = Field(default=None, max_length=20)
    bank_name: Optional[str] = Field(default=None, max_length=100)
    iban: Optional[str] = Field(default=None, max_length=34)

    # ── Ejar party identity (هوية الطرف في منصة إيجار) ──────────────────────
    id_type: EjarIdType = "national_id"
    id_expiry_date: Optional[date] = None
    nationality: Optional[str] = Field(default=None, max_length=60)
    absher_phone: Optional[str] = Field(default=None, max_length=20)
    national_address: Optional[str] = Field(default=None, max_length=120)
    representative_name: Optional[str] = Field(default=None, max_length=150)
    ejar_party_id: Optional[str] = Field(default=None, max_length=50)

    notes: Optional[str] = None
    notes_en: Optional[str] = None
    notes_ar: Optional[str] = None
    agent_id: Optional[int] = None


class OwnerCreate(OwnerBase):
    pass


class OwnerUpdate(OwnerBase):
    pass


class OwnerRead(OwnerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    # DB / imports may contain non-RFC strings (e.g. literal "NULL"); responses must not 500.
    email: Optional[str] = Field(default=None, max_length=120)
