"""Tenant portal tables.

* ``tenant_users``  — links a login (role ``tenant``) to exactly one ``Tenant``.
* ``payment_reports`` — "I've paid" notices a tenant sends for an instalment.
  Staff confirm (the payment is then marked paid through the normal flow) or
  reject with a reason. Nothing a tenant sends changes a payment by itself.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.database import Base


class TenantUser(Base):
    __tablename__ = "tenant_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    # E-mail reminders before / on / after each due date (tenant can switch off).
    email_reminders: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    tenant = relationship("Tenant")


class PaymentReport(Base):
    __tablename__ = "payment_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    # bank_transfer | cash | cheque
    method: Mapped[str] = mapped_column(String(20), default="bank_transfer", nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(80))
    note: Mapped[Optional[str]] = mapped_column(Text)
    # Proof of payment (bank receipt / transfer slip, PDF or image) — required from the portal.
    receipt_key: Mapped[Optional[str]] = mapped_column(String(255))
    receipt_url: Mapped[Optional[str]] = mapped_column(String(500))
    receipt_name: Mapped[Optional[str]] = mapped_column(String(255))
    # pending | confirmed | rejected
    status: Mapped[str] = mapped_column(String(12), default="pending", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    reviewed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    review_note: Mapped[Optional[str]] = mapped_column(Text)

    payment = relationship("Payment")
    tenant = relationship("Tenant")
