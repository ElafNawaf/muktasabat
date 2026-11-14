"""Lease renewals (تجديد العقود): one case per lease approaching its end date.

Stages:  due → contacted → offer_sent → (awaiting_owner → agreed | back to offer_sent) → agreed → renewed
         any open stage → lost (tenant leaving; a draft listing is created for the unit)

Cases open automatically 90 days before a lease ends and go to the employee
responsible for the building. Rent *reductions* need the owner's approval
(staff with `contracts.approve`, or the owner in the owner portal); same or
higher rent is agreed directly.
"""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.database import Base


class LeaseRenewal(Base):
    __tablename__ = "lease_renewals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="CASCADE"), unique=True, nullable=False)
    building_id: Mapped[Optional[int]] = mapped_column(ForeignKey("buildings.id", ondelete="SET NULL"), index=True)
    unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id", ondelete="SET NULL"))
    assignee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    stage: Mapped[str] = mapped_column(String(20), default="due", nullable=False, index=True)
    tenant_intent: Mapped[str] = mapped_column(String(12), default="unknown", nullable=False)  # unknown|renew|undecided|leave
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    current_rent: Mapped[float] = mapped_column(Float, default=0, nullable=False)  # annual
    proposed_rent: Mapped[Optional[float]] = mapped_column(Float)  # annual
    next_follow_up: Mapped[Optional[date]] = mapped_column(Date)
    owner_decision_by: Mapped[Optional[str]] = mapped_column(String(160))
    owner_decision_note: Mapped[Optional[str]] = mapped_column(Text)
    lost_reason: Mapped[Optional[str]] = mapped_column(String(30))
    listing_id: Mapped[Optional[int]] = mapped_column(Integer)
    new_contract_number: Mapped[Optional[str]] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    events: Mapped[list["LeaseRenewalEvent"]] = relationship(
        back_populates="renewal", cascade="all, delete-orphan", order_by="LeaseRenewalEvent.id"
    )


class LeaseRenewalEvent(Base):
    __tablename__ = "lease_renewal_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    renewal_id: Mapped[int] = mapped_column(ForeignKey("lease_renewals.id", ondelete="CASCADE"), nullable=False, index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    actor: Mapped[Optional[str]] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)

    renewal: Mapped[LeaseRenewal] = relationship(back_populates="events")
