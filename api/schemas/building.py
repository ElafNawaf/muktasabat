from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class BuildingBase(BaseModel):
    owner_id: int
    assignee_id: Optional[int] = None
    name: str = Field(min_length=1, max_length=150)
    name_en: Optional[str] = Field(default=None, max_length=150)
    name_ar: Optional[str] = Field(default=None, max_length=150)
    address: Optional[str] = Field(default=None, max_length=300)
    address_en: Optional[str] = Field(default=None, max_length=300)
    address_ar: Optional[str] = Field(default=None, max_length=300)
    city: Optional[str] = Field(default=None, max_length=100)
    city_en: Optional[str] = Field(default=None, max_length=100)
    city_ar: Optional[str] = Field(default=None, max_length=100)
    district: Optional[str] = Field(default=None, max_length=100)
    district_en: Optional[str] = Field(default=None, max_length=100)
    district_ar: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None
    notes_en: Optional[str] = None
    notes_ar: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)


class BuildingCreate(BuildingBase):
    pass


class BuildingUpdate(BuildingBase):
    pass


class BuildingImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    caption: Optional[str] = None
    sort_order: int


class BuildingRead(BuildingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    images: list[BuildingImageRead] = []
