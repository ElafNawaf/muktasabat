from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    label_en: str
    label_ar: str
    description_en: Optional[str] = None
    description_ar: Optional[str] = None
    color: str
    system: bool
    permissions: dict


class RolePermissionsUpdate(BaseModel):
    """Whole-matrix replacement for a role's permissions."""

    permissions: dict = Field(default_factory=dict)


class RoleCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern=r"^[a-z][a-z0-9_]*$")
    label_en: str = Field(min_length=1, max_length=100)
    label_ar: str = Field(min_length=1, max_length=100)
    description_en: Optional[str] = None
    description_ar: Optional[str] = None
    color: str = Field(default="#6B7280", pattern=r"^#[0-9A-Fa-f]{6}$")
    permissions: dict = Field(default_factory=dict)
