"""SQLAlchemy 2.0 models for the Muktasabat domain (Postgres / SQLite).

Tables are created on API startup via Base.metadata.create_all for local/dev.
For production schema evolution, introduce Alembic or another migration tool.
"""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from werkzeug.security import check_password_hash, generate_password_hash

from api.database import Base


employee_owners = Table(
    "employee_owners",
    Base.metadata,
    Column("employee_id", Integer, ForeignKey("employees.id"), primary_key=True),
    Column("owner_id", Integer, ForeignKey("owners.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="viewer")
    is_active_user: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    employee: Mapped[Optional["Employee"]] = relationship(back_populates="user", uselist=False)
    owner_link: Mapped[Optional["OwnerUser"]] = relationship(back_populates="user", uselist=False)

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_owner_user(self) -> bool:
        return self.role == "owner"


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(120))
    name_ar: Mapped[Optional[str]] = mapped_column(String(120))
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="employee")
    owners: Mapped[list["Owner"]] = relationship(secondary=employee_owners, back_populates="employees")


class Owner(Base):
    __tablename__ = "owners"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(150))
    name_ar: Mapped[Optional[str]] = mapped_column(String(150))
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(120))
    national_id: Mapped[Optional[str]] = mapped_column(String(20))
    bank_name: Mapped[Optional[str]] = mapped_column(String(100))
    iban: Mapped[Optional[str]] = mapped_column(String(34))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    notes_en: Mapped[Optional[str]] = mapped_column(Text)
    notes_ar: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    buildings: Mapped[list["Building"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    employees: Mapped[list["Employee"]] = relationship(
        secondary=employee_owners, back_populates="owners"
    )
    subscription: Mapped[Optional["Subscription"]] = relationship(
        back_populates="owner", uselist=False
    )
    expenses: Mapped[list["Expense"]] = relationship(back_populates="owner")


class Building(Base):
    __tablename__ = "buildings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("owners.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(150))
    name_ar: Mapped[Optional[str]] = mapped_column(String(150))
    address: Mapped[Optional[str]] = mapped_column(String(300))
    address_en: Mapped[Optional[str]] = mapped_column(String(300))
    address_ar: Mapped[Optional[str]] = mapped_column(String(300))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    city_en: Mapped[Optional[str]] = mapped_column(String(100))
    city_ar: Mapped[Optional[str]] = mapped_column(String(100))
    district: Mapped[Optional[str]] = mapped_column(String(100))
    district_en: Mapped[Optional[str]] = mapped_column(String(100))
    district_ar: Mapped[Optional[str]] = mapped_column(String(100))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    notes_en: Mapped[Optional[str]] = mapped_column(Text)
    notes_ar: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    owner: Mapped["Owner"] = relationship(back_populates="buildings")
    units: Mapped[list["Unit"]] = relationship(back_populates="building", cascade="all, delete-orphan")
    expenses: Mapped[list["Expense"]] = relationship(back_populates="building")


class Unit(Base):
    __tablename__ = "units"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(100))
    name_ar: Mapped[Optional[str]] = mapped_column(String(100))
    number: Mapped[str] = mapped_column(String(50), nullable=False)
    unit_type: Mapped[Optional[str]] = mapped_column(String(50))
    area_sqm: Mapped[Optional[float]] = mapped_column(Float)
    rent_amount: Mapped[float] = mapped_column(Float, default=0)
    management_percentage: Mapped[float] = mapped_column(Float, default=0)
    agent_name: Mapped[Optional[str]] = mapped_column(String(150))
    agent_percentage: Mapped[float] = mapped_column(Float, default=0)
    electric_invoice: Mapped[Optional[str]] = mapped_column(String(50))
    water_invoice: Mapped[Optional[str]] = mapped_column(String(50))
    ejar_fee: Mapped[float] = mapped_column(Float, default=0)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    notes_en: Mapped[Optional[str]] = mapped_column(Text)
    notes_ar: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    building: Mapped["Building"] = relationship(back_populates="units")
    contracts: Mapped[list["Contract"]] = relationship(
        back_populates="unit", cascade="all, delete-orphan"
    )
    expenses: Mapped[list["Expense"]] = relationship(back_populates="unit")


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(150))
    name_ar: Mapped[Optional[str]] = mapped_column(String(150))
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    national_id: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    notes_en: Mapped[Optional[str]] = mapped_column(Text)
    notes_ar: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    contracts: Mapped[list["Contract"]] = relationship(back_populates="tenant")


class Contract(Base):
    __tablename__ = "contracts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), nullable=False)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    contract_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    rent_amount: Mapped[float] = mapped_column(Float, nullable=False)
    payment_cycle: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    unit: Mapped["Unit"] = relationship(back_populates="contracts")
    tenant: Mapped["Tenant"] = relationship(back_populates="contracts")
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="contract", cascade="all, delete-orphan"
    )


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    paid_date: Mapped[Optional[date]] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    payment_method: Mapped[Optional[str]] = mapped_column(String(50))
    receipt_number: Mapped[Optional[str]] = mapped_column(String(50))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    contract: Mapped["Contract"] = relationship(back_populates="payments")
    splits: Mapped[list["PaymentSplit"]] = relationship(
        back_populates="payment", cascade="all, delete-orphan"
    )


class PaymentSplit(Base):
    __tablename__ = "payment_splits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"), nullable=False)
    split_type: Mapped[str] = mapped_column(String(30), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(200))

    payment: Mapped["Payment"] = relationship(back_populates="splits")


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("owners.id"))
    building_id: Mapped[Optional[int]] = mapped_column(ForeignKey("buildings.id"))
    unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("units.id"))
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    description_en: Mapped[Optional[str]] = mapped_column(String(300))
    description_ar: Mapped[Optional[str]] = mapped_column(String(300))
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    paid_by: Mapped[str] = mapped_column(String(30), default="company")
    receipt_number: Mapped[Optional[str]] = mapped_column(String(50))
    vendor_name: Mapped[Optional[str]] = mapped_column(String(150))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    owner: Mapped[Optional["Owner"]] = relationship(back_populates="expenses")
    building: Mapped[Optional["Building"]] = relationship(back_populates="expenses")
    unit: Mapped[Optional["Unit"]] = relationship(back_populates="expenses")


class OwnerUser(Base):
    __tablename__ = "owner_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("owners.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, unique=True)

    owner: Mapped["Owner"] = relationship()
    user: Mapped["User"] = relationship(back_populates="owner_link")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("owners.id"), nullable=False, unique=True)
    plan: Mapped[str] = mapped_column(String(20), nullable=False, default="basic")
    max_units: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    price_monthly: Mapped[float] = mapped_column(Float, nullable=False, default=199)
    status: Mapped[str] = mapped_column(String(20), default="active")
    start_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    owner: Mapped["Owner"] = relationship(back_populates="subscription")
    invoices: Mapped[list["SubscriptionInvoice"]] = relationship(
        back_populates="subscription", cascade="all, delete-orphan"
    )


class SubscriptionInvoice(Base):
    __tablename__ = "subscription_invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subscription_id: Mapped[int] = mapped_column(ForeignKey("subscriptions.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    paid_date: Mapped[Optional[date]] = mapped_column(Date)
    invoice_number: Mapped[Optional[str]] = mapped_column(String(50), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    subscription: Mapped["Subscription"] = relationship(back_populates="invoices")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    username: Mapped[Optional[str]] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_type: Mapped[Optional[str]] = mapped_column(String(50))
    entity_id: Mapped[Optional[str]] = mapped_column(String(50))
    details: Mapped[Optional[dict]] = mapped_column(JSON)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
