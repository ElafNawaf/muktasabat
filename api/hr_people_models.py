"""HR people data (unified ERP across the group): companies, departments,
personal file, family, bank details, employment contracts and company assets.

Muktasabat is the holding company; subsidiaries (e.g. the elevator company)
share one HR system. Every employee belongs to one company and optionally a
department; reporting lines live on HrProfile.manager_user_id.

Sensitive data rules (enforced in api/routers/hr_people.py):
- an employee sees and edits their own personal file and family;
- bank / IBAN changes by the employee wait for HR approval before they apply;
- salary is visible to the employee, HR approvers (hr.approve) and admins only;
- contracts are created by HR approvers and only become active once the
  employee accepts the terms in the portal (timestamped).
"""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from api.database import Base


class HrCompany(Base):
    __tablename__ = "hr_companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_ar: Mapped[str] = mapped_column(String(160), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(160))
    short_code: Mapped[Optional[str]] = mapped_column(String(10))  # used in employee / asset numbers
    is_holding: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("hr_companies.id", ondelete="SET NULL"))
    cr_number: Mapped[Optional[str]] = mapped_column(String(30))
    color: Mapped[Optional[str]] = mapped_column(String(9))
    # Office used for attendance check-in (falls back to HR settings HQ when empty)
    office_lat: Mapped[Optional[float]] = mapped_column(Float)
    office_lng: Mapped[Optional[float]] = mapped_column(Float)
    geofence_radius_m: Mapped[Optional[int]] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class HrDepartment(Base):
    __tablename__ = "hr_departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("hr_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("hr_departments.id", ondelete="SET NULL"))
    name_ar: Mapped[str] = mapped_column(String(120), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(120))
    head_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class HrPersonal(Base):
    """Personal file, 1:1 with a staff user."""
    __tablename__ = "hr_personal"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    first_name_ar: Mapped[Optional[str]] = mapped_column(String(60))
    father_name_ar: Mapped[Optional[str]] = mapped_column(String(60))
    family_name_ar: Mapped[Optional[str]] = mapped_column(String(60))
    first_name_en: Mapped[Optional[str]] = mapped_column(String(60))
    family_name_en: Mapped[Optional[str]] = mapped_column(String(60))
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date)
    gender: Mapped[Optional[str]] = mapped_column(String(10))  # male|female
    marital_status: Mapped[Optional[str]] = mapped_column(String(12))  # single|married|divorced|widowed
    religion: Mapped[Optional[str]] = mapped_column(String(30))
    id_type: Mapped[Optional[str]] = mapped_column(String(12))  # national_id|iqama
    id_number: Mapped[Optional[str]] = mapped_column(String(20))
    id_expiry: Mapped[Optional[date]] = mapped_column(Date)
    passport_number: Mapped[Optional[str]] = mapped_column(String(20))
    passport_country: Mapped[Optional[str]] = mapped_column(String(60))
    passport_issue: Mapped[Optional[date]] = mapped_column(Date)
    passport_expiry: Mapped[Optional[date]] = mapped_column(Date)
    personal_email: Mapped[Optional[str]] = mapped_column(String(120))
    personal_phone: Mapped[Optional[str]] = mapped_column(String(20))
    address: Mapped[Optional[str]] = mapped_column(String(300))
    city: Mapped[Optional[str]] = mapped_column(String(60))
    emergency_name: Mapped[Optional[str]] = mapped_column(String(120))
    emergency_relation: Mapped[Optional[str]] = mapped_column(String(40))
    emergency_phone: Mapped[Optional[str]] = mapped_column(String(20))
    gosi_number: Mapped[Optional[str]] = mapped_column(String(20))
    bank_name: Mapped[Optional[str]] = mapped_column(String(80))
    iban: Mapped[Optional[str]] = mapped_column(String(34))
    account_holder: Mapped[Optional[str]] = mapped_column(String(120))
    bank_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    pending_bank_name: Mapped[Optional[str]] = mapped_column(String(80))
    pending_iban: Mapped[Optional[str]] = mapped_column(String(34))
    pending_account_holder: Mapped[Optional[str]] = mapped_column(String(120))
    pending_bank_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by: Mapped[Optional[str]] = mapped_column(String(160))


class HrFamilyMember(Base):
    __tablename__ = "hr_family_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    relation: Mapped[str] = mapped_column(String(12), nullable=False)  # spouse|son|daughter|father|mother|brother|sister|other
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date)
    id_number: Mapped[Optional[str]] = mapped_column(String(20))
    passport_number: Mapped[Optional[str]] = mapped_column(String(20))
    dependent: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)  # medical insurance / tickets
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    notes: Mapped[Optional[str]] = mapped_column(String(200))


class HrContract(Base):
    __tablename__ = "hr_contracts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id: Mapped[Optional[int]] = mapped_column(ForeignKey("hr_companies.id", ondelete="SET NULL"))
    contract_type: Mapped[str] = mapped_column(String(12), default="fixed", nullable=False)  # fixed|unlimited|part_time|temporary
    job_title: Mapped[Optional[str]] = mapped_column(String(120))
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    probation_end: Mapped[Optional[date]] = mapped_column(Date)
    basic_salary: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    housing_allowance: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    transport_allowance: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    other_allowance: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    other_allowance_label: Mapped[Optional[str]] = mapped_column(String(80))
    working_hours_week: Mapped[Optional[int]] = mapped_column(Integer)
    annual_leave_days: Mapped[Optional[int]] = mapped_column(Integer)
    notice_days: Mapped[Optional[int]] = mapped_column(Integer)
    terms: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)  # draft|pending_acceptance|accepted|terminated
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    accepted_name: Mapped[Optional[str]] = mapped_column(String(160))
    accepted_ip: Mapped[Optional[str]] = mapped_column(String(64))
    declined_note: Mapped[Optional[str]] = mapped_column(String(500))
    terminated_at: Mapped[Optional[date]] = mapped_column(Date)
    termination_reason: Mapped[Optional[str]] = mapped_column(String(300))
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    # Contract document: rendered from a template (or written by HR for this employee) and frozen on acceptance.
    template_id: Mapped[Optional[int]] = mapped_column(ForeignKey("hr_contract_templates.id", ondelete="SET NULL"))
    body: Mapped[Optional[str]] = mapped_column(Text)
    body_custom: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Signed copy (evidence): employee or HR uploads the wet-signed / scanned contract, HR verifies it.
    signed_key: Mapped[Optional[str]] = mapped_column(String(300))
    signed_filename: Mapped[Optional[str]] = mapped_column(String(200))
    signed_status: Mapped[Optional[str]] = mapped_column(String(10))  # uploaded|verified|rejected
    signed_uploaded_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    signed_uploaded_by: Mapped[Optional[str]] = mapped_column(String(120))
    signed_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    signed_reviewed_by: Mapped[Optional[str]] = mapped_column(String(120))
    signed_note: Mapped[Optional[str]] = mapped_column(String(300))


class HrContractTemplate(Base):
    """Employment-contract template HR maintains per company (or group-wide when company_id is empty).
    Text uses {{placeholders}} filled from the employee file and the contract figures."""
    __tablename__ = "hr_contract_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[Optional[int]] = mapped_column(ForeignKey("hr_companies.id", ondelete="SET NULL"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    contract_type: Mapped[str] = mapped_column(String(12), default="fixed", nullable=False)
    body_ar: Mapped[str] = mapped_column(Text, nullable=False)
    body_en: Mapped[Optional[str]] = mapped_column(Text)
    probation_days: Mapped[int] = mapped_column(Integer, default=90, nullable=False)
    duration_months: Mapped[Optional[int]] = mapped_column(Integer)  # fixed-term length; empty = open-ended
    working_hours_week: Mapped[int] = mapped_column(Integer, default=48, nullable=False)
    annual_leave_days: Mapped[int] = mapped_column(Integer, default=21, nullable=False)
    notice_days: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    requires_signed_copy: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by: Mapped[Optional[str]] = mapped_column(String(120))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class HrAsset(Base):
    __tablename__ = "hr_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tag: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    company_id: Mapped[Optional[int]] = mapped_column(ForeignKey("hr_companies.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(14), nullable=False)  # laptop|desktop|phone|tablet|car|sim|cash|card|keys|uniform|tools|other
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    brand_model: Mapped[Optional[str]] = mapped_column(String(120))
    serial: Mapped[Optional[str]] = mapped_column(String(80))  # serial / IMEI / plate / card no. (last 4)
    value: Mapped[Optional[float]] = mapped_column(Float)  # purchase value, or the cash amount for cash custody
    purchase_date: Mapped[Optional[date]] = mapped_column(Date)
    warranty_end: Mapped[Optional[date]] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(12), default="in_stock", nullable=False)  # in_stock|assigned|maintenance|lost|retired
    assigned_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    assigned_at: Mapped[Optional[date]] = mapped_column(Date)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    condition: Mapped[Optional[str]] = mapped_column(String(12))  # new|good|fair|damaged
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class HrAssetEvent(Base):
    __tablename__ = "hr_asset_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("hr_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    actor: Mapped[Optional[str]] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(20), nullable=False)  # created|assigned|acknowledged|returned|status|edited
    user_id: Mapped[Optional[int]] = mapped_column(Integer)
    note: Mapped[Optional[str]] = mapped_column(String(300))
