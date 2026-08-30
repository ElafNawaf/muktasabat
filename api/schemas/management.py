"""Schemas for the Ejar establishment profile and property management contracts."""

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

FeeType = Literal["percentage", "fixed"]
FeeCollectionMethod = Literal["deduct_from_rent", "invoice_owner"]
ManagementContractStatus = Literal["draft", "active", "expired", "terminated"]
EjarStatus = Literal["pending", "registered", "cancelled", "failed"]


# ── Establishment profile (المنشأة العقارية) ─────────────────────────────────


class ManagementCompanyBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    name_en: Optional[str] = Field(default=None, max_length=200)
    name_ar: Optional[str] = Field(default=None, max_length=200)

    cr_number: Optional[str] = Field(default=None, max_length=20)
    cr_issue_date: Optional[date] = None
    cr_expiry_date: Optional[date] = None
    vat_number: Optional[str] = Field(default=None, max_length=30)

    fal_license_number: Optional[str] = Field(default=None, max_length=40)
    fal_license_expiry: Optional[date] = None
    fal_management_license_number: Optional[str] = Field(default=None, max_length=40)
    fal_management_license_expiry: Optional[date] = None
    ejar_establishment_id: Optional[str] = Field(default=None, max_length=50)
    ejar_branch_id: Optional[str] = Field(default=None, max_length=50)

    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    city: Optional[str] = Field(default=None, max_length=100)
    district: Optional[str] = Field(default=None, max_length=100)
    street: Optional[str] = Field(default=None, max_length=200)
    national_address: Optional[str] = Field(default=None, max_length=120)
    postal_code: Optional[str] = Field(default=None, max_length=10)
    building_number: Optional[str] = Field(default=None, max_length=10)
    additional_number: Optional[str] = Field(default=None, max_length=10)

    representative_name: Optional[str] = Field(default=None, max_length=150)
    representative_national_id: Optional[str] = Field(default=None, max_length=20)
    representative_phone: Optional[str] = Field(default=None, max_length=20)
    representative_email: Optional[str] = Field(default=None, max_length=120)

    bank_name: Optional[str] = Field(default=None, max_length=100)
    iban: Optional[str] = Field(default=None, max_length=34)

    is_active: bool = True
    notes: Optional[str] = None


class ManagementCompanyUpsert(ManagementCompanyBase):
    pass


class ManagementCompanyRead(ManagementCompanyBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


# ── Managed portfolio entries (العقارات المشمولة) ────────────────────────────


class ManagementPropertyInput(BaseModel):
    building_id: int
    # None means the whole building is under management
    unit_id: Optional[int] = None
    fee_percentage_override: Optional[float] = Field(default=None, ge=0, le=100)


class ManagementPropertyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    building_id: int
    unit_id: Optional[int] = None
    fee_percentage_override: Optional[float] = None


class ManagementAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    filename: str
    file_type: Optional[str] = None
    sort_order: int


# ── Management contract (عقد إدارة الأملاك) ──────────────────────────────────


class ManagementContractBase(BaseModel):
    owner_id: int
    company_id: Optional[int] = None

    contract_number: str = Field(min_length=1, max_length=50)
    ejar_contract_number: Optional[str] = Field(default=None, max_length=50)
    branch: Optional[str] = Field(default=None, max_length=100)
    contract_date: Optional[date] = None
    start_date: date
    end_date: date
    duration_months: int = Field(default=12, ge=1)
    auto_renew: bool = False
    notice_period_days: int = Field(default=30, ge=0, le=365)

    fee_type: FeeType = "percentage"
    fee_percentage: float = Field(default=0, ge=0, le=100)
    fee_fixed_amount: float = Field(default=0, ge=0)
    fee_collection_method: FeeCollectionMethod = "deduct_from_rent"
    vat_rate: float = Field(default=15, ge=0, le=100)
    payout_cycle_months: int = Field(default=1, ge=1, le=12)

    can_market_units: bool = True
    can_sign_leases: bool = True
    can_collect_rent: bool = True
    can_evict: bool = False
    can_maintain: bool = True
    can_pay_utilities: bool = False
    maintenance_limit_amount: float = Field(default=0, ge=0)

    notes: Optional[str] = None
    properties: list[ManagementPropertyInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_terms(self):
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        if self.fee_type == "percentage" and self.fee_percentage <= 0:
            raise ValueError("fee_percentage must be greater than 0 for percentage fees")
        if self.fee_type == "fixed" and self.fee_fixed_amount <= 0:
            raise ValueError("fee_fixed_amount must be greater than 0 for fixed fees")
        return self


class ManagementContractCreate(ManagementContractBase):
    pass


class ManagementContractUpdate(ManagementContractBase):
    status: ManagementContractStatus = "active"


class ManagementContractRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    company_id: Optional[int] = None

    contract_number: str
    ejar_contract_number: Optional[str] = None
    branch: Optional[str] = None
    contract_date: Optional[date] = None
    start_date: date
    end_date: date
    duration_months: int
    auto_renew: bool
    notice_period_days: int

    fee_type: str
    fee_percentage: float
    fee_fixed_amount: float
    fee_collection_method: str
    vat_rate: float
    estimated_annual_fee: float
    vat_amount: float
    total_fee_amount: float
    payout_cycle_months: int

    can_market_units: bool
    can_sign_leases: bool
    can_collect_rent: bool
    can_evict: bool
    can_maintain: bool
    can_pay_utilities: bool
    maintenance_limit_amount: float

    status: str
    notes: Optional[str] = None

    ejar_status: Optional[str] = None
    ejar_reference: Optional[str] = None
    ejar_registered_at: Optional[datetime] = None
    ejar_last_error: Optional[str] = None

    created_at: datetime
    properties: list[ManagementPropertyRead] = []
    attachments: list[ManagementAttachmentRead] = []


# ── Ejar readiness / sync responses ──────────────────────────────────────────


class EjarIssueRead(BaseModel):
    entity: str
    entity_id: Optional[int] = None
    field: str
    message_en: str
    message_ar: str
    severity: str


class EjarReadinessResponse(BaseModel):
    ready: bool
    is_stub_mode: bool
    error_count: int
    warning_count: int
    issues: list[EjarIssueRead] = []


class ManagementSyncResponse(BaseModel):
    fetched: int
    created: int
    updated: int
    skipped: int
    owners_created: int
    buildings_linked: int
    is_stub_mode: bool
    errors: list[str] = []
