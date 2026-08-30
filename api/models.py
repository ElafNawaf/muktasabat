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

    password_reset_token: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    password_reset_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_verification_token: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    email_verification_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

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


class Agent(Base):
    __tablename__ = "agents"

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

    owners: Mapped[list["Owner"]] = relationship(back_populates="agent")


class Owner(Base):
    __tablename__ = "owners"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("agents.id", ondelete="SET NULL"), nullable=True
    )
    # individual | company
    owner_type: Mapped[str] = mapped_column(String(20), default="individual", nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(150))
    name_ar: Mapped[Optional[str]] = mapped_column(String(150))
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(120))
    national_id: Mapped[Optional[str]] = mapped_column(String(20))
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Commercial registration — company owners only
    cr_number: Mapped[Optional[str]] = mapped_column(String(20))
    representative_national_id: Mapped[Optional[str]] = mapped_column(String(20))
    representative_date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    representative_phone: Mapped[Optional[str]] = mapped_column(String(20))
    bank_name: Mapped[Optional[str]] = mapped_column(String(100))
    iban: Mapped[Optional[str]] = mapped_column(String(34))

    # ── Ejar party identity (هوية الطرف في منصة إيجار) ──────────────────────
    # نوع الهوية — national_id | iqama | gcc_id | passport | cr | endowment (وقف)
    id_type: Mapped[str] = mapped_column(String(20), default="national_id", nullable=False)
    # تاريخ انتهاء الهوية
    id_expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # الجنسية — country name / ISO code, required by Ejar for non-Saudi parties
    nationality: Mapped[Optional[str]] = mapped_column(String(60))
    # رقم الجوال المسجل في أبشر — Ejar verifies the party through Absher
    absher_phone: Mapped[Optional[str]] = mapped_column(String(20))
    # العنوان الوطني المختصر — Saudi short address, e.g. "RRRD2929"
    national_address: Mapped[Optional[str]] = mapped_column(String(120))
    # اسم ممثل المالك — required for company / endowment owners
    representative_name: Mapped[Optional[str]] = mapped_column(String(150))
    # معرف الطرف في منصة إيجار (assigned by Ejar)
    ejar_party_id: Mapped[Optional[str]] = mapped_column(String(50))

    notes: Mapped[Optional[str]] = mapped_column(Text)
    notes_en: Mapped[Optional[str]] = mapped_column(Text)
    notes_ar: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    agent: Mapped[Optional["Agent"]] = relationship(back_populates="owners")
    management_contracts: Mapped[list["ManagementContract"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
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
    assignee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)

    # ── General information (معلومات عامة) ──────────────────────────────────
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(150))
    name_ar: Mapped[Optional[str]] = mapped_column(String(150))
    # نوع العقد — contract type: residential / commercial / mixed / investment
    contract_type: Mapped[Optional[str]] = mapped_column(String(50))
    # كود العقار — internal property code / reference
    building_code: Mapped[Optional[str]] = mapped_column(String(50), index=True)
    # رقم عداد المياه — water meter number
    water_meter_number: Mapped[Optional[str]] = mapped_column(String(50))
    # رقم العداد — electricity meter number
    electricity_meter_number: Mapped[Optional[str]] = mapped_column(String(50))
    # رقم عقد الإيجار — Ejar lease contract number
    lease_contract_number: Mapped[Optional[str]] = mapped_column(String(50))
    # الفرع — managing branch / office
    branch: Mapped[Optional[str]] = mapped_column(String(100))

    # ── Location (الموقع) ────────────────────────────────────────────────────
    city: Mapped[Optional[str]] = mapped_column(String(100))
    city_en: Mapped[Optional[str]] = mapped_column(String(100))
    city_ar: Mapped[Optional[str]] = mapped_column(String(100))
    district: Mapped[Optional[str]] = mapped_column(String(100))
    district_en: Mapped[Optional[str]] = mapped_column(String(100))
    district_ar: Mapped[Optional[str]] = mapped_column(String(100))
    # الشارع — street name
    street: Mapped[Optional[str]] = mapped_column(String(200))
    # العنوان الوطني المختصر — Saudi National Address short code, e.g. "RRRD2929"
    national_address: Mapped[Optional[str]] = mapped_column(String(120))
    # الرمز البريدي / الرقم الإضافي — part of the national address
    postal_code: Mapped[Optional[str]] = mapped_column(String(10))
    additional_number: Mapped[Optional[str]] = mapped_column(String(10))
    building_number: Mapped[Optional[str]] = mapped_column(String(10))
    address: Mapped[Optional[str]] = mapped_column(String(300))
    address_en: Mapped[Optional[str]] = mapped_column(String(300))
    address_ar: Mapped[Optional[str]] = mapped_column(String(300))
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # ── Deed information (معلومات الصك) ─────────────────────────────────────
    # رقم الصك — deed / title deed number
    deed_number: Mapped[Optional[str]] = mapped_column(String(50))
    # نوع الوثيقة — document type: deed / title / usufruct / …
    deed_document_type: Mapped[Optional[str]] = mapped_column(String(50))
    # تاريخ الصك — deed issue date
    deed_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # رقم الوثيقة — document / certificate number
    deed_document_number: Mapped[Optional[str]] = mapped_column(String(50))
    # معرف العقار في منصة إيجار — assigned by Ejar when the property is registered
    ejar_property_id: Mapped[Optional[str]] = mapped_column(String(50))

    # ── Property data (بيانات العقار) ────────────────────────────────────────
    # نوع العقار — property type: apartment_building / villa / commercial / warehouse / mixed / land / other
    property_type: Mapped[Optional[str]] = mapped_column(String(50))
    # نوع السكن — residence type: singles (عزاب) / families (عائلات) / mixed (مختلط)
    residence_type: Mapped[Optional[str]] = mapped_column(String(50))
    # unit counts per type
    offices_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    commercial_shops_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    apartments_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Notes ────────────────────────────────────────────────────────────────
    notes: Mapped[Optional[str]] = mapped_column(Text)
    notes_en: Mapped[Optional[str]] = mapped_column(Text)
    notes_ar: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    owner: Mapped["Owner"] = relationship(back_populates="buildings")
    assignee: Mapped[Optional["User"]] = relationship(foreign_keys=[assignee_id])
    units: Mapped[list["Unit"]] = relationship(back_populates="building", cascade="all, delete-orphan")
    expenses: Mapped[list["Expense"]] = relationship(back_populates="building")
    images: Mapped[list["BuildingImage"]] = relationship(
        back_populates="building", cascade="all, delete-orphan", order_by="BuildingImage.sort_order"
    )
    documents: Mapped[list["BuildingDocument"]] = relationship(
        back_populates="building", cascade="all, delete-orphan"
    )


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
    # معرف الوحدة في منصة إيجار — assigned by Ejar when the unit is registered
    ejar_unit_id: Mapped[Optional[str]] = mapped_column(String(50))
    # استخدام الوحدة — residential | commercial | office | warehouse | other
    usage_type: Mapped[Optional[str]] = mapped_column(String(30))
    # عدد الغرف / دورات المياه — part of Ejar's unit specification
    rooms_count: Mapped[Optional[int]] = mapped_column(Integer)
    bathrooms_count: Mapped[Optional[int]] = mapped_column(Integer)
    # مفروشة — furnished flag required on the Ejar unit record
    is_furnished: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
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
    images: Mapped[list["UnitImage"]] = relationship(
        back_populates="unit", cascade="all, delete-orphan", order_by="UnitImage.sort_order"
    )


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # individual | company
    tenant_type: Mapped[str] = mapped_column(String(20), default="individual", nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(150))
    name_ar: Mapped[Optional[str]] = mapped_column(String(150))
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    national_id: Mapped[str] = mapped_column(String(20), nullable=False)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Company-only fields
    cr_number: Mapped[Optional[str]] = mapped_column(String(20))
    cr_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    absher_phone: Mapped[Optional[str]] = mapped_column(String(20))
    representative_name: Mapped[Optional[str]] = mapped_column(String(150))
    representative_national_id: Mapped[Optional[str]] = mapped_column(String(20))
    representative_date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    tax_number: Mapped[Optional[str]] = mapped_column(String(30))
    email: Mapped[Optional[str]] = mapped_column(String(120))

    # ── Ejar party identity (هوية الطرف في منصة إيجار) ──────────────────────
    # نوع الهوية — national_id | iqama | gcc_id | passport | visitor | cr
    id_type: Mapped[str] = mapped_column(String(20), default="national_id", nullable=False)
    id_expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    nationality: Mapped[Optional[str]] = mapped_column(String(60))
    # العنوان الوطني المختصر
    national_address: Mapped[Optional[str]] = mapped_column(String(120))
    ejar_party_id: Mapped[Optional[str]] = mapped_column(String(50))

    notes: Mapped[Optional[str]] = mapped_column(Text)
    notes_en: Mapped[Optional[str]] = mapped_column(Text)
    notes_ar: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    contracts: Mapped[list["Contract"]] = relationship(back_populates="tenant")
    companions: Mapped[list["TenantCompanion"]] = relationship(
        back_populates="tenant",
        cascade="all, delete-orphan",
        order_by="TenantCompanion.id",
    )


class TenantCompanion(Base):
    """Resident companion (مرافق) linked to an individual tenant."""

    __tablename__ = "tenant_companions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    national_id: Mapped[str] = mapped_column(String(20), nullable=False)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    tenant: Mapped["Tenant"] = relationship(back_populates="companions")


class Contract(Base):
    __tablename__ = "contracts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), nullable=False)
    # Required for lease (residential/commercial); optional for management (owner↔company)
    tenant_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tenants.id"), nullable=True)
    # عقد إدارة الأملاك المخوِّل — the management contract that authorises the
    # company to sign this lease on the owner's behalf. Ejar requires the
    # brokerage/management authority to exist before a lease can be registered
    # by anyone other than the landlord.
    management_contract_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("management_contracts.id", ondelete="SET NULL"), nullable=True
    )

    # ── Basic contract data (بيانات العقد الأساسية) ──────────────────────────
    contract_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    # الفرع — managing branch / office (mirrors building.branch)
    branch: Mapped[Optional[str]] = mapped_column(String(100))
    # نوع العقد — "residential" | "commercial" | "management" (owner↔company)
    contract_type: Mapped[str] = mapped_column(String(20), default="residential", nullable=False)
    # صلاحية العقد — contract validity / term type e.g. "fixed" | "open"
    validity_type: Mapped[Optional[str]] = mapped_column(String(30))
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    # مدة العقد — stored separately as entered by user
    duration_years: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    duration_months: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # اجمالي قيمة الإيجار لكل المدة — total rent for the full contract period
    total_rent_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    # rent_amount kept for per-payment amount (used when generating Payment rows)
    rent_amount: Mapped[float] = mapped_column(Float, nullable=False)
    # رقم عقد الإيجار — Ejar lease contract number
    ejar_contract_number: Mapped[Optional[str]] = mapped_column(String(50))

    # ── Billing (فوترة العقد) ────────────────────────────────────────────────
    # نوع الدفعة — "monthly" | "quarterly" | "semi-annual" | "annual" | "full"
    payment_type: Mapped[Optional[str]] = mapped_column(String(30))
    # عدد الدفعات — number of payment instalments
    payment_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # payment_cycle kept for backward compat (interval in months between payments)
    payment_cycle: Mapped[int] = mapped_column(Integer, nullable=False)
    # الكهرباء — electricity responsibility
    electricity_on_tenant: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # تقسيم فاتورة الكهرباء — split percentage (0-100) when not fully on tenant
    electricity_split_percentage: Mapped[Optional[float]] = mapped_column(Float)
    # الماء — water responsibility
    water_on_tenant: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # تقسيم فاتورة الماء
    water_split_percentage: Mapped[Optional[float]] = mapped_column(Float)
    # مبلغ الكهرباء — electricity bill amount (SAR)
    electricity_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # مبلغ الماء — water bill amount (SAR)
    water_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # رقم عداد الكهرباء — electricity meter number
    electricity_meter_number: Mapped[Optional[str]] = mapped_column(String(50))
    # رقم عداد المياه — water meter number
    water_meter_number: Mapped[Optional[str]] = mapped_column(String(50))
    # خدمات — services fee amount
    services_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # التأمين — security deposit / insurance amount
    insurance_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # VAT — ضريبة القيمة المضافة
    vat_rate: Mapped[float] = mapped_column(Float, default=15, nullable=False)
    vat_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # إجمالي العقد — rent + insurance + utilities + VAT
    total_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # نسبة الوسيط — agent commission %
    agent_percentage: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # نسبة إدارة العقار — property management fee %
    management_percentage: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # الوسيط المرتبط بالعقد — linked agent (owner↔company / lease commission)
    agent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("agents.id", ondelete="SET NULL"), nullable=True
    )

    status: Mapped[str] = mapped_column(String(20), default="active")
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # ── Ejar integration (تكامل منصة إيجار) ─────────────────────────────────
    # "pending" | "registered" | "cancelled" | "failed" | None (not submitted yet)
    ejar_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # المرجع الداخلي في إيجار — Ejar's own reference/UUID for this contract
    ejar_reference: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # timestamp when contract was successfully registered on Ejar
    ejar_registered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # آخر خطأ من إيجار — last rejection reason, surfaced in the UI
    ejar_last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # رسوم تسجيل إيجار — Ejar registration fee charged for this contract
    ejar_registration_fee: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # الطرف الموقّع — who signs on Ejar: "landlord" (المالك) or
    # "property_manager" (المكتب العقاري بموجب عقد إدارة أملاك)
    ejar_signed_by: Mapped[str] = mapped_column(
        String(20), default="property_manager", nullable=False
    )
    # full JSON response from Ejar API stored for audit / debugging
    ejar_response_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    unit: Mapped["Unit"] = relationship(back_populates="contracts")
    tenant: Mapped["Tenant"] = relationship(back_populates="contracts")
    agent: Mapped[Optional["Agent"]] = relationship()
    management_contract: Mapped[Optional["ManagementContract"]] = relationship(
        back_populates="lease_contracts"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="contract", cascade="all, delete-orphan"
    )
    attachments: Mapped[list["ContractAttachment"]] = relationship(
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


class ContractAttachment(Base):
    """File attachment for a rent contract (مرفقات العقد), stored in S3 (or compatible)."""

    __tablename__ = "contract_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id"), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[Optional[str]] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    contract: Mapped["Contract"] = relationship(back_populates="attachments")


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


class BuildingImage(Base):
    """Photo attached to a building, stored in S3 (or compatible)."""

    __tablename__ = "building_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    caption: Mapped[Optional[str]] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    building: Mapped["Building"] = relationship(back_populates="images")


class BuildingDocument(Base):
    """Internal document / file attached to a building (ملفات العقار), stored in S3 (or compatible)."""

    __tablename__ = "building_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # original filename shown to the user
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # MIME type e.g. application/pdf, image/jpeg
    file_type: Mapped[Optional[str]] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    building: Mapped["Building"] = relationship(back_populates="documents")


class UnitImage(Base):
    """Photo attached to a unit."""

    __tablename__ = "unit_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    caption: Mapped[Optional[str]] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    unit: Mapped["Unit"] = relationship(back_populates="images")


class Role(Base):
    """RBAC role with a per-module permission matrix.

    `code` matches the string stored in `User.role`. `permissions` is a JSON
    object: { module_id: { view: 0|1, create: 0|1, edit: 0|1, delete: 0|1, approve: 0|1 } }.
    `system` roles (admin, owner) are seeded read-only — UI prevents edits but the
    backend also rejects mutation attempts on them.
    """

    __tablename__ = "roles"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    label_en: Mapped[str] = mapped_column(String(100), nullable=False)
    label_ar: Mapped[str] = mapped_column(String(100), nullable=False)
    description_en: Mapped[Optional[str]] = mapped_column(Text)
    description_ar: Mapped[Optional[str]] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(20), default="#6B7280")
    system: Mapped[bool] = mapped_column(Boolean, default=False)
    permissions: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


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


# ══════════════════════════════════════════════════════════════════════════════
# Ejar — property management (إدارة الأملاك)
# ══════════════════════════════════════════════════════════════════════════════


class ManagementCompany(Base):
    """The real-estate establishment that operates this portal (المنشأة العقارية).

    Ejar identifies the brokerage/management office by its commercial
    registration and its REGA (الهيئة العامة للعقار) brokerage licence — the
    "FAL" licence (رخصة فال). Every management contract and every lease the
    office registers on Ejar is filed under this establishment, so the data
    lives in one row rather than being repeated on each contract.

    The portal keeps a single active row; ``is_active`` allows superseded
    records (e.g. after a licence renewal that changes the number) to be kept
    for audit instead of being overwritten.
    """

    __tablename__ = "management_companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # ── Identity (بيانات المنشأة) ────────────────────────────────────────────
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(200))
    name_ar: Mapped[Optional[str]] = mapped_column(String(200))
    # السجل التجاري
    cr_number: Mapped[Optional[str]] = mapped_column(String(20))
    cr_issue_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    cr_expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # الرقم الضريبي
    vat_number: Mapped[Optional[str]] = mapped_column(String(30))

    # ── REGA / Ejar licensing (تراخيص الهيئة العامة للعقار) ─────────────────
    # رقم رخصة فال للوساطة والتسويق العقاري
    fal_license_number: Mapped[Optional[str]] = mapped_column(String(40))
    fal_license_expiry: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # رقم رخصة إدارة الأملاك (فال — إدارة الأملاك)
    fal_management_license_number: Mapped[Optional[str]] = mapped_column(String(40))
    fal_management_license_expiry: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # معرّف المنشأة في منصة إيجار
    ejar_establishment_id: Mapped[Optional[str]] = mapped_column(String(50))
    # معرّف الفرع في منصة إيجار
    ejar_branch_id: Mapped[Optional[str]] = mapped_column(String(50))

    # ── Contact & address (بيانات التواصل والعنوان الوطني) ──────────────────
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(120))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    district: Mapped[Optional[str]] = mapped_column(String(100))
    street: Mapped[Optional[str]] = mapped_column(String(200))
    national_address: Mapped[Optional[str]] = mapped_column(String(120))
    postal_code: Mapped[Optional[str]] = mapped_column(String(10))
    building_number: Mapped[Optional[str]] = mapped_column(String(10))
    additional_number: Mapped[Optional[str]] = mapped_column(String(10))

    # ── Authorised representative (المفوّض بالتوقيع) ─────────────────────────
    representative_name: Mapped[Optional[str]] = mapped_column(String(150))
    representative_national_id: Mapped[Optional[str]] = mapped_column(String(20))
    representative_phone: Mapped[Optional[str]] = mapped_column(String(20))
    representative_email: Mapped[Optional[str]] = mapped_column(String(120))

    # ── Banking (الحساب البنكي لتحصيل الإيجارات) ────────────────────────────
    bank_name: Mapped[Optional[str]] = mapped_column(String(100))
    iban: Mapped[Optional[str]] = mapped_column(String(34))

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    management_contracts: Mapped[list["ManagementContract"]] = relationship(
        back_populates="company"
    )


class ManagementContract(Base):
    """Property management contract (عقد إدارة الأملاك) — company ↔ owner.

    This is the Ejar contract that authorises the establishment to manage an
    owner's properties: to advertise them, sign leases on the owner's behalf,
    collect rent, and handle maintenance. On Ejar it is a first-class contract
    type with its own number and lifecycle, distinct from the unit lease
    (عقد الإيجار) signed with a tenant.

    Every lease this office registers points back at the management contract
    that grants the authority (:attr:`Contract.management_contract_id`).
    """

    __tablename__ = "management_contracts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("owners.id"), nullable=False)
    company_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("management_companies.id", ondelete="SET NULL"), nullable=True
    )

    # ── Contract identity (بيانات العقد) ─────────────────────────────────────
    contract_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    # رقم عقد إدارة الأملاك في منصة إيجار
    ejar_contract_number: Mapped[Optional[str]] = mapped_column(String(50))
    # الفرع المسؤول
    branch: Mapped[Optional[str]] = mapped_column(String(100))
    # تاريخ تحرير العقد
    contract_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_months: Mapped[int] = mapped_column(Integer, default=12, nullable=False)
    # التجديد التلقائي
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # مدة الإشعار بالإنهاء (بالأيام)
    notice_period_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)

    # ── Management fee (أتعاب الإدارة) ───────────────────────────────────────
    # "percentage" (نسبة من الإيجار) | "fixed" (مبلغ مقطوع)
    fee_type: Mapped[str] = mapped_column(String(20), default="percentage", nullable=False)
    # نسبة الأتعاب من إجمالي الإيجار المحصّل
    fee_percentage: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # المبلغ المقطوع سنويًا
    fee_fixed_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # طريقة التحصيل: "deduct_from_rent" (خصم من التحصيل) | "invoice_owner" (فاتورة للمالك)
    fee_collection_method: Mapped[str] = mapped_column(
        String(30), default="deduct_from_rent", nullable=False
    )
    vat_rate: Mapped[float] = mapped_column(Float, default=15, nullable=False)
    # القيمة التقديرية السنوية للأتعاب + الضريبة (محسوبة)
    estimated_annual_fee: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    vat_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    total_fee_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # دورية تحويل المتحصلات للمالك (بالأشهر)
    payout_cycle_months: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # ── Scope of authority (صلاحيات المدير — نطاق الوكالة) ──────────────────
    # التسويق والإعلان عن الوحدات
    can_market_units: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # توقيع عقود الإيجار نيابة عن المالك (يُشترط لتسجيل العقود في إيجار)
    can_sign_leases: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # تحصيل الإيجارات
    can_collect_rent: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # إخلاء الوحدات ورفع الدعاوى
    can_evict: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # تنفيذ أعمال الصيانة
    can_maintain: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # سقف الصيانة بدون رجوع للمالك (ريال)
    maintenance_limit_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # سداد فواتير الخدمات نيابة عن المالك
    can_pay_utilities: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # active | expired | terminated | draft
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # ── Ejar integration (تكامل منصة إيجار) ─────────────────────────────────
    # None | "pending" | "registered" | "cancelled" | "failed"
    ejar_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    ejar_reference: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    ejar_registered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ejar_last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ejar_response_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    owner: Mapped["Owner"] = relationship(back_populates="management_contracts")
    company: Mapped[Optional["ManagementCompany"]] = relationship(
        back_populates="management_contracts"
    )
    properties: Mapped[list["ManagementContractProperty"]] = relationship(
        back_populates="management_contract", cascade="all, delete-orphan"
    )
    attachments: Mapped[list["ManagementContractAttachment"]] = relationship(
        back_populates="management_contract", cascade="all, delete-orphan"
    )
    lease_contracts: Mapped[list["Contract"]] = relationship(
        back_populates="management_contract"
    )


class ManagementContractProperty(Base):
    """A property (or single unit) placed under a management contract.

    Ejar requires the managed portfolio to be enumerated on the management
    contract. ``unit_id`` is optional: leaving it NULL means the whole building
    is under management, setting it scopes the mandate to one unit.
    """

    __tablename__ = "management_contract_properties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    management_contract_id: Mapped[int] = mapped_column(
        ForeignKey("management_contracts.id", ondelete="CASCADE"), nullable=False
    )
    building_id: Mapped[int] = mapped_column(
        ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False
    )
    unit_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("units.id", ondelete="CASCADE"), nullable=True
    )
    # نسبة أتعاب خاصة بهذا العقار (تتجاوز نسبة العقد عند تعبئتها)
    fee_percentage_override: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    management_contract: Mapped["ManagementContract"] = relationship(
        back_populates="properties"
    )
    building: Mapped["Building"] = relationship()
    unit: Mapped[Optional["Unit"]] = relationship()


class ManagementContractAttachment(Base):
    """File attached to a management contract (مرفقات عقد الإدارة)."""

    __tablename__ = "management_contract_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    management_contract_id: Mapped[int] = mapped_column(
        ForeignKey("management_contracts.id", ondelete="CASCADE"), nullable=False
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[Optional[str]] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    management_contract: Mapped["ManagementContract"] = relationship(
        back_populates="attachments"
    )
