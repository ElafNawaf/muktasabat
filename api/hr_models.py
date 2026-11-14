"""HR (الموارد البشرية): employee records, leave, short permissions, travel tickets, attendance.

Workflow for every request (leave / permission / ticket):
    pending → approved | rejected            (decided by the HR approver)
    pending → cancelled                      (by the employee)
    approved ticket → booked                 (HR records booking ref + cost)
The approver is the user chosen in HR settings (else users with the
`hr_manager` role, else admins). The CEO (PAYMENT_ALERTS_CC / HR settings cc)
is copied on leave and ticket emails. Nobody approves their own request.
"""
from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from api.database import Base


class HrProfile(Base):
    __tablename__ = "hr_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    employee_no: Mapped[Optional[str]] = mapped_column(String(30))
    department: Mapped[Optional[str]] = mapped_column(String(80))
    job_title: Mapped[Optional[str]] = mapped_column(String(120))
    manager_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    company_id: Mapped[Optional[int]] = mapped_column(Integer, index=True)  # hr_companies.id (group ERP)
    department_id: Mapped[Optional[int]] = mapped_column(Integer)  # hr_departments.id
    hire_date: Mapped[Optional[date]] = mapped_column(Date)
    nationality: Mapped[Optional[str]] = mapped_column(String(60))
    contract_type: Mapped[str] = mapped_column(String(20), default="full_time", nullable=False)  # full_time|part_time|contractor
    employment_status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active|probation|resigned|terminated
    annual_leave_days: Mapped[float] = mapped_column(Float, default=21, nullable=False)
    leave_adjustment: Mapped[float] = mapped_column(Float, default=0, nullable=False)  # carry-over / manual +/-
    ticket_entitlement: Mapped[str] = mapped_column(String(12), default="none", nullable=False)  # none|annual|biennial
    ticket_destination: Mapped[Optional[str]] = mapped_column(String(80))
    ticket_class: Mapped[str] = mapped_column(String(12), default="economy", nullable=False)
    ticket_family_members: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    work_start: Mapped[Optional[time]] = mapped_column(Time)  # overrides HR settings
    work_end: Mapped[Optional[time]] = mapped_column(Time)
    # office: must check in at HQ · remote: anywhere, every day · hybrid: anywhere on remote_days
    work_mode: Mapped[str] = mapped_column(String(10), default="office", nullable=False)
    remote_days: Mapped[Optional[str]] = mapped_column(String(20))  # Python weekday() list, e.g. "0,2"
    # Where office-mode attendance may be recorded: company (zones of the employee's company + group-wide zones),
    # custom (only site_ids), any (every active zone). checkout_rule: site (time counts until last seen in a zone) | anywhere.
    site_policy: Mapped[str] = mapped_column(String(10), default="company", nullable=False)
    site_ids: Mapped[Optional[str]] = mapped_column(String(200))
    checkout_rule: Mapped[str] = mapped_column(String(10), default="site", nullable=False)
    # GOSI: auto (Saudi → existing scheme, others → hazards only) | old | new (first-time entrants since 3 Jul 2024) | expat | none
    gosi_scheme: Mapped[str] = mapped_column(String(10), default="auto", nullable=False)
    emergency_contact: Mapped[Optional[str]] = mapped_column(String(160))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class HrRequest(Base):
    __tablename__ = "hr_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(14), nullable=False, index=True)  # leave|permission|ticket|work_location
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(12), default="pending", nullable=False, index=True)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    # leave
    leave_type: Mapped[Optional[str]] = mapped_column(String(20))
    start_date: Mapped[Optional[date]] = mapped_column(Date, index=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    days: Mapped[Optional[float]] = mapped_column(Float)
    delegate_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # permission (استئذان)
    permission_type: Mapped[Optional[str]] = mapped_column(String(20))  # late_arrival|early_leave|during_day
    from_time: Mapped[Optional[time]] = mapped_column(Time)
    to_time: Mapped[Optional[time]] = mapped_column(Time)
    minutes: Mapped[Optional[int]] = mapped_column(Integer)
    # ticket
    # work_location (remote day / field visit away from HQ)
    location_type: Mapped[Optional[str]] = mapped_column(String(10))  # remote|field
    location_note: Mapped[Optional[str]] = mapped_column(String(200))
    ticket_purpose: Mapped[Optional[str]] = mapped_column(String(20))  # annual_leave|business|exit_reentry|other
    leave_request_id: Mapped[Optional[int]] = mapped_column(ForeignKey("hr_requests.id", ondelete="SET NULL"))
    from_city: Mapped[Optional[str]] = mapped_column(String(80))
    to_city: Mapped[Optional[str]] = mapped_column(String(80))
    return_date: Mapped[Optional[date]] = mapped_column(Date)
    round_trip: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    travellers: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    travel_class: Mapped[Optional[str]] = mapped_column(String(12))
    estimated_cost: Mapped[Optional[float]] = mapped_column(Float)
    booking_ref: Mapped[Optional[str]] = mapped_column(String(60))
    actual_cost: Mapped[Optional[float]] = mapped_column(Float)
    # decision
    decided_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    decision_note: Mapped[Optional[str]] = mapped_column(Text)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class HrRequestEvent(Base):
    __tablename__ = "hr_request_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("hr_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    actor: Mapped[Optional[str]] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)


class Attendance(Base):
    __tablename__ = "hr_attendance"
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_attendance_user_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    day: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    check_in: Mapped[Optional[time]] = mapped_column(Time)
    check_out: Mapped[Optional[time]] = mapped_column(Time)
    source: Mapped[str] = mapped_column(String(12), default="web", nullable=False)  # web|manual|auto
    note: Mapped[Optional[str]] = mapped_column(String(300))
    mode: Mapped[str] = mapped_column(String(10), default="office", nullable=False)  # office|remote|field
    in_lat: Mapped[Optional[float]] = mapped_column(Float)
    in_lng: Mapped[Optional[float]] = mapped_column(Float)
    in_accuracy: Mapped[Optional[float]] = mapped_column(Float)
    in_distance: Mapped[Optional[float]] = mapped_column(Float)
    out_lat: Mapped[Optional[float]] = mapped_column(Float)
    out_lng: Mapped[Optional[float]] = mapped_column(Float)
    out_accuracy: Mapped[Optional[float]] = mapped_column(Float)
    out_distance: Mapped[Optional[float]] = mapped_column(Float)
    in_site_id: Mapped[Optional[int]] = mapped_column(Integer)
    out_site_id: Mapped[Optional[int]] = mapped_column(Integer)
    last_ping_at: Mapped[Optional[datetime]] = mapped_column(DateTime)  # Riyadh local, naive
    last_inside_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    outside_since: Mapped[Optional[datetime]] = mapped_column(DateTime)
    away_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    auto_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    edited_by: Mapped[Optional[str]] = mapped_column(String(160))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class HrSettings(Base):
    """Single row (id=1)."""
    __tablename__ = "hr_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    approver_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    cc_emails: Mapped[Optional[str]] = mapped_column(String(500))  # blank → PAYMENT_ALERTS_CC (CEO)
    work_start: Mapped[time] = mapped_column(Time, default=time(9, 0), nullable=False)
    work_end: Mapped[time] = mapped_column(Time, default=time(17, 0), nullable=False)
    grace_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    weekend_days: Mapped[str] = mapped_column(String(20), default="4", nullable=False)  # Python weekday(): Fri=4, Sat=5
    monthly_permission_minutes: Mapped[int] = mapped_column(Integer, default=240, nullable=False)
    office_lat: Mapped[float] = mapped_column(Float, default=24.8138003, nullable=False)  # HQ (Google Maps pin)
    office_lng: Mapped[float] = mapped_column(Float, default=46.7242436, nullable=False)
    geofence_radius_m: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    max_accuracy_m: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    enforce_location: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ping_minutes: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    left_alert_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    missing_checkout_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    checkin_reminder_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    daily_summary: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    attendance_from: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)  # days before → not tracked
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class LocationPing(Base):
    """Every location the portal reported for an employee during a work day
    (check-in, check-out, presence pings while a portal page is open, refused check-ins)."""
    __tablename__ = "hr_location_pings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    day: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    at: Mapped[datetime] = mapped_column(DateTime, nullable=False)  # Riyadh local, naive
    kind: Mapped[str] = mapped_column(String(12), nullable=False)  # check_in|check_out|ping|refused
    lat: Mapped[Optional[float]] = mapped_column(Float)
    lng: Mapped[Optional[float]] = mapped_column(Float)
    accuracy: Mapped[Optional[float]] = mapped_column(Float)
    distance: Mapped[Optional[float]] = mapped_column(Float)
    inside: Mapped[Optional[bool]] = mapped_column(Boolean)
    note: Mapped[Optional[str]] = mapped_column(String(200))


class HrAlertLog(Base):
    """One row per alert actually sent — makes the monitor idempotent."""
    __tablename__ = "hr_alert_log"
    __table_args__ = (UniqueConstraint("user_id", "day", "kind", name="uq_hr_alert"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)  # 0 = company-wide (daily summary)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # no_checkin|left_area|no_checkout|auto_closed|summary
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class HrWorkSite(Base):
    """An attendance zone: a point and radius where staff may check in (an office, a branch, a project site).
    company_id empty = open to the whole group."""
    __tablename__ = "hr_work_sites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[Optional[int]] = mapped_column(Integer, index=True)
    name_ar: Mapped[str] = mapped_column(String(120), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(120))
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    radius_m: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(300))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by: Mapped[Optional[str]] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
