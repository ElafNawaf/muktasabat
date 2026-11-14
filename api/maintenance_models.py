"""Maintenance work orders (أوامر الصيانة) and their activity log.

Lifecycle:  new → assigned → (awaiting_approval → approved | rejected) → in_progress
            → completed → closed;  cancelled from any open state.

Spending rule: an estimate above the owner's pre-authorised limit (the active
management contract's `maintenance_limit_amount`, or the company default when
that is 0) must be approved — by staff with `maintenance.approve` or by the
owner in the owner portal — before work starts. Completing a job can post the
actual cost as an Expense so it flows into owner statements.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.database import Base


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False, index=True)
    unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(30), default="other", nullable=False)
    priority: Mapped[str] = mapped_column(String(12), default="normal", nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="new", nullable=False, index=True)

    reported_by: Mapped[str] = mapped_column(String(12), default="staff", nullable=False)  # staff|tenant|owner|inspection
    reporter_name: Mapped[Optional[str]] = mapped_column(String(120))
    reporter_phone: Mapped[Optional[str]] = mapped_column(String(30))

    assignee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    vendor_name: Mapped[Optional[str]] = mapped_column(String(160))
    vendor_phone: Mapped[Optional[str]] = mapped_column(String(30))

    estimate_amount: Mapped[Optional[float]] = mapped_column(Float)
    actual_cost: Mapped[Optional[float]] = mapped_column(Float)
    charge_to: Mapped[str] = mapped_column(String(10), default="owner", nullable=False)  # owner|tenant|company
    approval_limit: Mapped[Optional[float]] = mapped_column(Float)
    approval_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    approved_by: Mapped[Optional[str]] = mapped_column(String(120))  # username or "owner: <name>"
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    decision_note: Mapped[Optional[str]] = mapped_column(String(1000))

    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime, index=True)
    scheduled_for: Mapped[Optional[datetime]] = mapped_column(DateTime)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    resolution: Mapped[Optional[str]] = mapped_column(Text)
    rating: Mapped[Optional[int]] = mapped_column(Integer)
    expense_id: Mapped[Optional[int]] = mapped_column(ForeignKey("expenses.id", ondelete="SET NULL"))

    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    events: Mapped[list["WorkOrderEvent"]] = relationship(
        back_populates="work_order", cascade="all, delete-orphan", order_by="WorkOrderEvent.id"
    )


class WorkOrderEvent(Base):
    __tablename__ = "work_order_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    work_order_id: Mapped[int] = mapped_column(ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    actor: Mapped[Optional[str]] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(2000))

    work_order: Mapped[WorkOrder] = relationship(back_populates="events")
