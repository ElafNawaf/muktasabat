"""Payroll calculation (Saudi rules, configurable in PayrollSettings).

Per employee and month:
  earnings   = basic + housing + transport + other (contract) + overtime + additions
  overtime   = hours × (hourly wage + 50% of hourly basic)            — Labour Law art. 107
  daily wage = monthly wage / 30
  deductions = days outside the contract (joined / left mid-month) + absence + unpaid leave
               + lateness (optional) + GOSI employee share + loan instalment + HR deductions
  GOSI base  = basic + housing, capped at 45,000, prorated for partial months
    Saudi, existing scheme : 9.75% employee / 11.75% employer
    Saudi, new law (first-time entrants from 3 Jul 2024): annuities 9% rising 0.5 pt every
      1 July to 11% (+0.75% SANED each side, +2% hazards employer)
    Non-Saudi              : 2% employer (occupational hazards) only
  Loan instalments are capped at 10% of the wage unless the employee consented (art. 92);
  legal deductions above half the wage due are flagged (art. 93).
"""
from __future__ import annotations

import calendar
import json
import re
from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.hr_models import HrProfile
from api.hr_people_models import HrContract, HrPersonal
from api.models import User
from api.payroll_models import EmployeeLoan, LoanRepayment, PayrollRun, PayrollSettings, Payslip

SAUDI = re.compile(r"(سعود|saudi|^ksa$|^sa$)", re.I)
IBAN = re.compile(r"^SA\d{22}$")
# Saudi IBAN: SA kk BB … — BB is the bank code.
BANK_CODES = {
    "10": ("SNB", "البنك الأهلي السعودي"), "15": ("ALBI", "بنك البلاد"), "20": ("RIBL", "بنك الرياض"), "30": ("ARNB", "البنك العربي الوطني"),
    "45": ("SABB", "البنك السعودي الأول"), "55": ("BSFR", "البنك السعودي الفرنسي"), "60": ("BJAZ", "بنك الجزيرة"),
    "65": ("SIBC", "البنك السعودي للاستثمار"), "80": ("RJHI", "مصرف الراجحي"), "05": ("INMA", "مصرف الإنماء"),
    "90": ("GULF", "بنك الخليج الدولي"), "95": ("EMIR", "بنك الإمارات دبي الوطني"), "36": ("DEUT", "دويتشه بنك"),
}


def r2(x: float) -> float:
    return round((x or 0) + 1e-9, 2)


def settings(db: Session) -> PayrollSettings:
    ps = db.get(PayrollSettings, 1)
    if ps is None:
        ps = PayrollSettings(id=1)
        db.add(ps)
        db.flush()
    return ps


def month_bounds(month: str) -> tuple[date, date]:
    y, m = (int(x) for x in month.split("-"))
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def iban_ok(v: Optional[str]) -> bool:
    if not v:
        return False
    v = re.sub(r"\s+", "", v).upper()
    if not IBAN.fullmatch(v):
        return False
    return int("".join(str(int(ch, 36)) for ch in (v[4:] + v[:4]))) % 97 == 1


def bank_code(iban: Optional[str]) -> Optional[str]:
    if not iban or len(iban) < 6:
        return None
    hit = BANK_CODES.get(iban[4:6])
    return hit[0] if hit else None


def is_saudi(prof: Optional[HrProfile], per: Optional[HrPersonal]) -> bool:
    if prof and prof.nationality and SAUDI.search(prof.nationality.strip()):
        return True
    if per and per.id_type == "national_id":
        return True
    return bool(per and per.id_number and per.id_number.startswith("1") and not (prof and prof.nationality))


def scheme_for(prof: Optional[HrProfile], per: Optional[HrPersonal]) -> str:
    chosen = (prof.gosi_scheme if prof else None) or "auto"
    if chosen in ("old", "new", "expat", "none"):
        return chosen
    return "old" if is_saudi(prof, per) else "expat"


def new_law_annuities(first: date) -> float:
    """9% from Jul 2024, +0.5 pt each 1 July, up to 11%."""
    steps = (first.year - 2024) - (1 if first.month < 7 else 0)
    return min(11.0, 9.0 + 0.5 * max(0, steps))


def gosi_rates(ps: PayrollSettings, scheme: str, first: date) -> tuple[float, float]:
    """(employee %, employer %)"""
    if scheme == "old":
        return ps.gosi_old_employee, ps.gosi_old_employer
    if scheme == "new":
        a = new_law_annuities(first)
        return a + ps.gosi_saned, a + ps.gosi_saned + ps.gosi_hazards
    if scheme == "expat":
        return 0.0, ps.gosi_hazards
    return 0.0, 0.0


def contract_for(db: Session, user_id: int, first: date, last: date) -> Optional[HrContract]:
    """The accepted contract covering (part of) the month — the latest one starting by month end."""
    rows = db.scalars(select(HrContract).where(
        HrContract.user_id == user_id, HrContract.status.in_(("accepted", "terminated")), HrContract.start_date <= last,
    ).order_by(HrContract.start_date.desc())).all()
    for c in rows:
        end = c.terminated_at or c.end_date
        if end is None or end >= first:
            return c
    return None


def repaid(db: Session, loan_id: int) -> float:
    return float(db.scalar(select(func.coalesce(func.sum(LoanRepayment.amount), 0)).where(LoanRepayment.loan_id == loan_id)) or 0)


def _j(txt: Optional[str], default):
    try:
        return json.loads(txt) if txt else default
    except ValueError:
        return default


def calculate(db: Session, run: PayrollRun, u: User, line: Optional[Payslip] = None) -> Optional[Payslip]:
    """(Re)compute one employee's line. Returns None when there is no contract for the month."""
    from api.routers import hr

    ps = settings(db)
    hs = hr._settings(db)
    first, last = month_bounds(run.month)
    c = contract_for(db, u.id, first, last)
    if c is None:
        return None
    prof = db.scalar(select(HrProfile).where(HrProfile.user_id == u.id))
    per = db.scalar(select(HrPersonal).where(HrPersonal.user_id == u.id))
    if line is None:
        line = Payslip(run_id=run.id, user_id=u.id)
        db.add(line)
    ov = _j(line.overrides, {})
    adj = _j(line.adjustments, [])
    dpm, hpd = ps.days_per_month, ps.hours_per_day

    line.contract_id = c.id
    line.name = hr._uname(u, "ar")
    line.employee_no = prof.employee_no if prof else None
    line.job_title = c.job_title or (prof.job_title if prof else None)
    line.id_number = per.id_number if per else None
    line.iban = (per.iban or "").replace(" ", "").upper() if per and per.iban else None
    line.bank = per.bank_name if per else None
    line.saudi = is_saudi(prof, per)
    line.gosi_scheme = scheme_for(prof, per)
    line.basic, line.housing = c.basic_salary or 0, c.housing_allowance or 0
    line.transport, line.other_allowance, line.other_allowance_label = c.transport_allowance or 0, c.other_allowance or 0, c.other_allowance_label
    full = line.basic + line.housing + line.transport + line.other_allowance
    daily, daily_basic = full / dpm, line.basic / dpm

    # days outside the contract this month (joined late / left early), on a 30-day month
    start = max(first, c.start_date)
    end = min(last, c.terminated_at or c.end_date or last)
    if end < start:
        line.payable_days = 0
    elif start == first and end == last:
        line.payable_days = dpm  # a full month is always 30 days' pay, whatever the calendar length
    else:
        line.payable_days = min(dpm, (end - start).days + 1)  # joined / left mid-month: days actually under contract
    line.proration_deduction = r2(daily * (dpm - line.payable_days))

    # attendance inside the contract window (up to today for the current month)
    absent = unpaid = late = 0
    today = hr.today_riyadh()
    if start <= min(end, today):
        _row, days = hr.employee_month(db, hs, u, start, min(end, today))
        absent = sum(1 for d in days if d["status"] == "absent")
        unpaid = sum(1 for d in days if d["status"] == "on_leave" and d.get("leave_type") == "unpaid")
        late = sum(d.get("late_minutes") or 0 for d in days)
    line.absent_days = float(ov.get("absent_days", absent))
    line.unpaid_days = float(ov.get("unpaid_days", unpaid))
    line.late_minutes = int(ov.get("late_minutes", late))
    line.overtime_hours = float(ov.get("overtime_hours", 0))

    line.absence_deduction = r2(daily * line.absent_days) if ps.deduct_absence else 0
    line.unpaid_deduction = r2(daily * line.unpaid_days) if ps.deduct_unpaid_leave else 0
    chargeable = max(0, line.late_minutes - ps.late_free_minutes)
    line.late_deduction = r2(daily / hpd / 60 * chargeable) if ps.deduct_late else 0
    line.overtime_amount = r2(line.overtime_hours * (full / dpm / hpd + ps.overtime_premium * daily_basic / hpd))
    line.additions = r2(sum(float(a.get("amount") or 0) for a in adj if a.get("kind") == "addition"))
    line.other_deductions = r2(sum(float(a.get("amount") or 0) for a in adj if a.get("kind") == "deduction"))

    # GOSI
    emp_pct, er_pct = gosi_rates(ps, line.gosi_scheme, first)
    line.gosi_base = r2(min(line.basic + line.housing, ps.gosi_cap) * line.payable_days / dpm)
    line.gosi_employee = r2(line.gosi_base * emp_pct / 100)
    line.gosi_employer = r2(line.gosi_base * er_pct / 100)

    # loans
    warnings: list[str] = []
    taken = []
    total_loan = 0.0
    for ln in db.scalars(select(EmployeeLoan).where(EmployeeLoan.user_id == u.id, EmployeeLoan.status == "approved", EmployeeLoan.start_month <= run.month)).all():
        remaining = r2(ln.amount - repaid(db, ln.id))
        if remaining <= 0:
            continue
        inst = min(ln.monthly_amount, remaining)
        if not ln.consent and inst > full * 0.10:
            inst = r2(full * 0.10)
            warnings.append("loan_capped_10")
        if "skip_loans" in ov and ov["skip_loans"]:
            continue
        taken.append({"loan_id": ln.id, "number": ln.number, "amount": r2(inst), "remaining": remaining})
        total_loan += inst
    line.loans = json.dumps(taken)
    line.loan_deduction = r2(total_loan)

    line.gross = r2(full + line.overtime_amount + line.additions)
    line.total_deductions = r2(line.proration_deduction + line.absence_deduction + line.unpaid_deduction + line.late_deduction
                               + line.gosi_employee + line.loan_deduction + line.other_deductions)
    line.net = r2(line.gross - line.total_deductions)

    wage_due = line.gross - line.proration_deduction - line.absence_deduction - line.unpaid_deduction
    legal = line.late_deduction + line.gosi_employee + line.loan_deduction + line.other_deductions
    if wage_due > 0 and legal > wage_due / 2:
        warnings.append("over_half")
    if not line.iban:
        warnings.append("no_iban")
    elif not iban_ok(line.iban):
        warnings.append("bad_iban")
    if not line.id_number:
        warnings.append("no_id")
    if line.net < 0:
        warnings.append("negative_net")
    if line.payable_days < dpm:
        warnings.append("partial_month")
    line.warnings = json.dumps(warnings)
    return line


def eligible_users(db: Session, run: PayrollRun) -> list[User]:
    from api.routers import hr

    ids = {p.user_id for p in db.scalars(select(HrProfile).where(HrProfile.company_id == run.company_id)).all()}
    return [u for u in hr._staff(db, working_only=False) if u.id in ids]


def recalculate(db: Session, run: PayrollRun) -> list[dict]:
    """Rebuild all lines of a draft run. Returns employees without a contract for the month."""
    from datetime import datetime

    existing = {l.user_id: l for l in db.scalars(select(Payslip).where(Payslip.run_id == run.id)).all()}
    first, last = month_bounds(run.month)
    missing = []
    seen = set()
    for u in eligible_users(db, run):
        line = calculate(db, run, u, existing.get(u.id))
        if line is None:
            missing.append(u.id)
            continue
        seen.add(u.id)
    for uid, l in existing.items():
        if uid not in seen:
            db.delete(l)
    run.calculated_at = datetime.utcnow()
    db.flush()
    return missing


def totals(lines: list[Payslip]) -> dict:
    inc = [l for l in lines if not l.excluded]
    s = lambda f: r2(sum(getattr(l, f) for l in inc))  # noqa: E731
    return {
        "employees": len(inc), "excluded": len(lines) - len(inc), "basic": s("basic"), "allowances": r2(s("housing") + s("transport") + s("other_allowance")),
        "overtime": s("overtime_amount"), "additions": s("additions"), "gross": s("gross"), "deductions": s("total_deductions"),
        "gosi_employee": s("gosi_employee"), "gosi_employer": s("gosi_employer"), "loans": s("loan_deduction"), "net": s("net"),
        "cost": r2(s("net") + s("gosi_employee") + s("gosi_employer") + s("loan_deduction")),
        "warnings": sum(1 for l in inc if [w for w in _j(l.warnings, []) if w not in ("partial_month",)]),
    }
