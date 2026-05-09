from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

ContractStatus = Literal["active", "expired", "terminated"]
# payment_cycle kept as an integer (months between payments) for backward compat
PaymentCycle = Literal[1, 3, 6, 12]


class ContractAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    filename: str
    file_type: Optional[str] = None
    sort_order: int


class ContractRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    unit_id: int
    tenant_id: int
    contract_number: str

    # ── Basic contract data (بيانات العقد الأساسية) ──────────────────────────
    branch: Optional[str] = None
    # نوع العقد: "residential" | "commercial"
    contract_type: str = "residential"
    # صلاحية العقد: "fixed" | "open"
    validity_type: Optional[str] = None
    start_date: date
    end_date: date
    # مدة العقد
    duration_years: int = 1
    duration_months: int = 0
    duration_days: int = 0
    # اجمالي قيمة الإيجار لكل المدة
    total_rent_amount: float = 0
    rent_amount: float
    # رقم عقد الإيجار (Ejar)
    ejar_contract_number: Optional[str] = None

    # ── Billing (فوترة العقد) ────────────────────────────────────────────────
    payment_type: Optional[str] = None
    payment_count: int = 1
    payment_cycle: int
    electricity_on_tenant: bool = True
    electricity_split_percentage: Optional[float] = None
    water_on_tenant: bool = True
    water_split_percentage: Optional[float] = None
    services_amount: float = 0
    insurance_amount: float = 0

    status: ContractStatus
    notes: Optional[str] = None

    # ── Ejar integration ─────────────────────────────────────────────────────
    ejar_status: Optional[str] = None
    ejar_registered_at: Optional[datetime] = None
    # not exposed in list/detail responses for security — only shown in audit log
    # ejar_response_data intentionally omitted from public schema

    created_at: datetime
    attachments: list[ContractAttachmentRead] = []


class ContractCreateRequest(BaseModel):
    unit_id: int
    tenant_id: int
    contract_number: str = Field(min_length=1, max_length=50)

    # ── Basic contract data (بيانات العقد الأساسية) ──────────────────────────
    branch: Optional[str] = Field(default=None, max_length=100)
    contract_type: str = Field(default="residential", max_length=20)
    validity_type: Optional[str] = Field(default=None, max_length=30)
    start_date: date
    end_date: date
    duration_years: int = Field(default=1, ge=0)
    duration_months: int = Field(default=0, ge=0, le=11)
    duration_days: int = Field(default=0, ge=0, le=30)
    total_rent_amount: float = Field(default=0, ge=0)
    rent_amount: float = Field(gt=0)
    ejar_contract_number: Optional[str] = Field(default=None, max_length=50)

    # ── Billing (فوترة العقد) ────────────────────────────────────────────────
    payment_type: Optional[str] = Field(default=None, max_length=30)
    payment_count: int = Field(default=1, ge=1)
    payment_cycle: PaymentCycle
    electricity_on_tenant: bool = True
    electricity_split_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    water_on_tenant: bool = True
    water_split_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    services_amount: float = Field(default=0, ge=0)
    insurance_amount: float = Field(default=0, ge=0)

    notes: Optional[str] = None

    @model_validator(mode="after")
    def _check_dates(self):
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class ContractUpdateRequest(BaseModel):
    contract_number: str = Field(min_length=1, max_length=50)

    # ── Basic contract data (بيانات العقد الأساسية) ──────────────────────────
    branch: Optional[str] = Field(default=None, max_length=100)
    contract_type: str = Field(default="residential", max_length=20)
    validity_type: Optional[str] = Field(default=None, max_length=30)
    start_date: date
    end_date: date
    duration_years: int = Field(default=1, ge=0)
    duration_months: int = Field(default=0, ge=0, le=11)
    duration_days: int = Field(default=0, ge=0, le=30)
    total_rent_amount: float = Field(default=0, ge=0)
    rent_amount: float = Field(gt=0)
    ejar_contract_number: Optional[str] = Field(default=None, max_length=50)

    # ── Billing (فوترة العقد) ────────────────────────────────────────────────
    payment_type: Optional[str] = Field(default=None, max_length=30)
    payment_count: int = Field(default=1, ge=1)
    payment_cycle: PaymentCycle
    electricity_on_tenant: bool = True
    electricity_split_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    water_on_tenant: bool = True
    water_split_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    services_amount: float = Field(default=0, ge=0)
    insurance_amount: float = Field(default=0, ge=0)

    status: ContractStatus = "active"
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _check_dates(self):
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self
