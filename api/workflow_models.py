"""Approval workflows (مسارات الاعتماد): configurable policies and the approval
steps raised for each request.

A *policy* (one row per workflow key) holds the ordered approval steps the
administrator configured: who approves, under which conditions (amount, type…),
the response time and who it escalates to. Every time a request enters
approval, the engine copies the applicable steps into *tasks* (one per step,
same ``round``); the first is ``pending``, the rest ``waiting``. Re-submitting
the same request starts a new round and cancels the open tasks of the old one.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from api.database import Base


class WorkflowPolicy(Base):
    __tablename__ = "workflow_policies"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    steps: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    notify_emails: Mapped[Optional[str]] = mapped_column(String(500))  # copied on the final decision
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by: Mapped[Optional[str]] = mapped_column(String(160))


class ApprovalTask(Base):
    __tablename__ = "approval_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workflow: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    round: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    step_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    step_key: Mapped[Optional[str]] = mapped_column(String(40))
    label_ar: Mapped[Optional[str]] = mapped_column(String(120))
    label_en: Mapped[Optional[str]] = mapped_column(String(120))
    approver: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)  # {"type": ..., "value": ...}
    escalate_to: Mapped[Optional[dict]] = mapped_column(JSON)
    context: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)  # amount, requester, owner, …
    # waiting → pending → approved | rejected ; skipped / cancelled for steps that never ran
    status: Mapped[str] = mapped_column(String(12), default="waiting", nullable=False, index=True)
    amount: Mapped[Optional[float]] = mapped_column(Float)
    requester_id: Mapped[Optional[int]] = mapped_column(Integer)
    decided_by_id: Mapped[Optional[int]] = mapped_column(Integer)
    decided_by_name: Mapped[Optional[str]] = mapped_column(String(160))
    on_behalf: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime, index=True)
    escalated_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
