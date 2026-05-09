from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class EmployeeBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    name_en: Optional[str] = Field(default=None, max_length=120)
    name_ar: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=20)


class EmployeeCreate(EmployeeBase):
    user_id: int
    owner_ids: list[int] = Field(default_factory=list)


class EmployeeUpdate(EmployeeBase):
    owner_ids: list[int] = Field(default_factory=list)


class EmployeeRead(EmployeeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    owner_ids: list[int] = Field(default_factory=list)
