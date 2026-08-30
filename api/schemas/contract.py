from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

ContractStatus = Literal["active", "expired", "terminated"]
# payment_cycle kept as an integer (months between payments) for backward compat
PaymentCycle = Literal[1, 3, 6, 12]
LEASE_CONTRACT_TYPES = {"residential", "commercial"}
MANAGEMENT_CONTRACT_TYPE = "management"
# الطرف الموقّع على العقد في منصة إيجار
EjarSignatory = Literal["landlord", "property_manager"]


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
    tenant_id: Optional[int] = None
    # عقد إدارة الأملاك المخوِّل بتوقيع هذا العقد
    management_contract_id: Optional[int] = None
    contract_number: str

    # ── Basic contract data (بيانات العقد الأساسية) ──────────────────────────
    branch: Optional[str] = None
    # نوع العقد: "residential" | "commercial" | "management"
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
    electricity_amount: float = 0
    water_amount: float = 0
    electricity_meter_number: Optional[str] = None
    water_meter_number: Optional[str] = None
    services_amount: float = 0
    insurance_amount: float = 0
    vat_rate: float = 15
    vat_amount: float = 0
    total_amount: float = 0
    agent_id: Optional[int] = None
    agent_percentage: float = 0
    management_percentage: float = 0

    status: ContractStatus
    notes: Optional[str] = None

    # ── Ejar integration ─────────────────────────────────────────────────────
    ejar_status: Optional[str] = None
    ejar_reference: Optional[str] = None
    ejar_registered_at: Optional[datetime] = None
    ejar_last_error: Optional[str] = None
    ejar_registration_fee: float = 0
    # الطرف الموقّع في إيجار: "landlord" | "property_manager"
    ejar_signed_by: str = "property_manager"
    # not exposed in list/detail responses for security — only shown in audit log
    # ejar_response_data intentionally omitted from public schema

    created_at: datetime
    attachments: list[ContractAttachmentRead] = []


class ContractCreateRequest(BaseModel):
    unit_id: int
    tenant_id: Optional[int] = None
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
    rent_amount: float = Field(ge=0)
    ejar_contract_number: Optional[str] = Field(default=None, max_length=50)

    # ── Billing (فوترة العقد) ────────────────────────────────────────────────
    payment_type: Optional[str] = Field(default=None, max_length=30)
    payment_count: int = Field(default=1, ge=1)
    payment_cycle: PaymentCycle
    electricity_on_tenant: bool = True
    electricity_split_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    water_on_tenant: bool = True
    water_split_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    electricity_amount: float = Field(default=0, ge=0)
    water_amount: float = Field(default=0, ge=0)
    electricity_meter_number: Optional[str] = Field(default=None, max_length=50)
    water_meter_number: Optional[str] = Field(default=None, max_length=50)
    services_amount: float = Field(default=0, ge=0)
    insurance_amount: float = Field(default=0, ge=0)
    vat_rate: float = Field(default=15, ge=0, le=100)
    agent_id: Optional[int] = None
    agent_percentage: float = Field(default=0, ge=0, le=100)
    management_percentage: float = Field(default=0, ge=0, le=100)

    # ── Ejar (منصة إيجار) ────────────────────────────────────────────────────
    # عقد إدارة الأملاك المخوِّل — required when the office signs for the owner
    management_contract_id: Optional[int] = None
    ejar_signed_by: EjarSignatory = "property_manager"
    ejar_registration_fee: float = Field(default=0, ge=0)

    notes: Optional[str] = None

    @model_validator(mode="after")
    def _check_dates_and_parties(self):
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        is_lease = self.contract_type in LEASE_CONTRACT_TYPES
        if is_lease and self.tenant_id is None:
            raise ValueError("tenant_id is required for lease contracts")
        if is_lease and self.rent_amount <= 0:
            raise ValueError("rent_amount must be greater than 0 for lease contracts")
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
    rent_amount: float = Field(ge=0)
    ejar_contract_number: Optional[str] = Field(default=None, max_length=50)

    # ── Billing (فوترة العقد) ────────────────────────────────────────────────
    payment_type: Optional[str] = Field(default=None, max_length=30)
    payment_count: int = Field(default=1, ge=1)
    payment_cycle: PaymentCycle
    electricity_on_tenant: bool = True
    electricity_split_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    water_on_tenant: bool = True
    water_split_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    electricity_amount: float = Field(default=0, ge=0)
    water_amount: float = Field(default=0, ge=0)
    electricity_meter_number: Optional[str] = Field(default=None, max_length=50)
    water_meter_number: Optional[str] = Field(default=None, max_length=50)
    services_amount: float = Field(default=0, ge=0)
    insurance_amount: float = Field(default=0, ge=0)
    vat_rate: float = Field(default=15, ge=0, le=100)
    agent_id: Optional[int] = None
    agent_percentage: float = Field(default=0, ge=0, le=100)
    management_percentage: float = Field(default=0, ge=0, le=100)

    # ── Ejar (منصة إيجار) ────────────────────────────────────────────────────
    # عقد إدارة الأملاك المخوِّل — required when the office signs for the owner
    management_contract_id: Optional[int] = None
    ejar_signed_by: EjarSignatory = "property_manager"
    ejar_registration_fee: float = Field(default=0, ge=0)

    status: ContractStatus = "active"
    notes: Optional[str] = None
    tenant_id: Optional[int] = None

    @model_validator(mode="after")
    def _check_dates_and_parties(self):
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        is_lease = self.contract_type in LEASE_CONTRACT_TYPES
        if is_lease and self.tenant_id is None:
            raise ValueError("tenant_id is required for lease contracts")
        if is_lease and self.rent_amount <= 0:
            raise ValueError("rent_amount must be greater than 0 for lease contracts")
        return self
