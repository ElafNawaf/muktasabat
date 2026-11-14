"""Payroll (مسير الرواتب) for the group companies.

A run is one company's month. Lines (payslips) are computed from the employee's active
employment contract, the month's attendance (absence / unpaid leave / optional lateness),
GOSI, loan instalments and HR adjustments. Flow: draft → submitted → approved → paid
(two people: whoever submitted can't approve). Paid runs are locked and visible to employees.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from api.database import Base


class PayrollSettings(Base):
    __tablename__ = "hr_payroll_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # always 1
    days_per_month: Mapped[int] = mapped_column(Integer, default=30, nullable=False)  # daily wage = monthly / 30
    hours_per_day: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    deduct_absence: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deduct_unpaid_leave: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deduct_late: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    late_free_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)  # monthly lateness tolerated before deducting
    overtime_premium: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)  # Art. 107: hourly wage + 50% of hourly basic
    gosi_cap: Mapped[float] = mapped_column(Float, default=45000, nullable=False)
    gosi_old_employee: Mapped[float] = mapped_column(Float, default=9.75, nullable=False)  # 9% annuities + 0.75% SANED
    gosi_old_employer: Mapped[float] = mapped_column(Float, default=11.75, nullable=False)  # 9% + 0.75% + 2% hazards
    gosi_hazards: Mapped[float] = mapped_column(Float, default=2.0, nullable=False)  # non-Saudi, employer only
    gosi_saned: Mapped[float] = mapped_column(Float, default=0.75, nullable=False)
    payment_day: Mapped[int] = mapped_column(Integer, default=27, nullable=False)
    updated_by: Mapped[Optional[str]] = mapped_column(String(120))


class PayrollRun(Base):
    __tablename__ = "hr_payroll_runs"
    __table_args__ = (UniqueConstraint("company_id", "month", "active_key", name="uq_payroll_company_month"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    # 1 while the run is live; set to the run id when cancelled so a new run for the same month is possible.
    active_key: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="draft", nullable=False)  # draft|submitted|approved|paid|cancelled
    payment_date: Mapped[Optional[date]] = mapped_column(Date)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_by: Mapped[Optional[str]] = mapped_column(String(120))
    calculated_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    submitted_by_id: Mapped[Optional[int]] = mapped_column(Integer)
    submitted_by: Mapped[Optional[str]] = mapped_column(String(120))
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    approved_by_id: Mapped[Optional[int]] = mapped_column(Integer)
    approved_by: Mapped[Optional[str]] = mapped_column(String(120))
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    returned_note: Mapped[Optional[str]] = mapped_column(String(500))
    paid_by: Mapped[Optional[str]] = mapped_column(String(120))
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Payslip(Base):
    __tablename__ = "hr_payslips"
    __table_args__ = (UniqueConstraint("run_id", "user_id", name="uq_payslip_run_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("hr_payroll_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    contract_id: Mapped[Optional[int]] = mapped_column(Integer)
    # snapshot at calculation time
    name: Mapped[Optional[str]] = mapped_column(String(160))
    employee_no: Mapped[Optional[str]] = mapped_column(String(30))
    id_number: Mapped[Optional[str]] = mapped_column(String(20))
    iban: Mapped[Optional[str]] = mapped_column(String(34))
    bank: Mapped[Optional[str]] = mapped_column(String(80))
    job_title: Mapped[Optional[str]] = mapped_column(String(120))
    saudi: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    gosi_scheme: Mapped[Optional[str]] = mapped_column(String(10))  # old|new|expat|none
    # earnings (full month as per contract)
    basic: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    housing: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    transport: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    other_allowance: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    other_allowance_label: Mapped[Optional[str]] = mapped_column(String(80))
    overtime_hours: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    overtime_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    additions: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # attendance basis
    payable_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    absent_days: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    unpaid_days: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    late_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # deductions
    proration_deduction: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    absence_deduction: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    unpaid_deduction: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    late_deduction: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    gosi_base: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    gosi_employee: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    gosi_employer: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    loan_deduction: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    other_deductions: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    gross: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    total_deductions: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    net: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    adjustments: Mapped[Optional[str]] = mapped_column(Text)  # JSON [{kind: addition|deduction, label, amount}]
    overrides: Mapped[Optional[str]] = mapped_column(Text)  # JSON of HR-entered values kept on recalculation
    loans: Mapped[Optional[str]] = mapped_column(Text)  # JSON [{loan_id, amount}]
    warnings: Mapped[Optional[str]] = mapped_column(Text)  # JSON list of codes
    excluded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(300))


class EmployeeLoan(Base):
    __tablename__ = "hr_loans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(10), default="advance", nullable=False)  # advance|loan
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    installments: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    monthly_amount: Mapped[float] = mapped_column(Float, nullable=False)
    start_month: Mapped[str] = mapped_column(String(7), nullable=False)
    status: Mapped[str] = mapped_column(String(10), default="pending", nullable=False)  # pending|approved|rejected|cancelled|settled
    reason: Mapped[Optional[str]] = mapped_column(String(500))
    consent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # employee agreed in writing to the instalment
    requested_by_self: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(120))
    decided_by: Mapped[Optional[str]] = mapped_column(String(120))
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    decision_note: Mapped[Optional[str]] = mapped_column(String(300))
    disbursed_on: Mapped[Optional[date]] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class LoanRepayment(Base):
    __tablename__ = "hr_loan_repayments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("hr_loans.id", ondelete="CASCADE"), nullable=False, index=True)
    run_id: Mapped[Optional[int]] = mapped_column(Integer)
    month: Mapped[str] = mapped_column(String(7), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(200))
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
