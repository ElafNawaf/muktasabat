from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

PaymentStatus = Literal["pending", "paid", "overdue"]
PaymentMethod = Literal["bank_transfer", "cash", "cheque"]
SplitType = Literal["owner_share", "management_fee", "agent_fee", "ejar_fee"]


class PaymentSplitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    split_type: SplitType
    amount: float
    description: Optional[str] = None


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contract_id: int
    amount: float
    due_date: date
    paid_date: Optional[date] = None
    status: PaymentStatus
    payment_method: Optional[str] = None
    receipt_number: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    splits: list[PaymentSplitRead] = []


class PaymentMarkPaidRequest(BaseModel):
    payment_method: PaymentMethod = "bank_transfer"
    receipt_number: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = None
    paid_date: Optional[date] = None


class PaymentUpdateRequest(BaseModel):
    amount: float = Field(gt=0)
    due_date: date
    notes: Optional[str] = None
