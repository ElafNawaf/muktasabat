from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class UnitBase(BaseModel):
    building_id: int
    name: str = Field(min_length=1, max_length=100)
    name_en: Optional[str] = Field(default=None, max_length=100)
    name_ar: Optional[str] = Field(default=None, max_length=100)
    number: str = Field(min_length=1, max_length=50)
    unit_type: Optional[str] = Field(default=None, max_length=50)
    area_sqm: Optional[float] = Field(default=None, ge=0)
    rent_amount: float = Field(default=0, ge=0)
    management_percentage: float = Field(default=0, ge=0, le=100)
    agent_name: Optional[str] = Field(default=None, max_length=150)
    agent_percentage: float = Field(default=0, ge=0, le=100)
    electric_invoice: Optional[str] = Field(default=None, max_length=50)
    water_invoice: Optional[str] = Field(default=None, max_length=50)
    ejar_fee: float = Field(default=0, ge=0)
    notes: Optional[str] = None
    notes_en: Optional[str] = None
    notes_ar: Optional[str] = None


class UnitCreate(UnitBase):
    pass


class UnitUpdate(UnitBase):
    pass


class UnitRead(UnitBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_available: bool
    created_at: datetime
