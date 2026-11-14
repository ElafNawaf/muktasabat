"""HR module API. See api/hr_models.py for the workflow.

Self-service (/hr/me…, POST /hr/requests) is open to every staff account
(owner and tenant accounts are blocked globally by api/deps.py).
Management endpoints use the `hr` permission module:
  view → see everyone; create → file on behalf; edit → profiles, attendance, bookings;
  approve → decide requests and change HR settings.
"""
from __future__ import annotations

import calendar
import logging
import uuid
from datetime import date, datetime, time, timedelta, timezone
from html import escape
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.config import get_settings
from api.deps import CurrentUser, DbSession
from api.email import EmailMessage, _branded, _button, send_email
from api.hr_models import Attendance, HrProfile, HrRequest, HrRequestEvent, HrSettings
from api.models import User
from api.permissions import Perm, has_permission

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/hr", tags=["hr"])

RIYADH = timezone(timedelta(hours=3))
NON_STAFF = {"owner", "tenant"}
ANNUAL = "annual"
LeaveType = Literal["annual", "sick", "emergency", "unpaid", "hajj", "marriage", "bereavement", "maternity", "paternity", "exam", "other"]
PermissionType = Literal["late_arrival", "early_leave", "during_day"]
TicketPurpose = Literal["annual_leave", "business", "exit_reentry", "other"]

LEAVE_AR = {"annual": "إجازة سنوية", "sick": "إجازة مرضية", "emergency": "إجازة اضطرارية", "unpaid": "إجازة بدون راتب", "hajj": "إجازة حج",
            "marriage": "إجازة زواج", "bereavement": "إجازة وفاة", "maternity": "إجازة وضع", "paternity": "إجازة مولود", "exam": "إجازة اختبار", "other": "إجازة أخرى"}
LEAVE_EN = {"annual": "Annual leave", "sick": "Sick leave", "emergency": "Emergency leave", "unpaid": "Unpaid leave", "hajj": "Hajj leave",
            "marriage": "Marriage leave", "bereavement": "Bereavement leave", "maternity": "Maternity leave", "paternity": "Paternity leave", "exam": "Exam leave", "other": "Other leave"}
KIND_AR = {"leave": "طلب إجازة", "permission": "طلب استئذان", "ticket": "طلب تذكرة سفر"}
KIND_EN = {"leave": "Leave request", "permission": "Permission request", "ticket": "Travel ticket request"}


# ───────────────────────── helpers ─────────────────────────


def now_riyadh() -> datetime:
    return datetime.now(RIYADH)


def today_riyadh() -> date:
    return now_riyadh().date()


def _uname(u: Optional[User], locale: str = "ar") -> str:
    if u is None:
        return "—"
    if locale == "ar":
        return u.full_name_ar or u.full_name or u.username
    return u.full_name or u.full_name_ar or u.username


def _settings(db: Session) -> HrSettings:
    s = db.get(HrSettings, 1)
    if s is None:
        s = HrSettings(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def _profile(db: Session, user_id: int) -> HrProfile:
    p = db.scalar(select(HrProfile).where(HrProfile.user_id == user_id))
    if p is None:
        p = HrProfile(user_id=user_id)
        db.add(p)
        db.flush()
    return p


def _weekend(s: HrSettings) -> set[int]:
    return {int(x) for x in (s.weekend_days or "4").split(",") if x.strip().isdigit()}


def working_days(a: date, b: date, weekend: set[int]) -> int:
    if b < a:
        return 0
    return sum(1 for i in range((b - a).days + 1) if (a + timedelta(days=i)).weekday() not in weekend)


def _minutes(a: time, b: time) -> int:
    return max(0, (b.hour * 60 + b.minute) - (a.hour * 60 + a.minute))


def _staff(db: Session, working_only: bool = False) -> list[User]:
    """Staff accounts. working_only drops system accounts and people who left
    (HR sets employment_status to excluded / resigned / terminated)."""
    users = [u for u in db.scalars(select(User).order_by(User.id)).all() if u.role not in NON_STAFF and u.is_active_user]
    if not working_only:
        return users
    gone = {p.user_id for p in db.scalars(select(HrProfile).where(HrProfile.employment_status.in_(["excluded", "resigned", "terminated"]))).all()}
    return [u for u in users if u.id not in gone]


def _require_staff(user: User) -> None:
    if user.role in NON_STAFF:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "HR is for staff accounts.")


def _approvers(db: Session, exclude_user_id: Optional[int] = None) -> list[User]:
    s = _settings(db)
    out: list[User] = []
    if s.approver_user_id:
        u = db.get(User, s.approver_user_id)
        if u and u.is_active_user:
            out = [u]
    if not out:
        out = [u for u in db.scalars(select(User).where(User.role == "hr_manager")).all() if u.is_active_user]
    if not out:
        out = [u for u in db.scalars(select(User).where(User.role == "admin")).all() if u.is_active_user]
    others = [u for u in out if u.id != exclude_user_id]
    if not others:  # the approver is asking for themselves → admins decide
        others = [u for u in db.scalars(select(User).where(User.role == "admin")).all() if u.is_active_user and u.id != exclude_user_id]
    return others


def _cc(db: Session) -> list[str]:
    s = _settings(db)
    raw = s.cc_emails if (s.cc_emails or "").strip() else get_settings().payment_alerts_cc
    return [e.strip().lower() for e in (raw or "").split(",") if e.strip()]


def _base() -> str:
    return get_settings().web_base_url.rstrip("/")


def _send(to: Optional[str], cc: list[str], subject: str, ar: str, en: str, url: str, lar: str, len_: str) -> None:
    if not to:
        return
    try:
        cc = [c for c in cc if c and c != to.lower()]
        html = _branded(f"{ar}{_button(url, lar)}", f"{en}{_button(url, len_)}", preheader=subject)
        send_email(EmailMessage(to=to, cc=cc or None, subject=subject, text_body=f"{subject}\n{url}", html_body=html, category="hr"))
    except Exception:  # noqa: BLE001 — never block HR workflow on email
        logger.exception("hr email failed")


def _log(db: Session, r: HrRequest, actor: str, action: str, note: Optional[str] = None) -> None:
    db.add(HrRequestEvent(request_id=r.id, actor=actor, action=action, note=note))


def _summary(r: HrRequest, locale: str) -> str:
    if r.kind == "leave":
        lt = (LEAVE_AR if locale == "ar" else LEAVE_EN).get(r.leave_type or "", r.leave_type or "")
        n = f"{r.days:g}" if r.days is not None else ""
        return f"{lt}: {r.start_date} → {r.end_date} ({n} {'يوم عمل' if locale == 'ar' else 'working days'})"
    if r.kind == "permission":
        return f"{r.start_date} {r.from_time.strftime('%H:%M') if r.from_time else ''}–{r.to_time.strftime('%H:%M') if r.to_time else ''} ({r.minutes} {'دقيقة' if locale == 'ar' else 'min'})"
    route = f"{r.from_city or ''} → {r.to_city or ''}"
    return f"{route} · {r.start_date}{(' ↔ ' + str(r.return_date)) if r.round_trip and r.return_date else ''} · {r.travellers}"


def balance(db: Session, user_id: int, year: Optional[int] = None) -> dict:
    y = year or today_riyadh().year
    p = _profile(db, user_id)
    rows = db.scalars(select(HrRequest).where(HrRequest.user_id == user_id, HrRequest.kind == "leave", HrRequest.leave_type == ANNUAL,
                                              HrRequest.status.in_(["approved", "pending"]))).all()
    used = sum(r.days or 0 for r in rows if r.status == "approved" and r.start_date and r.start_date.year == y)
    pending = sum(r.days or 0 for r in rows if r.status == "pending" and r.start_date and r.start_date.year == y)
    ent = (p.annual_leave_days or 0) + (p.leave_adjustment or 0)
    m0 = today_riyadh().replace(day=1)
    perm_used = sum(r.minutes or 0 for r in db.scalars(select(HrRequest).where(
        HrRequest.user_id == user_id, HrRequest.kind == "permission", HrRequest.status == "approved", HrRequest.start_date >= m0)).all())
    s = _settings(db)
    return {"year": y, "entitlement": ent, "used": used, "pending": pending, "remaining": round(ent - used - pending, 1),
            "permission_minutes_month": perm_used, "permission_minutes_cap": s.monthly_permission_minutes}


def _out(db: Session, r: HrRequest, locale: str, detail: bool = False) -> dict:
    u = db.get(User, r.user_id)
    d = {
        "id": r.id, "number": r.number, "kind": r.kind, "status": r.status, "user_id": r.user_id, "employee": _uname(u, locale),
        "reason": r.reason, "leave_type": r.leave_type, "start_date": r.start_date.isoformat() if r.start_date else None,
        "end_date": r.end_date.isoformat() if r.end_date else None, "days": r.days,
        "delegate": _uname(db.get(User, r.delegate_user_id), locale) if r.delegate_user_id else None,
        "permission_type": r.permission_type, "from_time": r.from_time.strftime("%H:%M") if r.from_time else None,
        "to_time": r.to_time.strftime("%H:%M") if r.to_time else None, "minutes": r.minutes,
        "ticket_purpose": r.ticket_purpose, "from_city": r.from_city, "to_city": r.to_city,
        "return_date": r.return_date.isoformat() if r.return_date else None, "round_trip": r.round_trip, "travellers": r.travellers,
        "travel_class": r.travel_class, "estimated_cost": r.estimated_cost, "booking_ref": r.booking_ref, "actual_cost": r.actual_cost,
        "leave_request_id": r.leave_request_id,
        "decided_by": _uname(db.get(User, r.decided_by_id), locale) if r.decided_by_id else None,
        "decided_at": r.decided_at.isoformat() if r.decided_at else None, "decision_note": r.decision_note,
        "created_at": r.created_at.isoformat(), "summary": _summary(r, locale),
    }
    if detail:
        d["events"] = [{"at": e.at.isoformat(), "actor": e.actor, "action": e.action, "note": e.note}
                       for e in db.scalars(select(HrRequestEvent).where(HrRequestEvent.request_id == r.id).order_by(HrRequestEvent.id)).all()]
        if r.kind == "leave" and r.leave_type == ANNUAL:
            d["balance"] = balance(db, r.user_id, r.start_date.year if r.start_date else None)
    return d


def _get(db: Session, rid: int) -> HrRequest:
    r = db.get(HrRequest, rid)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    return r


def _leave_on(db: Session, user_id: int, d: date) -> Optional[HrRequest]:
    return db.scalar(select(HrRequest).where(HrRequest.user_id == user_id, HrRequest.kind == "leave", HrRequest.status == "approved",
                                             HrRequest.start_date <= d, HrRequest.end_date >= d))


def _day_status(db: Session, s: HrSettings, p: Optional[HrProfile], user_id: int, d: date, att: Optional[Attendance], now: datetime) -> dict:
    start = (p.work_start if p and p.work_start else s.work_start)
    end = (p.work_end if p and p.work_end else s.work_end)
    lv = _leave_on(db, user_id, d)
    late = 0
    excused = False
    if att and att.check_in:
        late = max(0, _minutes(start, att.check_in) - s.grace_minutes)
        if late:
            perm = db.scalar(select(HrRequest).where(HrRequest.user_id == user_id, HrRequest.kind == "permission", HrRequest.status == "approved",
                                                     HrRequest.start_date == d, HrRequest.permission_type == "late_arrival"))
            if perm and perm.to_time and att.check_in <= time(perm.to_time.hour, perm.to_time.minute):
                excused = True
    worked = _minutes(att.check_in, att.check_out) if att and att.check_in and att.check_out else None
    if lv:
        st = "on_leave"
    elif not att and (d < s.attendance_from or (p and p.employment_status in ("excluded", "resigned", "terminated"))):
        st = "untracked"
    elif d.weekday() in _weekend(s):
        st = "weekend" if not att else "present"
    elif att and att.check_in:
        st = "late" if late and not excused else "present"
    elif d < now.date() or (d == now.date() and now.time() > time(min(23, start.hour + (start.minute + s.grace_minutes) // 60), (start.minute + s.grace_minutes) % 60)):
        st = "absent"
    else:
        st = "not_yet"
    early = 0
    if att and att.check_out and att.check_out < end and d < now.date():
        early = _minutes(att.check_out, end)
    return {"status": st, "late_minutes": late if st == "late" else 0, "excused": excused, "worked_minutes": worked,
            "early_leave_minutes": early, "leave_type": lv.leave_type if lv else None,
            "check_in": att.check_in.strftime("%H:%M") if att and att.check_in else None,
            "check_out": att.check_out.strftime("%H:%M") if att and att.check_out else None,
            "source": att.source if att else None, "note": att.note if att else None}


# ───────────────────────── schemas ─────────────────────────


class RequestIn(BaseModel):
    kind: Literal["leave", "permission", "ticket"]
    user_id: Optional[int] = None  # HR filing on behalf of an employee
    reason: Optional[str] = Field(default=None, max_length=2000)
    leave_type: Optional[LeaveType] = None
    start_date: date
    end_date: Optional[date] = None
    delegate_user_id: Optional[int] = None
    permission_type: Optional[PermissionType] = None
    from_time: Optional[time] = None
    to_time: Optional[time] = None
    ticket_purpose: Optional[TicketPurpose] = None
    leave_request_id: Optional[int] = None
    from_city: Optional[str] = Field(default=None, max_length=80)
    to_city: Optional[str] = Field(default=None, max_length=80)
    return_date: Optional[date] = None
    round_trip: bool = True
    travellers: int = Field(default=1, ge=1, le=12)
    travel_class: Optional[Literal["economy", "business", "first"]] = None
    estimated_cost: Optional[float] = Field(default=None, ge=0, le=10_000_000)

    @model_validator(mode="after")
    def _check(self):
        if self.kind == "leave":
            if not self.leave_type or not self.end_date:
                raise ValueError("Leave needs a type and an end date.")
            if self.end_date < self.start_date:
                raise ValueError("The end date is before the start date.")
        elif self.kind == "permission":
            if not (self.permission_type and self.from_time and self.to_time):
                raise ValueError("A permission needs a type and a time range.")
            if self.to_time <= self.from_time:
                raise ValueError("The end time must be after the start time.")
        else:
            if not (self.from_city and self.to_city):
                raise ValueError("A ticket needs a departure and a destination city.")
            if self.round_trip and self.return_date and self.return_date < self.start_date:
                raise ValueError("The return date is before the departure date.")
        return self


class DecisionIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=2000)


class BookIn(BaseModel):
    booking_ref: str = Field(min_length=1, max_length=60)
    actual_cost: Optional[float] = Field(default=None, ge=0, le=10_000_000)
    note: Optional[str] = Field(default=None, max_length=2000)


class ProfileIn(BaseModel):
    employee_no: Optional[str] = Field(default=None, max_length=30)
    department: Optional[str] = Field(default=None, max_length=80)
    job_title: Optional[str] = Field(default=None, max_length=120)
    manager_user_id: Optional[int] = None
    hire_date: Optional[date] = None
    nationality: Optional[str] = Field(default=None, max_length=60)
    contract_type: Literal["full_time", "part_time", "contractor"] = "full_time"
    employment_status: Literal["active", "probation", "resigned", "terminated", "excluded"] = "active"
    annual_leave_days: float = Field(default=21, ge=0, le=60)
    leave_adjustment: float = Field(default=0, ge=-60, le=120)
    ticket_entitlement: Literal["none", "annual", "biennial"] = "none"
    ticket_destination: Optional[str] = Field(default=None, max_length=80)
    ticket_class: Literal["economy", "business", "first"] = "economy"
    ticket_family_members: int = Field(default=0, ge=0, le=12)
    work_start: Optional[time] = None
    work_end: Optional[time] = None
    emergency_contact: Optional[str] = Field(default=None, max_length=160)
    notes: Optional[str] = Field(default=None, max_length=4000)


class AttendanceIn(BaseModel):
    user_id: int
    day: date
    check_in: Optional[time] = None
    check_out: Optional[time] = None
    note: Optional[str] = Field(default=None, max_length=300)


class SettingsIn(BaseModel):
    approver_user_id: Optional[int] = None
    cc_emails: Optional[str] = Field(default=None, max_length=500)
    work_start: time = time(9, 0)
    work_end: time = time(17, 0)
    grace_minutes: int = Field(default=15, ge=0, le=180)
    weekend_days: list[int] = Field(default_factory=lambda: [4])
    monthly_permission_minutes: int = Field(default=240, ge=0, le=6000)
    attendance_from: Optional[date] = None


# ───────────────────────── self-service ─────────────────────────


@router.get("/me")
def me(db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    _require_staff(user)
    s = _settings(db)
    p = _profile(db, user.id)
    db.commit()
    today = today_riyadh()
    att = db.scalar(select(Attendance).where(Attendance.user_id == user.id, Attendance.day == today))
    reqs = db.scalars(select(HrRequest).where(HrRequest.user_id == user.id).order_by(HrRequest.id.desc()).limit(50)).all()
    appr = _approvers(db, exclude_user_id=user.id)
    return {
        "user": {"id": user.id, "name": _uname(user, locale), "job_title": p.job_title or user.job_title, "department": p.department,
                 "employee_no": p.employee_no, "hire_date": p.hire_date.isoformat() if p.hire_date else None,
                 "ticket_entitlement": p.ticket_entitlement, "ticket_destination": p.ticket_destination, "ticket_class": p.ticket_class,
                 "ticket_family_members": p.ticket_family_members},
        "balance": balance(db, user.id),
        "today": _day_status(db, s, p, user.id, today, att, now_riyadh()),
        "work": {"start": (p.work_start or s.work_start).strftime("%H:%M"), "end": (p.work_end or s.work_end).strftime("%H:%M"),
                 "grace": s.grace_minutes, "weekend": sorted(_weekend(s))},
        "approver": ", ".join(_uname(a, locale) for a in appr) or None,
        "requests": [_out(db, r, locale) for r in reqs],
        "colleagues": [{"id": u.id, "name": _uname(u, locale)} for u in _staff(db) if u.id != user.id],
    }


@router.post("/me/check-in")
def check_in(db: DbSession, user: CurrentUser):
    _require_staff(user)
    n = now_riyadh()
    att = db.scalar(select(Attendance).where(Attendance.user_id == user.id, Attendance.day == n.date()))
    if att and att.check_in:
        raise HTTPException(status.HTTP_409_CONFLICT, "You have already checked in today.")
    if att is None:
        att = Attendance(user_id=user.id, day=n.date())
        db.add(att)
    att.check_in = time(n.hour, n.minute)
    att.source = "web"
    db.commit()
    return {"ok": True, "check_in": att.check_in.strftime("%H:%M")}


@router.post("/me/check-out")
def check_out(db: DbSession, user: CurrentUser):
    _require_staff(user)
    n = now_riyadh()
    att = db.scalar(select(Attendance).where(Attendance.user_id == user.id, Attendance.day == n.date()))
    if att is None or not att.check_in:
        raise HTTPException(status.HTTP_409_CONFLICT, "Check in first.")
    att.check_out = time(n.hour, n.minute)
    db.commit()
    return {"ok": True, "check_out": att.check_out.strftime("%H:%M")}


def _month(month: Optional[str]) -> tuple[date, date]:
    t = today_riyadh()
    if month:
        try:
            y, m = (int(x) for x in month.split("-"))
            first = date(y, m, 1)
        except Exception:  # noqa: BLE001
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "month must be YYYY-MM")
    else:
        first = t.replace(day=1)
    last = first.replace(day=calendar.monthrange(first.year, first.month)[1])
    return first, min(last, t)


def _days_for(db: Session, s: HrSettings, user_id: int, first: date, last: date) -> list[dict]:
    p = db.scalar(select(HrProfile).where(HrProfile.user_id == user_id))
    atts = {a.day: a for a in db.scalars(select(Attendance).where(Attendance.user_id == user_id, Attendance.day >= first, Attendance.day <= last)).all()}
    n = now_riyadh()
    out = []
    d = first
    while d <= last:
        out.append({"day": d.isoformat(), **_day_status(db, s, p, user_id, d, atts.get(d), n)})
        d += timedelta(days=1)
    return out


@router.get("/me/attendance")
def my_attendance(db: DbSession, user: CurrentUser, month: Optional[str] = None):
    _require_staff(user)
    first, last = _month(month)
    return _days_for(db, _settings(db), user.id, first, last)


@router.post("/requests", status_code=status.HTTP_201_CREATED)
def create_request(payload: RequestIn, db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    _require_staff(user)
    target_id = user.id
    if payload.user_id and payload.user_id != user.id:
        if not has_permission(db, user, "hr", "create"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only file requests for yourself.")
        target = db.get(User, payload.user_id)
        if target is None or target.role in NON_STAFF:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
        target_id = target.id
    s = _settings(db)
    r = HrRequest(kind=payload.kind, user_id=target_id, reason=payload.reason, start_date=payload.start_date,
                  number=f"tmp-{uuid.uuid4().hex[:12]}", created_by_id=user.id)
    warn = None
    if payload.kind == "leave":
        r.leave_type, r.end_date, r.delegate_user_id = payload.leave_type, payload.end_date, payload.delegate_user_id
        r.days = float(working_days(payload.start_date, payload.end_date, _weekend(s)))
        if r.days <= 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The selected dates contain no working days.")
        clash = db.scalar(select(HrRequest).where(HrRequest.user_id == target_id, HrRequest.kind == "leave",
                                                  HrRequest.status.in_(["pending", "approved"]),
                                                  HrRequest.start_date <= payload.end_date, HrRequest.end_date >= payload.start_date))
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, f"These dates overlap leave request {clash.number}.")
        if payload.leave_type == ANNUAL:
            b = balance(db, target_id, payload.start_date.year)
            if r.days > b["remaining"]:
                raise HTTPException(status.HTTP_409_CONFLICT,
                                    f"Not enough annual leave: {r.days:g} working days requested, {b['remaining']:g} remaining.")
    elif payload.kind == "permission":
        r.permission_type, r.from_time, r.to_time = payload.permission_type, payload.from_time, payload.to_time
        r.minutes = _minutes(payload.from_time, payload.to_time)
        b = balance(db, target_id)
        if b["permission_minutes_month"] + r.minutes > s.monthly_permission_minutes:
            warn = "over_monthly_cap"
    else:
        p = _profile(db, target_id)
        r.ticket_purpose = payload.ticket_purpose or "annual_leave"
        r.leave_request_id, r.from_city, r.to_city = payload.leave_request_id, payload.from_city, payload.to_city
        r.return_date, r.round_trip, r.travellers = payload.return_date, payload.round_trip, payload.travellers
        r.travel_class = payload.travel_class or p.ticket_class
        r.estimated_cost = payload.estimated_cost
    db.add(r)
    db.flush()
    prefix = {"leave": "LV", "permission": "PR", "ticket": "TK"}[r.kind]
    r.number = f"{prefix}-{r.id:05d}"
    actor = _uname(user, "ar")
    _log(db, r, actor, "submitted" if target_id == user.id else "filed_by_hr", "over_monthly_cap" if warn else None)
    db.commit()
    db.refresh(r)

    emp = db.get(User, target_id)
    cc = _cc(db) if r.kind in ("leave", "ticket") else []
    url = f"{_base()}/ar/hr?open={r.id}"
    for a in _approvers(db, exclude_user_id=target_id):
        _send(a.email, cc, f"{KIND_AR[r.kind]} بانتظار موافقتك — {_uname(emp, 'ar')} | {KIND_EN[r.kind]} awaiting approval — {_uname(emp, 'en')} ({r.number})",
              f"<p>قدّم <strong>{escape(_uname(emp, 'ar'))}</strong> {KIND_AR[r.kind]}:</p><p>{escape(_summary(r, 'ar'))}</p>" + (f"<p>السبب: {escape(r.reason)}</p>" if r.reason else ""),
              f"<p><strong>{escape(_uname(emp, 'en'))}</strong> submitted a {KIND_EN[r.kind].lower()}:</p><p>{escape(_summary(r, 'en'))}</p>" + (f"<p>Reason: {escape(r.reason)}</p>" if r.reason else ""),
              url, "مراجعة الطلب", "Review request")
    out = _out(db, r, locale, detail=True)
    out["warning"] = warn
    return out


@router.get("/requests/{rid}")
def get_request(rid: int, db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    r = _get(db, rid)
    if r.user_id != user.id and not has_permission(db, user, "hr", "view"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    return _out(db, r, locale, detail=True)


@router.post("/requests/{rid}/cancel")
def cancel_request(rid: int, db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    r = _get(db, rid)
    hr_edit = has_permission(db, user, "hr", "edit")
    if r.user_id != user.id and not hr_edit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    allowed = {"pending"} if not hr_edit else {"pending", "approved"}
    if r.status not in allowed:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {r.status} request can't be cancelled.")
    if r.status == "approved" and r.start_date and r.start_date < today_riyadh():
        raise HTTPException(status.HTTP_409_CONFLICT, "This request has already started.")
    r.status = "cancelled"
    _log(db, r, _uname(user, "ar"), "cancelled")
    db.commit()
    return _out(db, r, locale, detail=True)


# ───────────────────────── HR management ─────────────────────────


@router.get("/requests")
def list_requests(db: DbSession, user: Perm("hr", "view"), locale: str = Query("ar", pattern="^(ar|en)$"),
                  status_: Optional[str] = Query(None, alias="status"), kind: Optional[str] = None, user_id: Optional[int] = None):
    q = select(HrRequest)
    if status_:
        q = q.where(HrRequest.status == status_)
    if kind:
        q = q.where(HrRequest.kind == kind)
    if user_id:
        q = q.where(HrRequest.user_id == user_id)
    rows = db.scalars(q.order_by(HrRequest.id.desc()).limit(500)).all()
    return [_out(db, r, locale) for r in rows]


@router.post("/requests/{rid}/decision")
def decide(rid: int, payload: DecisionIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    r = _get(db, rid)
    if r.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This request is already {r.status}.")
    if r.user_id == user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't approve your own request.")
    if payload.approve and r.kind == "leave" and r.leave_type == ANNUAL:
        b = balance(db, r.user_id, r.start_date.year if r.start_date else None)
        if (r.days or 0) > b["remaining"] + (r.days or 0):  # pending already counted in remaining
            raise HTTPException(status.HTTP_409_CONFLICT, "Not enough annual leave balance.")
    r.status = "approved" if payload.approve else "rejected"
    r.decided_by_id, r.decided_at, r.decision_note = user.id, datetime.utcnow(), payload.note
    _log(db, r, _uname(user, "ar"), r.status, payload.note)
    db.commit()
    emp = db.get(User, r.user_id)
    cc = _cc(db) if r.kind in ("leave", "ticket") else []
    ok_ar, ok_en = ("تمت الموافقة على", "approved") if payload.approve else ("تم رفض", "rejected")
    note_ar = f"<p>ملاحظة: {escape(payload.note)}</p>" if payload.note else ""
    _send(emp.email if emp else None, cc,
          f"{ok_ar} {KIND_AR[r.kind]} {r.number} | {KIND_EN[r.kind]} {r.number} {ok_en}",
          f"<p>{ok_ar} {KIND_AR[r.kind]} لـ <strong>{escape(_uname(emp, 'ar'))}</strong> من قِبل {escape(_uname(user, 'ar'))}.</p><p>{escape(_summary(r, 'ar'))}</p>{note_ar}",
          f"<p>The {KIND_EN[r.kind].lower()} of <strong>{escape(_uname(emp, 'en'))}</strong> was {ok_en} by {escape(_uname(user, 'en'))}.</p><p>{escape(_summary(r, 'en'))}</p>"
          + (f"<p>Note: {escape(payload.note)}</p>" if payload.note else ""),
          f"{_base()}/ar/my-hr", "عرض طلباتي", "View my requests")
    return _out(db, r, locale, detail=True)


@router.post("/requests/{rid}/book")
def book_ticket(rid: int, payload: BookIn, db: DbSession, user: Perm("hr", "edit"), locale: str = Query("ar", pattern="^(ar|en)$")):
    r = _get(db, rid)
    if r.kind != "ticket" or r.status != "approved":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only approved ticket requests can be booked.")
    r.status, r.booking_ref, r.actual_cost = "booked", payload.booking_ref, payload.actual_cost
    _log(db, r, _uname(user, "ar"), "booked", f"{payload.booking_ref}" + (f" — {payload.note}" if payload.note else ""))
    db.commit()
    emp = db.get(User, r.user_id)
    _send(emp.email if emp else None, [], f"تم حجز تذكرتك {r.number} | Your ticket {r.number} is booked",
          f"<p>تم حجز تذكرة السفر: {escape(_summary(r, 'ar'))}</p><p>رقم الحجز: <strong>{escape(payload.booking_ref)}</strong></p>",
          f"<p>Your travel ticket is booked: {escape(_summary(r, 'en'))}</p><p>Booking reference: <strong>{escape(payload.booking_ref)}</strong></p>",
          f"{_base()}/ar/my-hr", "عرض طلباتي", "View my requests")
    return _out(db, r, locale, detail=True)


@router.get("/dashboard")
def dashboard(db: DbSession, user: Perm("hr", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    s = _settings(db)
    today = today_riyadh()
    n = now_riyadh()
    staff = _staff(db, working_only=True)
    profiles = {p.user_id: p for p in db.scalars(select(HrProfile)).all()}
    atts = {a.user_id: a for a in db.scalars(select(Attendance).where(Attendance.day == today)).all()}
    board = []
    for u in staff:
        st = _day_status(db, s, profiles.get(u.id), u.id, today, atts.get(u.id), n)
        board.append({"user_id": u.id, "name": _uname(u, locale), "department": profiles[u.id].department if u.id in profiles else None, **st})
    counts = {k: sum(1 for b in board if b["status"] == k) for k in ("present", "late", "absent", "on_leave", "not_yet", "weekend")}
    pending = db.scalars(select(HrRequest).where(HrRequest.status == "pending").order_by(HrRequest.id)).all()
    upcoming = db.scalars(select(HrRequest).where(HrRequest.kind == "leave", HrRequest.status == "approved",
                                                  HrRequest.start_date > today, HrRequest.start_date <= today + timedelta(days=30))
                          .order_by(HrRequest.start_date)).all()
    to_book = db.scalars(select(HrRequest).where(HrRequest.kind == "ticket", HrRequest.status == "approved")).all()
    first, _ = _month(None)
    month_rows = db.scalars(select(HrRequest).where(HrRequest.created_at >= datetime.combine(first, time(0)))).all()
    y0 = date(today.year, 1, 1)
    ticket_cost = sum(r.actual_cost or 0 for r in db.scalars(select(HrRequest).where(HrRequest.kind == "ticket", HrRequest.status == "booked",
                                                                                     HrRequest.start_date >= y0)).all())
    low = []
    for u in staff:
        b = balance(db, u.id)
        if b["remaining"] < 0 or (b["remaining"] >= 30):
            low.append({"user_id": u.id, "name": _uname(u, locale), "remaining": b["remaining"]})
    db.commit()
    return {
        "headcount": len(staff), "today": counts, "board": board,
        "pending": [_out(db, r, locale) for r in pending],
        "upcoming_leave": [_out(db, r, locale) for r in upcoming],
        "tickets_to_book": [_out(db, r, locale) for r in to_book],
        "month": {"requests": len(month_rows), "approved": sum(1 for r in month_rows if r.status in ("approved", "booked")),
                  "rejected": sum(1 for r in month_rows if r.status == "rejected")},
        "ticket_cost_year": round(ticket_cost, 2),
        "balance_flags": low,
        "approver": ", ".join(_uname(a, locale) for a in _approvers(db)) or None,
        "can_approve": has_permission(db, user, "hr", "approve"), "can_edit": has_permission(db, user, "hr", "edit"),
        "me_id": user.id,
    }


@router.get("/employees")
def employees(db: DbSession, user: Perm("hr", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    out = []
    for u in _staff(db):
        p = _profile(db, u.id)
        mgr = db.get(User, p.manager_user_id) if p.manager_user_id else None
        out.append({
            "user_id": u.id, "name": _uname(u, locale), "username": u.username, "email": u.email, "phone": u.phone, "role": u.role,
            "employee_no": p.employee_no, "department": p.department, "job_title": p.job_title or u.job_title,
            "manager_user_id": p.manager_user_id, "manager": _uname(mgr, locale) if mgr else None,
            "hire_date": p.hire_date.isoformat() if p.hire_date else None, "nationality": p.nationality,
            "contract_type": p.contract_type, "employment_status": p.employment_status,
            "annual_leave_days": p.annual_leave_days, "leave_adjustment": p.leave_adjustment,
            "ticket_entitlement": p.ticket_entitlement, "ticket_destination": p.ticket_destination, "ticket_class": p.ticket_class,
            "ticket_family_members": p.ticket_family_members,
            "work_start": p.work_start.strftime("%H:%M") if p.work_start else None, "work_end": p.work_end.strftime("%H:%M") if p.work_end else None,
            "emergency_contact": p.emergency_contact, "notes": p.notes, "balance": balance(db, u.id),
        })
    db.commit()
    return out


@router.put("/employees/{user_id}")
def update_employee(user_id: int, payload: ProfileIn, db: DbSession, user: Perm("hr", "edit")):
    u = db.get(User, user_id)
    if u is None or u.role in NON_STAFF:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    p = _profile(db, user_id)
    for k, v in payload.model_dump().items():
        setattr(p, k, v)
    if payload.job_title:
        u.job_title = payload.job_title
    db.commit()
    return {"ok": True}


@router.get("/attendance")
def attendance_day(db: DbSession, user: Perm("hr", "view"), day: Optional[date] = None, locale: str = Query("ar", pattern="^(ar|en)$")):
    s = _settings(db)
    d = day or today_riyadh()
    profiles = {p.user_id: p for p in db.scalars(select(HrProfile)).all()}
    atts = {a.user_id: a for a in db.scalars(select(Attendance).where(Attendance.day == d)).all()}
    n = now_riyadh()
    return [{"user_id": u.id, "name": _uname(u, locale), **_day_status(db, s, profiles.get(u.id), u.id, d, atts.get(u.id), n)} for u in _staff(db, working_only=True)]


@router.get("/attendance/report")
def attendance_report(db: DbSession, user: Perm("hr", "view"), month: Optional[str] = None, locale: str = Query("ar", pattern="^(ar|en)$")):
    s = _settings(db)
    first, last = _month(month)
    rows = []
    for u in _staff(db, working_only=True):
        days = _days_for(db, s, u.id, first, last)
        wd = [d for d in days if d["status"] not in ("weekend", "untracked")]
        perm = sum(r.minutes or 0 for r in db.scalars(select(HrRequest).where(
            HrRequest.user_id == u.id, HrRequest.kind == "permission", HrRequest.status == "approved",
            HrRequest.start_date >= first, HrRequest.start_date <= last)).all())
        worked = sum(d["worked_minutes"] or 0 for d in days)
        present = sum(1 for d in days if d["status"] in ("present", "late"))
        rows.append({
            "user_id": u.id, "name": _uname(u, locale), "working_days": len(wd), "present": present,
            "late": sum(1 for d in days if d["status"] == "late"), "late_minutes": sum(d["late_minutes"] for d in days),
            "absent": sum(1 for d in days if d["status"] == "absent"), "on_leave": sum(1 for d in days if d["status"] == "on_leave"),
            "early_leave_minutes": sum(d["early_leave_minutes"] for d in days), "permission_minutes": perm,
            "worked_hours": round(worked / 60, 1),
            "attendance_pct": round(present / max(1, len([d for d in wd if d["status"] not in ("on_leave", "not_yet")])) * 100, 1),
        })
    return {"month": first.strftime("%Y-%m"), "from": first.isoformat(), "to": last.isoformat(), "rows": rows}


@router.get("/attendance/{user_id}")
def attendance_user(user_id: int, db: DbSession, user: Perm("hr", "view"), month: Optional[str] = None):
    first, last = _month(month)
    return _days_for(db, _settings(db), user_id, first, last)


@router.put("/attendance")
def set_attendance(payload: AttendanceIn, db: DbSession, user: Perm("hr", "edit")):
    if payload.check_in and payload.check_out and payload.check_out < payload.check_in:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Check-out is before check-in.")
    att = db.scalar(select(Attendance).where(Attendance.user_id == payload.user_id, Attendance.day == payload.day))
    if att is None:
        att = Attendance(user_id=payload.user_id, day=payload.day)
        db.add(att)
    att.check_in, att.check_out, att.note = payload.check_in, payload.check_out, payload.note
    att.source, att.edited_by = "manual", _uname(user, "ar")
    db.commit()
    return {"ok": True}


@router.get("/settings")
def get_hr_settings(db: DbSession, user: Perm("hr", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    s = _settings(db)
    return {
        "approver_user_id": s.approver_user_id, "cc_emails": s.cc_emails or "", "default_cc": get_settings().payment_alerts_cc,
        "work_start": s.work_start.strftime("%H:%M"), "work_end": s.work_end.strftime("%H:%M"), "grace_minutes": s.grace_minutes,
        "weekend_days": sorted(_weekend(s)), "monthly_permission_minutes": s.monthly_permission_minutes,
        "attendance_from": s.attendance_from.isoformat(),
        "effective_approvers": [_uname(a, locale) for a in _approvers(db)],
        "users": [{"id": u.id, "name": _uname(u, locale), "role": u.role} for u in _staff(db)],
    }


@router.put("/settings")
def put_hr_settings(payload: SettingsIn, db: DbSession, user: Perm("hr", "approve")):
    s = _settings(db)
    if payload.approver_user_id and db.get(User, payload.approver_user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Approver not found")
    s.approver_user_id = payload.approver_user_id
    s.cc_emails = (payload.cc_emails or "").strip() or None
    s.work_start, s.work_end, s.grace_minutes = payload.work_start, payload.work_end, payload.grace_minutes
    s.weekend_days = ",".join(str(d) for d in sorted(set(payload.weekend_days)) if 0 <= d <= 6) or "4"
    s.monthly_permission_minutes = payload.monthly_permission_minutes
    if payload.attendance_from:
        s.attendance_from = payload.attendance_from
    db.commit()
    return {"ok": True}
