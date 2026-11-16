"""Payroll API (مسير الرواتب) — see api/payroll_models.py and api/services/payroll.py.

Salaries are visible to hr.approve only (HR manager, CEO/executive, admins), so every HR
endpoint here requires it. Employees see their own paid payslips and loans.
"""
from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import date, datetime
from html import escape
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.deps import CurrentUser, DbSession
from api.hr_models import HrProfile
from api.hr_people_models import HrCompany
from api.models import User
from api.payroll_models import EmployeeLoan, LoanRepayment, PayrollRun, PayrollSettings, Payslip
from api.permissions import Perm, has_permission
from api.routers.hr import _approvers, _base, _cc, _profile, _require_staff, _send, _staff, _uname, today_riyadh
from api.services import payroll as P

router = APIRouter(prefix="/hr/payroll", tags=["payroll"])
me_router = APIRouter(prefix="/hr/me", tags=["payroll"])

WARN = {
    "no_iban": ("لا يوجد آيبان", "No IBAN"), "bad_iban": ("آيبان غير صحيح", "Invalid IBAN"), "no_id": ("لا يوجد رقم هوية", "No ID number"),
    "negative_net": ("الصافي بالسالب", "Negative net pay"), "over_half": ("الاستقطاعات تتجاوز نصف الأجر (م93)", "Deductions exceed half the wage (art. 93)"),
    "loan_capped_10": ("قُسط القرض محدود بـ10% بلا موافقة الموظف (م92)", "Loan instalment capped at 10% without consent (art. 92)"),
    "partial_month": ("شهر جزئي", "Partial month"),
}


def _cname(c: Optional[HrCompany], locale: str) -> Optional[str]:
    if c is None:
        return None
    return c.name_ar if locale == "ar" else (c.name_en or c.name_ar)


def _j(txt, default):
    try:
        return json.loads(txt) if txt else default
    except ValueError:
        return default


def _line_out(l: Payslip, locale: str) -> dict:
    return {
        "id": l.id, "user_id": l.user_id, "name": l.name, "employee_no": l.employee_no, "job_title": l.job_title, "id_number": l.id_number,
        "iban": l.iban, "bank": l.bank, "bank_code": P.bank_code(l.iban), "saudi": l.saudi, "gosi_scheme": l.gosi_scheme,
        "basic": l.basic, "housing": l.housing, "transport": l.transport, "other_allowance": l.other_allowance, "other_allowance_label": l.other_allowance_label,
        "overtime_hours": l.overtime_hours, "overtime_amount": l.overtime_amount, "additions": l.additions,
        "payable_days": l.payable_days, "absent_days": l.absent_days, "unpaid_days": l.unpaid_days, "late_minutes": l.late_minutes,
        "proration_deduction": l.proration_deduction, "absence_deduction": l.absence_deduction, "unpaid_deduction": l.unpaid_deduction,
        "late_deduction": l.late_deduction, "gosi_base": l.gosi_base, "gosi_employee": l.gosi_employee, "gosi_employer": l.gosi_employer,
        "loan_deduction": l.loan_deduction, "loans": _j(l.loans, []), "other_deductions": l.other_deductions,
        "gross": l.gross, "total_deductions": l.total_deductions, "net": l.net, "adjustments": _j(l.adjustments, []),
        "overrides": _j(l.overrides, {}), "warnings": [{"code": w, "label": WARN.get(w, (w, w))[0 if locale == "ar" else 1]} for w in _j(l.warnings, [])],
        "excluded": l.excluded, "note": l.note,
    }


def _run_out(db: Session, r: PayrollRun, locale: str, lines: Optional[list[Payslip]] = None) -> dict:
    lines = lines if lines is not None else db.scalars(select(Payslip).where(Payslip.run_id == r.id)).all()
    c = db.get(HrCompany, r.company_id)
    return {
        "id": r.id, "company_id": r.company_id, "company": _cname(c, locale), "company_code": c.short_code if c else None, "company_color": c.color if c else None,
        "month": r.month, "status": r.status, "payment_date": r.payment_date.isoformat() if r.payment_date else None, "notes": r.notes,
        "created_by": r.created_by, "calculated_at": r.calculated_at.isoformat() if r.calculated_at else None,
        "submitted_by": r.submitted_by, "submitted_by_id": r.submitted_by_id, "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
        "approved_by": r.approved_by, "approved_at": r.approved_at.isoformat() if r.approved_at else None, "returned_note": r.returned_note,
        "paid_by": r.paid_by, "paid_at": r.paid_at.isoformat() if r.paid_at else None, "totals": P.totals(lines),
    }


def _run(db: Session, rid: int) -> PayrollRun:
    r = db.get(PayrollRun, rid)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payroll run not found")
    return r


def _need(r: PayrollRun, *states: str) -> None:
    if r.status not in states:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This payroll is {r.status}; that action isn't possible now.")


# ───────────────────────── settings ─────────────────────────


class SettingsIn(BaseModel):
    days_per_month: int = Field(default=30, ge=28, le=31)
    hours_per_day: int = Field(default=8, ge=1, le=12)
    deduct_absence: bool = True
    deduct_unpaid_leave: bool = True
    deduct_late: bool = False
    late_free_minutes: int = Field(default=60, ge=0, le=6000)
    overtime_premium: float = Field(default=0.5, ge=0, le=3)
    gosi_cap: float = Field(default=45000, ge=1000, le=1_000_000)
    gosi_old_employee: float = Field(default=9.75, ge=0, le=30)
    gosi_old_employer: float = Field(default=11.75, ge=0, le=30)
    gosi_hazards: float = Field(default=2.0, ge=0, le=10)
    gosi_saned: float = Field(default=0.75, ge=0, le=5)
    payment_day: int = Field(default=27, ge=1, le=31)


def _settings_out(ps: PayrollSettings) -> dict:
    t = today_riyadh().replace(day=1)
    return {**{k: getattr(ps, k) for k in SettingsIn.model_fields}, "updated_by": ps.updated_by,
            "gosi_new_annuities_now": P.new_law_annuities(t)}


@router.get("/settings")
def get_settings(db: DbSession, user: Perm("hr", "approve")):
    ps = P.settings(db)
    db.commit()
    return _settings_out(ps)


@router.put("/settings")
def put_settings(payload: SettingsIn, db: DbSession, user: Perm("hr", "approve")):
    ps = P.settings(db)
    for k, v in payload.model_dump().items():
        setattr(ps, k, v)
    ps.updated_by = _uname(user, "ar")
    db.commit()
    return _settings_out(ps)


# ───────────────────────── runs ─────────────────────────


@router.get("/runs")
def list_runs(db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    runs = db.scalars(select(PayrollRun).where(PayrollRun.status != "cancelled").order_by(PayrollRun.month.desc(), PayrollRun.company_id)).all()
    return [_run_out(db, r, locale) for r in runs]


class RunIn(BaseModel):
    company_id: int
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    notes: Optional[str] = Field(default=None, max_length=1000)


@router.post("/runs", status_code=201)
def create_run(payload: RunIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    if db.get(HrCompany, payload.company_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    t = today_riyadh()
    next_month = f"{t.year + (t.month // 12)}-{t.month % 12 + 1:02d}"
    if payload.month > next_month:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "You can prepare this month or next month at most.")
    if db.scalar(select(PayrollRun.id).where(PayrollRun.company_id == payload.company_id, PayrollRun.month == payload.month, PayrollRun.status != "cancelled")):
        raise HTTPException(status.HTTP_409_CONFLICT, "There is already a payroll for this company and month.")
    ps = P.settings(db)
    first, last = P.month_bounds(payload.month)
    r = PayrollRun(company_id=payload.company_id, month=payload.month, notes=payload.notes, created_by_id=user.id, created_by=_uname(user, "ar"),
                   payment_date=date(first.year, first.month, min(ps.payment_day, last.day)))
    db.add(r)
    db.flush()
    P.recalculate(db, r)
    db.commit()
    return _run_out(db, r, locale)


@router.get("/runs/{rid}")
def get_run(rid: int, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    r = _run(db, rid)
    lines = db.scalars(select(Payslip).where(Payslip.run_id == r.id).order_by(Payslip.name)).all()
    have = {l.user_id for l in lines}
    missing = [{"user_id": u.id, "name": _uname(u, locale)} for u in P.eligible_users(db, r) if u.id not in have]
    out = _run_out(db, r, locale, lines)
    out.update({
        "lines": [_line_out(l, locale) for l in lines], "missing": missing,
        "can": {"edit": r.status == "draft", "approve": r.status == "submitted" and r.submitted_by_id != user.id,
                "self_submitted": r.submitted_by_id == user.id},
    })
    return out


@router.post("/runs/{rid}/recalculate")
def recalc(rid: int, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    r = _run(db, rid)
    _need(r, "draft")
    P.recalculate(db, r)
    db.commit()
    return get_run(rid, db, user, locale)


class Adjustment(BaseModel):
    kind: Literal["addition", "deduction"]
    label: str = Field(min_length=2, max_length=80)
    amount: float = Field(gt=0, le=1_000_000)


class LineIn(BaseModel):
    overtime_hours: Optional[float] = Field(default=None, ge=0, le=200)
    absent_days: Optional[float] = Field(default=None, ge=0, le=31)
    unpaid_days: Optional[float] = Field(default=None, ge=0, le=31)
    late_minutes: Optional[int] = Field(default=None, ge=0, le=20000)
    skip_loans: bool = False
    reset: list[Literal["absent_days", "unpaid_days", "late_minutes", "overtime_hours"]] = Field(default_factory=list)
    adjustments: list[Adjustment] = Field(default_factory=list, max_length=20)
    excluded: bool = False
    note: Optional[str] = Field(default=None, max_length=300)


@router.put("/runs/{rid}/lines/{lid}")
def edit_line(rid: int, lid: int, payload: LineIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    r = _run(db, rid)
    _need(r, "draft")
    l = db.get(Payslip, lid)
    if l is None or l.run_id != r.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Line not found")
    ov = _j(l.overrides, {})
    for k in ("overtime_hours", "absent_days", "unpaid_days", "late_minutes"):
        v = getattr(payload, k)
        if v is not None:
            ov[k] = v
    for k in payload.reset:
        ov.pop(k, None)
    ov["skip_loans"] = payload.skip_loans
    l.overrides = json.dumps(ov)
    l.adjustments = json.dumps([a.model_dump() for a in payload.adjustments])
    l.excluded, l.note = payload.excluded, (payload.note or "").strip() or None
    u = db.get(User, l.user_id)
    if P.calculate(db, r, u, l) is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This employee no longer has a contract for the month. Recalculate the payroll.")
    db.commit()
    return _line_out(l, locale)


def _notify(db: Session, r: PayrollRun, to: list[User], cc: list[str], subj: tuple[str, str], body: tuple[str, str], label: tuple[str, str]) -> None:
    for a in to:
        _send(a.email, cc, f"{subj[0]} | {subj[1]}", f"<p>{body[0]}</p>", f"<p>{body[1]}</p>", f"{_base()}/ar/hr/payroll/{r.id}", label[0], label[1])


@router.post("/runs/{rid}/submit")
def submit(rid: int, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    r = _run(db, rid)
    _need(r, "draft")
    lines = db.scalars(select(Payslip).where(Payslip.run_id == r.id)).all()
    if not [l for l in lines if not l.excluded]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "There's nobody to pay in this payroll.")
    blocking = [l.name for l in lines if not l.excluded and set(_j(l.warnings, [])) & {"no_iban", "bad_iban", "negative_net"}]
    if blocking:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Fix these first (IBAN missing/invalid or negative pay): {', '.join(blocking[:6])}")
    r.status, r.submitted_by_id, r.submitted_by, r.submitted_at, r.returned_note = "submitted", user.id, _uname(user, "ar"), datetime.utcnow(), None
    db.commit()
    c = db.get(HrCompany, r.company_id)
    t = P.totals(lines)
    approvers = [a for a in _staff(db, working_only=True) if a.id != user.id and has_permission(db, a, "hr", "approve")]
    _notify(db, r, approvers, _cc(db), (f"مسير رواتب {r.month} بانتظار اعتمادك", f"Payroll {r.month} awaiting your approval"),
            (f"رفع {escape(_uname(user, 'ar'))} مسير رواتب {escape(_cname(c, 'ar') or '')} لشهر {r.month}: {t['employees']} موظفًا، صافي {t['net']:,.2f} ر.س.",
             f"{escape(_uname(user, 'en'))} submitted the {escape(_cname(c, 'en') or '')} payroll for {r.month}: {t['employees']} employees, net SAR {t['net']:,.2f}."),
            ("مراجعة المسير", "Review payroll"))
    return _run_out(db, r, locale, lines)


@router.post("/runs/{rid}/approve")
def approve(rid: int, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    r = _run(db, rid)
    _need(r, "submitted")
    if r.submitted_by_id == user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Someone other than the person who submitted this payroll must approve it.")
    r.status, r.approved_by_id, r.approved_by, r.approved_at = "approved", user.id, _uname(user, "ar"), datetime.utcnow()
    db.commit()
    sub = db.get(User, r.submitted_by_id) if r.submitted_by_id else None
    if sub:
        _notify(db, r, [sub], [], (f"اعتُمد مسير رواتب {r.month}", f"Payroll {r.month} approved"),
                (f"اعتمد {escape(_uname(user, 'ar'))} المسير. نزّل ملف حماية الأجور وارفعه في مدد، ثم سجّل الصرف.",
                 f"{escape(_uname(user, 'en'))} approved it. Download the WPS file, upload it to Mudad, then mark it paid."), ("فتح المسير", "Open payroll"))
    return _run_out(db, r, locale)


class ReturnIn(BaseModel):
    note: str = Field(min_length=3, max_length=500)


@router.post("/runs/{rid}/return")
def send_back(rid: int, payload: ReturnIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    r = _run(db, rid)
    _need(r, "submitted", "approved")
    r.status, r.returned_note, r.approved_by_id, r.approved_by, r.approved_at = "draft", payload.note.strip(), None, None, None
    db.commit()
    sub = db.get(User, r.submitted_by_id) if r.submitted_by_id else None
    if sub and sub.id != user.id:
        _notify(db, r, [sub], [], (f"أُعيد مسير رواتب {r.month} للتعديل", f"Payroll {r.month} sent back"),
                (escape(payload.note), escape(payload.note)), ("فتح المسير", "Open payroll"))
    return _run_out(db, r, locale)


class PaidIn(BaseModel):
    payment_date: date


@router.post("/runs/{rid}/paid")
def mark_paid(rid: int, payload: PaidIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    r = _run(db, rid)
    _need(r, "approved")
    lines = db.scalars(select(Payslip).where(Payslip.run_id == r.id)).all()
    r.status, r.payment_date, r.paid_by, r.paid_at = "paid", payload.payment_date, _uname(user, "ar"), datetime.utcnow()
    for l in lines:
        if l.excluded:
            continue
        for t in _j(l.loans, []):
            if t.get("amount"):
                db.add(LoanRepayment(loan_id=t["loan_id"], run_id=r.id, month=r.month, amount=t["amount"], note=f"payroll {r.month}"))
    db.flush()
    for ln in db.scalars(select(EmployeeLoan).where(EmployeeLoan.status == "approved")).all():
        if P.repaid(db, ln.id) >= ln.amount - 0.005:
            ln.status = "settled"
    db.commit()
    for l in lines:
        if l.excluded:
            continue
        emp = db.get(User, l.user_id)
        if emp:
            _send(emp.email, [], f"قسيمة راتب {r.month} | Payslip {r.month}",
                  f"<p>صُرف راتب شهر {r.month}. قسيمة الراتب متاحة في خدماتي الوظيفية.</p>",
                  f"<p>Your salary for {r.month} has been paid. Your payslip is in My HR.</p>",
                  f"{_base()}/ar/my-hr/payslips/{l.id}", "عرض القسيمة", "View payslip")
    return _run_out(db, r, locale, lines)


@router.post("/runs/{rid}/cancel")
def cancel(rid: int, db: DbSession, user: Perm("hr", "approve")):
    r = _run(db, rid)
    _need(r, "draft", "submitted")
    r.status, r.active_key = "cancelled", r.id + 1  # frees the company/month slot
    db.commit()
    return {"ok": True}


# ───────────────────────── exports ─────────────────────────


@router.get("/runs/{rid}/wps.csv")
def wps_file(rid: int, db: DbSession, user: Perm("hr", "approve")):
    """Salary file for Mudad / the bank. Compare with the template Mudad gives you before uploading."""
    r = _run(db, rid)
    if r.status not in ("approved", "paid"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Approve the payroll before exporting the WPS file.")
    lines = [l for l in db.scalars(select(Payslip).where(Payslip.run_id == r.id).order_by(Payslip.name)).all() if not l.excluded]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["EmployeeID", "EmployeeName", "BankCode", "IBAN", "BasicSalary", "HousingAllowance", "OtherAllowances", "Deductions", "NetSalary", "PaymentDate"])
    for l in lines:
        other = P.r2(l.transport + l.other_allowance + l.overtime_amount + l.additions)
        ded = P.r2(l.basic + l.housing + other - l.net)
        w.writerow([l.id_number or "", l.name or "", P.bank_code(l.iban) or "", l.iban or "", f"{l.basic:.2f}", f"{l.housing:.2f}", f"{other:.2f}", f"{ded:.2f}", f"{l.net:.2f}",
                    (r.payment_date or today_riyadh()).isoformat()])
    c = db.get(HrCompany, r.company_id)
    name = f"WPS-{(c.short_code if c else 'CO')}-{r.month}.csv"
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/runs/{rid}/register.xlsx")
def register(rid: int, db: DbSession, user: Perm("hr", "approve")):
    """Payroll register as a Muktasabat-branded Excel file."""
    from api.services.branded_xlsx import details_line, table_workbook, xlsx_response

    r = _run(db, rid)
    c = db.get(HrCompany, r.company_id)
    lines = db.scalars(select(Payslip).where(Payslip.run_id == r.id).order_by(Payslip.name)).all()
    head = ["الموظف", "الرقم الوظيفي", "الهوية", "الآيبان", "الأساسي", "السكن", "النقل", "بدلات أخرى", "ساعات إضافية", "أجر إضافي", "إضافات",
            "الإجمالي", "أيام مستحقة", "غياب (يوم)", "خصم أيام خارج العقد", "خصم غياب", "خصم إجازة بدون راتب", "خصم تأخير", "التأمينات (موظف)",
            "قسط سلفة/قرض", "خصومات أخرى", "إجمالي الخصومات", "الصافي", "التأمينات (صاحب العمل)", "ملاحظات"]
    rows = [[l.name, l.employee_no, l.id_number, l.iban, l.basic, l.housing, l.transport, l.other_allowance, l.overtime_hours, l.overtime_amount,
             l.additions, l.gross, l.payable_days, l.absent_days, l.proration_deduction, l.absence_deduction, l.unpaid_deduction, l.late_deduction,
             l.gosi_employee, l.loan_deduction, l.other_deductions, l.total_deductions, l.net, l.gosi_employer,
             " ; ".join(f"{a['label']}: {a['amount']}" for a in _j(l.adjustments, []))]
            for l in lines if not l.excluded]
    data = table_workbook(
        f"مسير رواتب {c.name_ar if c else ''} — {r.month}", head, rows, "ar",
        details=details_line("ar", extra=[f"الحالة: {r.status}", f"أعدّه: {r.created_by or '—'}", f"رفعه: {r.submitted_by or '—'}", f"اعتمده: {r.approved_by or '—'}"]),
        sheet=r.month, sum_cols=[5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
    )
    return xlsx_response(data, f"Payroll-{(c.short_code if c else 'CO')}-{r.month}")


# ───────────────────────── payslips ─────────────────────────


@router.get("/payslips/{pid}")
def payslip(pid: int, db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    """An employee's own payslip once paid; HR approvers any time."""
    l = db.get(Payslip, pid)
    if l is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payslip not found")
    r = db.get(PayrollRun, l.run_id)
    hr = has_permission(db, user, "hr", "approve")
    if not hr and not (l.user_id == user.id and r and r.status == "paid" and not l.excluded):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payslip not found")
    c = db.get(HrCompany, r.company_id) if r else None
    out = _line_out(l, locale)
    if not hr:
        out.pop("overrides", None)
        out["warnings"] = []
    out.update({"month": r.month if r else None, "status": r.status if r else None, "payment_date": r.payment_date.isoformat() if r and r.payment_date else None,
                "run_id": r.id if r else None,
                "company": {"name_ar": c.name_ar, "name_en": c.name_en, "cr": c.cr_number, "color": c.color, "logo_url": c.logo_url,
                            "is_holding": c.is_holding, "code": c.short_code} if c else None, "is_self": l.user_id == user.id})
    return out


@me_router.get("/payslips")
def my_payslips(db: DbSession, user: CurrentUser):
    _require_staff(user)
    rows = db.execute(select(Payslip, PayrollRun).join(PayrollRun, PayrollRun.id == Payslip.run_id).where(
        Payslip.user_id == user.id, PayrollRun.status == "paid", Payslip.excluded.is_(False)).order_by(PayrollRun.month.desc())).all()
    return [{"id": l.id, "month": r.month, "net": l.net, "gross": l.gross, "deductions": l.total_deductions,
             "payment_date": r.payment_date.isoformat() if r.payment_date else None} for l, r in rows]


# ───────────────────────── loans & advances ─────────────────────────


def _loan_out(db: Session, ln: EmployeeLoan, locale: str) -> dict:
    paid = P.repaid(db, ln.id)
    u = db.get(User, ln.user_id)
    return {
        "id": ln.id, "number": ln.number, "user_id": ln.user_id, "employee": _uname(u, locale), "kind": ln.kind, "amount": ln.amount,
        "installments": ln.installments, "monthly_amount": ln.monthly_amount, "start_month": ln.start_month, "status": ln.status,
        "reason": ln.reason, "consent": ln.consent, "requested_by_self": ln.requested_by_self, "created_by": ln.created_by,
        "decided_by": ln.decided_by, "decided_at": ln.decided_at.isoformat() if ln.decided_at else None, "decision_note": ln.decision_note,
        "repaid": P.r2(paid), "remaining": P.r2(max(0, ln.amount - paid)), "created_at": ln.created_at.isoformat(),
        "repayments": [{"month": x.month, "amount": x.amount, "note": x.note} for x in db.scalars(select(LoanRepayment).where(LoanRepayment.loan_id == ln.id).order_by(LoanRepayment.id)).all()],
    }


class LoanIn(BaseModel):
    kind: Literal["advance", "loan"] = "advance"
    amount: float = Field(gt=0, le=1_000_000)
    installments: int = Field(default=1, ge=1, le=60)
    start_month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    reason: Optional[str] = Field(default=None, max_length=500)
    consent: bool = False


class HrLoanIn(LoanIn):
    user_id: int


def _make_loan(db: Session, user_id: int, p: LoanIn, by: User, self_: bool) -> EmployeeLoan:
    if p.kind == "advance" and p.installments > 3:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A salary advance is repaid in at most 3 months; use a loan for longer terms.")
    if self_ and db.scalar(select(EmployeeLoan.id).where(EmployeeLoan.user_id == user_id, EmployeeLoan.status == "pending")):
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have a request waiting for a decision.")
    ln = EmployeeLoan(number=f"tmp-{uuid.uuid4().hex[:8]}", user_id=user_id, kind=p.kind, amount=P.r2(p.amount), installments=p.installments,
                      monthly_amount=P.r2(p.amount / p.installments), start_month=p.start_month, reason=(p.reason or "").strip() or None,
                      consent=p.consent, requested_by_self=self_, created_by=_uname(by, "ar"))
    db.add(ln)
    db.flush()
    ln.number = f"LN-{ln.id:04d}"
    return ln


@router.get("/loans")
def list_loans(db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    return [_loan_out(db, x, locale) for x in db.scalars(select(EmployeeLoan).order_by(EmployeeLoan.id.desc())).all()]


@router.post("/loans", status_code=201)
def hr_create_loan(payload: HrLoanIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    if payload.user_id not in {u.id for u in _staff(db, working_only=False)}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    ln = _make_loan(db, payload.user_id, payload, user, False)
    ln.status, ln.decided_by, ln.decided_at, ln.disbursed_on = "approved", _uname(user, "ar"), datetime.utcnow(), today_riyadh()
    db.commit()
    return _loan_out(db, ln, locale)


class DecideIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=300)
    start_month: Optional[str] = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


@router.post("/loans/{lid}/decide")
def decide_loan(lid: int, payload: DecideIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    ln = db.get(EmployeeLoan, lid)
    if ln is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if ln.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This request was already decided.")
    if ln.user_id == user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't decide your own request.")
    if not payload.approve and not (payload.note or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Give a reason for declining.")
    ln.status = "approved" if payload.approve else "rejected"
    ln.decided_by, ln.decided_at, ln.decision_note = _uname(user, "ar"), datetime.utcnow(), (payload.note or "").strip() or None
    if payload.approve:
        ln.disbursed_on = today_riyadh()
        if payload.start_month:
            ln.start_month = payload.start_month
    db.commit()
    emp = db.get(User, ln.user_id)
    if emp:
        ok = payload.approve
        _send(emp.email, [], f"{'اعتُمد' if ok else 'رُفض'} طلب {'السلفة' if ln.kind == 'advance' else 'القرض'} {ln.number} | Your {ln.kind} request {ln.number} was {'approved' if ok else 'declined'}",
              f"<p>{'اعتُمد طلبك، ويُخصم القسط من الراتب بدءًا من ' + ln.start_month if ok else 'لم يُعتمد طلبك: ' + escape(ln.decision_note or '')}.</p>",
              f"<p>{'Approved. Instalments are deducted from your salary from ' + ln.start_month if ok else 'Declined: ' + escape(ln.decision_note or '')}.</p>",
              f"{_base()}/ar/my-hr/payslips", "خدماتي", "My HR")
    return _loan_out(db, ln, locale)


@router.post("/loans/{lid}/cancel")
def cancel_loan(lid: int, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    ln = db.get(EmployeeLoan, lid)
    if ln is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan not found")
    if ln.status not in ("pending", "approved"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This loan is already closed.")
    ln.status = "cancelled"
    ln.decision_note = (ln.decision_note or "") + f" · cancelled by {_uname(user, 'en')}"
    db.commit()
    return _loan_out(db, ln, locale)


@me_router.get("/loans")
def my_loans(db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    _require_staff(user)
    return [_loan_out(db, x, locale) for x in db.scalars(select(EmployeeLoan).where(EmployeeLoan.user_id == user.id).order_by(EmployeeLoan.id.desc())).all()]


@me_router.post("/loans", status_code=201)
def request_loan(payload: LoanIn, db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    _require_staff(user)
    if not payload.consent:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Confirm that the instalments may be deducted from your salary.")
    if payload.start_month < today_riyadh().strftime("%Y-%m"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Repayment can't start in a past month.")
    ln = _make_loan(db, user.id, payload, user, True)
    db.commit()
    for a in _approvers(db, exclude_user_id=user.id):
        _send(a.email, [], f"طلب {'سلفة' if ln.kind == 'advance' else 'قرض'} {ln.number} | {ln.kind.title()} request {ln.number}",
              f"<p>طلب {escape(_uname(user, 'ar'))} {'سلفة' if ln.kind == 'advance' else 'قرضًا'} بمبلغ {ln.amount:,.2f} ر.س على {ln.installments} قسط.</p>",
              f"<p>{escape(_uname(user, 'en'))} requested a {ln.kind} of SAR {ln.amount:,.2f} over {ln.installments} instalment(s).</p>",
              f"{_base()}/ar/hr?tab=payroll", "مراجعة الطلب", "Review request")
    return _loan_out(db, ln, locale)
