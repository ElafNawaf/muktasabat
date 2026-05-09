"""Pydantic response models for the analytics endpoints.

Each one mirrors the JSON shape from the Flask analytics blueprint so existing
clients can consume either app during the migration.
"""
from typing import Literal

from pydantic import BaseModel


# ---------- Portfolio overview ----------

class PortfolioCounts(BaseModel):
    owners: int
    buildings: int
    total_units: int
    occupied_units: int
    vacancy_rate: float
    active_contracts: int
    total_contracts: int


class RevenueSummary(BaseModel):
    total_collected: float
    total_pending: float
    total_overdue: float
    overdue_count: int
    collection_rate: float
    monthly_potential: float


class CompanyIncome(BaseModel):
    management_fees: float
    agent_fees: float
    subscription_revenue: float
    total_expenses: float


class PortfolioResponse(BaseModel):
    portfolio: PortfolioCounts
    revenue: RevenueSummary
    company_income: CompanyIncome


# ---------- Revenue trends ----------

class MonthlyRevenue(BaseModel):
    label: str
    collected: float
    expected: float
    mgmt_fees: float
    expenses: float


class RevenueTrendsResponse(BaseModel):
    months: list[MonthlyRevenue]


# ---------- Aging receivables ----------

class AgingItem(BaseModel):
    payment_id: int
    contract_number: str
    tenant: str
    tenant_phone: str
    unit: str
    building: str
    owner: str
    amount: float
    due_date: str
    days_overdue: int


class AgingBucket(BaseModel):
    count: int
    amount: float
    items: list[AgingItem]


class AgingBuckets(BaseModel):
    bucket_1_30: AgingBucket
    bucket_31_60: AgingBucket
    bucket_61_90: AgingBucket
    bucket_90_plus: AgingBucket


class AgingResponse(BaseModel):
    buckets: dict[str, AgingBucket]
    total_overdue: float
    total_count: int


# ---------- Contract intelligence ----------

class PipelineItem(BaseModel):
    id: int
    contract_number: str
    tenant: str
    tenant_phone: str
    unit: str
    building: str
    owner: str
    end_date: str
    days_left: int
    monthly_rent: float
    annual_value: float


class PipelineBucket(BaseModel):
    count: int
    items: list[PipelineItem]
    monthly_rent: float


class OccupancyPoint(BaseModel):
    label: str
    occupied: int
    total: int
    rate: float


class ContractIntelResponse(BaseModel):
    pipeline: dict[str, PipelineBucket]
    occupancy_trend: list[OccupancyPoint]
    revenue_at_risk: float
    active_count: int
    total_annual_value: float


# ---------- Expense analytics ----------

class ExpenseByCategory(BaseModel):
    category: str
    amount: float
    count: int


class MonthlyAmount(BaseModel):
    label: str
    amount: float


class ExpenseByOwner(BaseModel):
    owner: str
    amount: float


class RecentExpense(BaseModel):
    id: int
    category: str
    description: str
    amount: float
    date: str
    paid_by: str
    owner: str
    building: str
    vendor: str


class ExpenseAnalyticsResponse(BaseModel):
    categories: list[ExpenseByCategory]
    monthly: list[MonthlyAmount]
    by_owner: list[ExpenseByOwner]
    recent: list[RecentExpense]
    year_total: float


# ---------- Employee performance ----------

class EmployeePerformance(BaseModel):
    name: str
    phone: str | None = None
    owners: int
    buildings: int
    units: int
    active_contracts: int = 0
    collection_rate: float
    overdue_amount: float
    monthly_revenue: float
    total_collected: float = 0


class EmployeePerformanceResponse(BaseModel):
    employees: list[EmployeePerformance]


# ---------- Owner statement ----------

class OwnerHeader(BaseModel):
    id: int
    name: str
    iban: str | None = None
    bank_name: str | None = None


class StatementRentRow(BaseModel):
    type: Literal["rent"] = "rent"
    date: str
    description: str
    gross: float
    mgmt_fee: float
    agent_fee: float
    ejar_fee: float
    net: float
    status: str


class StatementExpenseRow(BaseModel):
    type: Literal["expense"] = "expense"
    date: str
    description: str
    amount: float
    paid_by: str


class OwnerStatementSummary(BaseModel):
    total_rent: float
    total_mgmt_fee: float
    total_agent_fee: float
    total_ejar_fee: float
    total_owner_share: float
    total_expenses: float
    subscription_fee: float
    net_payable: float


class OwnerStatementResponse(BaseModel):
    owner: OwnerHeader
    period: str
    period_start: str
    period_end: str
    rent_rows: list[StatementRentRow]
    expense_rows: list[StatementExpenseRow]
    summary: OwnerStatementSummary


# ---------- Yield analysis ----------

class BuildingYield(BaseModel):
    id: int
    name: str
    owner: str
    city: str
    district: str
    total_units: int
    occupied: int
    occupancy_rate: float
    total_area_sqm: float
    monthly_rent: float
    annual_rent: float
    annual_expenses: float
    net_income: float
    rent_per_sqm: float


class YieldAnalysisResponse(BaseModel):
    buildings: list[BuildingYield]
