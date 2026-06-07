from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class AgentBase(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    name_en: Optional[str] = Field(default=None, max_length=150)
    name_ar: Optional[str] = Field(default=None, max_length=150)
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[EmailStr] = None
    national_id: Optional[str] = Field(default=None, max_length=20)
    bank_name: Optional[str] = Field(default=None, max_length=100)
    iban: Optional[str] = Field(default=None, max_length=34)
    notes: Optional[str] = None
    notes_en: Optional[str] = None
    notes_ar: Optional[str] = None


class AgentCreate(AgentBase):
    pass


class AgentUpdate(AgentBase):
    pass


class AgentRead(AgentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    email: Optional[str] = Field(default=None, max_length=120)
