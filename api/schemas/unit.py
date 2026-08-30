from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# استخدام الوحدة في منصة إيجار
UnitUsage = Literal["residential", "commercial", "office", "warehouse", "other"]


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

    # ── Ejar unit record (بيانات الوحدة في منصة إيجار) ──────────────────────
    ejar_unit_id: Optional[str] = Field(default=None, max_length=50)
    usage_type: Optional[UnitUsage] = None
    rooms_count: Optional[int] = Field(default=None, ge=0, le=99)
    bathrooms_count: Optional[int] = Field(default=None, ge=0, le=99)
    is_furnished: bool = False

    notes: Optional[str] = None
    notes_en: Optional[str] = None
    notes_ar: Optional[str] = None


class UnitCreate(UnitBase):
    pass


class UnitUpdate(UnitBase):
    pass


class UnitImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    caption: Optional[str] = None
    sort_order: int


class UnitRead(UnitBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_available: bool
    created_at: datetime
    images: list[UnitImageRead] = []
