from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

ContractStatus = Literal["active", "expired", "terminated"]
PaymentCycle = Literal[3, 6, 12]


class ContractRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    unit_id: int
    tenant_id: int
    contract_number: str
    start_date: date
    end_date: date
    rent_amount: float
    payment_cycle: int
    status: ContractStatus
    notes: Optional[str] = None
    created_at: datetime


class ContractCreateRequest(BaseModel):
    unit_id: int
    tenant_id: int
    contract_number: str = Field(min_length=1, max_length=50)
    start_date: date
    end_date: date
    rent_amount: float = Field(gt=0)
    payment_cycle: PaymentCycle
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _check_dates(self):
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class ContractUpdateRequest(BaseModel):
    contract_number: str = Field(min_length=1, max_length=50)
    start_date: date
    end_date: date
    rent_amount: float = Field(gt=0)
    payment_cycle: PaymentCycle
    status: ContractStatus = "active"
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _check_dates(self):
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self
