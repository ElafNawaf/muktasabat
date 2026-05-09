from datetime import date, datetime
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

    # ── Mogod fields — General information (معلومات عامة) ──
    contract_type: Optional[str] = Field(default=None, max_length=50)
    building_code: Optional[str] = Field(default=None, max_length=50)
    water_meter_number: Optional[str] = Field(default=None, max_length=50)
    electricity_meter_number: Optional[str] = Field(default=None, max_length=50)
    lease_contract_number: Optional[str] = Field(default=None, max_length=50)
    branch: Optional[str] = Field(default=None, max_length=100)

    # ── Mogod fields — Location (الموقع) ──
    street: Optional[str] = Field(default=None, max_length=200)

    # ── Mogod fields — Deed information (معلومات الصك) ──
    deed_number: Optional[str] = Field(default=None, max_length=50)
    deed_document_type: Optional[str] = Field(default=None, max_length=50)
    deed_date: Optional[date] = None
    deed_document_number: Optional[str] = Field(default=None, max_length=50)

    # ── Mogod fields — Property data (بيانات العقار) ──
    property_type: Optional[str] = Field(default=None, max_length=50)
    residence_type: Optional[str] = Field(default=None, max_length=50)
    offices_count: int = Field(default=0, ge=0)
    commercial_shops_count: int = Field(default=0, ge=0)
    apartments_count: int = Field(default=0, ge=0)


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


class BuildingDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    building_id: int
    url: str
    object_key: Optional[str] = None
    filename: str
    file_type: Optional[str] = None
    sort_order: int
    created_at: datetime


class BuildingRead(BuildingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    images: list[BuildingImageRead] = []
    documents: list[BuildingDocumentRead] = Field(default_factory=list)
