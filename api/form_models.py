"""Dynamic forms (custom fields) with a super-admin approval workflow.

* ``FormDefinition``     — the live set of custom fields per entity (owner, tenant, …) and its version
* ``FormVersion``        — every approved version, for history and rollback
* ``FormChangeRequest``  — a proposed new field set; it changes nothing until a super admin approves it
* ``CustomFieldValue``   — the values, kept apart from the core tables so relations and
                           core data (names, IDs, amounts, Ejar fields) are never touched
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from api.database import Base


class FormDefinition(Base):
    __tablename__ = "form_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fields: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_by: Mapped[Optional[str]] = mapped_column(String(160))


class FormVersion(Base):
    __tablename__ = "form_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    fields: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    request_id: Mapped[Optional[int]] = mapped_column(ForeignKey("form_change_requests.id", ondelete="SET NULL"))
    approved_by: Mapped[Optional[str]] = mapped_column(String(160))
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class FormChangeRequest(Base):
    __tablename__ = "form_change_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    entity: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    base_version: Mapped[int] = mapped_column(Integer, nullable=False)
    fields: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    changes: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="pending", nullable=False, index=True)  # pending|approved|rejected|cancelled
    requested_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    requested_by: Mapped[Optional[str]] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    reviewed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(160))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    review_note: Mapped[Optional[str]] = mapped_column(Text)


class CustomFieldValue(Base):
    __tablename__ = "custom_field_values"
    __table_args__ = (UniqueConstraint("entity", "entity_id", "field_key", name="uq_custom_field_value"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    field_key: Mapped[str] = mapped_column(String(50), nullable=False)
    value: Mapped[Optional[dict]] = mapped_column(JSON)  # {"v": <value>}
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by: Mapped[Optional[str]] = mapped_column(String(160))
