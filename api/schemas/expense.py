from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

ExpenseCategory = Literal[
    "maintenance",
    "utilities",
    "insurance",
    "legal",
    "marketing",
    "cleaning",
    "security",
    "government_fees",
    "other",
]
PaidBy = Literal["company", "owner", "tenant"]


class ExpenseBase(BaseModel):
    owner_id: Optional[int] = None
    building_id: Optional[int] = None
    unit_id: Optional[int] = None
    category: ExpenseCategory
    description: str = Field(min_length=1, max_length=300)
    description_en: Optional[str] = Field(default=None, max_length=300)
    description_ar: Optional[str] = Field(default=None, max_length=300)
    amount: float = Field(gt=0)
    expense_date: date
    paid_by: PaidBy = "company"
    vendor_name: Optional[str] = Field(default=None, max_length=150)
    receipt_number: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseRead(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
