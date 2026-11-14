"""Insight dashboards beyond the portfolio view (لوحات المؤشرات).

Each function returns one JSON-ready dict for one dashboard page:

* finance     — the company's own P&L: rent handled (gross, mostly owners'
                money) vs the company's revenue (management fees), costs,
                payroll, net profit, margin, owner payables, receipt coverage.
* operations  — maintenance work orders, lease renewals, support desk.
* people      — headcount, attendance, leave, contracts, expiries, assets, payroll.
* growth      — website leads, listings and job applications.

Everything is computed from stored rows (the data set is small — hundreds to a
few thousand rows), so rows are loaded once and aggregated in Python.
Money is SAR. Collections are cash basis (paid_date).
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from statistics import mean, median
from typing import Iterable, Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.models import Building, Contract, Expense, Owner, Payment, SupportTicket, Unit, User


def _months(n: int, today: Optional[date] = None) -> list[str]:
    today = today or date.today()
    first = today.replace(day=1)
    return [(first - relativedelta(months=i)).strftime("%Y-%m") for i in range(n - 1, -1, -1)]


def _mk(d) -> Optional[str]:
    if d is None:
        return None
    return d.strftime("%Y-%m")


def _name(obj, locale: str) -> str:
    if obj is None:
        return "—"
    for f in (f"name_{locale}", "name", "name_en", "name_ar", "full_name", "username"):
        v = getattr(obj, f, None)
        if v:
            return str(v)
    return f"#{obj.id}"


def _r(x: float, n: int = 2) -> float:
    return round(float(x or 0), n)


def _pct(a: float, b: float) -> Optional[float]:
    return round(100 * a / b, 1) if b else None


def _hours(a: Optional[datetime], b: Optional[datetime]) -> Optional[float]:
    if not a or not b:
        return None
    return max(0.0, (b - a).total_seconds() / 3600)


def _avg(xs: Iterable[Optional[float]]) -> Optional[float]:
    v = [x for x in xs if x is not None]
    return round(mean(v), 1) if v else None


# ══════════════════════════════════════════════════════════════════════════════
# Finance
# ══════════════════════════════════════════════════════════════════════════════


def _payment_parts(p: Payment) -> dict:
    """Split one paid instalment into where the money belongs.

    Uses the stored PaymentSplit rows when they exist (written when the payment
    is confirmed); falls back to the same formula for imported history."""
    parts = {"owner_share": 0.0, "management_fee": 0.0, "agent_fee": 0.0, "ejar_fee": 0.0}
    if p.splits:
        for s in p.splits:
            if s.split_type in parts:
                parts[s.split_type] += float(s.amount or 0)
        return parts
    try:
        from api.services.payment_alerts import compute_split

        sp = compute_split(p)
        return {"owner_share": sp.owner_share, "management_fee": sp.management_fee,
                "agent_fee": sp.agent_fee, "ejar_fee": sp.ejar_fee}
    except Exception:  # missing unit / contract — treat the whole amount as the owner's
        parts["owner_share"] = float(p.amount or 0)
        return parts


def _payroll_by_month(db: Session, months: list[str]) -> dict[str, float]:
    """Monthly gross salary cost from accepted employment contracts."""
    from api.hr_people_models import HrContract

    out = {m: 0.0 for m in months}
    for c in db.scalars(select(HrContract).where(HrContract.status.in_(["accepted", "terminated"]))).all():
        monthly = sum(float(x or 0) for x in (c.basic_salary, c.housing_allowance, c.transport_allowance, c.other_allowance))
        if not monthly:
            continue
        end = c.terminated_at or c.end_date
        for m in months:
            y, mm = map(int, m.split("-"))
            first = date(y, mm, 1)
            last = first + relativedelta(months=1) - timedelta(days=1)
            if c.start_date <= last and (end is None or end >= first):
                out[m] += monthly
    return {k: _r(v) for k, v in out.items()}


def finance(db: Session, locale: str = "ar", months: int = 12, include_payroll: bool = True) -> dict:
    today = date.today()
    keys = _months(months, today)
    since = date(*map(int, keys[0].split("-")), 1)
    year_start = today.replace(month=1, day=1)

    buildings = {b.id: b for b in db.scalars(select(Building)).all()}
    units = {u.id: u for u in db.scalars(select(Unit)).all()}
    owners = {o.id: o for o in db.scalars(select(Owner)).all()}
    contracts = {c.id: c for c in db.scalars(select(Contract)).all()}
    paid = [p for p in db.scalars(select(Payment).where(Payment.status == "paid")).all() if p.paid_date]
    expenses = db.scalars(select(Expense)).all()

    def bld(p: Payment):
        c = contracts.get(p.contract_id)
        u = units.get(c.unit_id) if c else None
        return buildings.get(u.building_id) if u else None

    series = {m: {"month": m, "gross": 0.0, "revenue": 0.0, "owner_share": 0.0, "pass_through": 0.0,
                  "company_costs": 0.0, "owner_costs": 0.0, "payroll": 0.0, "net_profit": 0.0} for m in keys}
    by_building: dict[int, dict] = defaultdict(lambda: {"gross": 0.0, "revenue": 0.0})
    by_owner: dict[int, dict] = defaultdict(lambda: {"gross": 0.0, "revenue": 0.0})
    ytd = {"gross": 0.0, "revenue": 0.0, "owner_share": 0.0, "pass_through": 0.0}
    payable = payable_overdue = 0.0
    payable_count = payable_overdue_count = 0
    with_receipt = paid_since_receipts = 0
    method_mix: Counter = Counter()

    for p in paid:
        parts = _payment_parts(p)
        gross = float(p.amount or 0)
        rev = parts["management_fee"]
        passthru = parts["agent_fee"] + parts["ejar_fee"]
        m = _mk(p.paid_date)
        if m in series:
            s = series[m]
            s["gross"] += gross
            s["revenue"] += rev
            s["owner_share"] += parts["owner_share"]
            s["pass_through"] += passthru
            b = bld(p)
            if b:
                by_building[b.id]["gross"] += gross
                by_building[b.id]["revenue"] += rev
                if b.owner_id:
                    by_owner[b.owner_id]["gross"] += gross
                    by_owner[b.owner_id]["revenue"] += rev
            method_mix[p.payment_method or "unknown"] += gross
        if p.paid_date >= year_start:
            ytd["gross"] += gross
            ytd["revenue"] += rev
            ytd["owner_share"] += parts["owner_share"]
            ytd["pass_through"] += passthru
        if not p.owner_transferred_date and parts["owner_share"] > 0:
            payable += parts["owner_share"]
            payable_count += 1
            if p.owner_transfer_due_date and p.owner_transfer_due_date < today:
                payable_overdue += parts["owner_share"]
                payable_overdue_count += 1
        if p.paid_date >= since:
            paid_since_receipts += 1
            if getattr(p, "receipt_url", None):
                with_receipt += 1

    ytd_company_costs = ytd_owner_costs = 0.0
    cost_mix: Counter = Counter()
    for e in expenses:
        amt = float(e.amount or 0)
        m = _mk(e.expense_date)
        company = (e.paid_by or "company") == "company"
        if m in series:
            series[m]["company_costs" if company else "owner_costs"] += amt
            if company:
                cost_mix[e.category or "other"] += amt
        if e.expense_date and e.expense_date >= year_start:
            if company:
                ytd_company_costs += amt
            else:
                ytd_owner_costs += amt

    payroll = _payroll_by_month(db, keys) if include_payroll else {m: 0.0 for m in keys}
    payroll_companies: list[dict] = []
    if include_payroll:
        from api.hr_people_models import HrCompany, HrContract

        cos = {c.id: c for c in db.scalars(select(HrCompany)).all()}
        per = defaultdict(float)
        for c in db.scalars(select(HrContract).where(HrContract.status == "accepted")).all():
            if c.end_date and c.end_date < today:
                continue
            co = cos.get(c.company_id)
            label = (co.name_en if locale == "en" and co and co.name_en else co.name_ar) if co else "—"
            per[label] += sum(float(x or 0) for x in (c.basic_salary, c.housing_allowance, c.transport_allowance, c.other_allowance))
        payroll_companies = [{"company": k, "monthly": _r(v)} for k, v in sorted(per.items(), key=lambda kv: -kv[1])]
    ytd_keys = [m for m in _months(today.month, today)]
    ytd_payroll = sum(_payroll_by_month(db, ytd_keys).values()) if include_payroll else 0.0
    for m in keys:
        s = series[m]
        s["payroll"] = payroll[m]
        s["net_profit"] = s["revenue"] - s["company_costs"] - s["payroll"]
        s["margin"] = _pct(s["net_profit"], s["revenue"])
        s["take_rate"] = _pct(s["revenue"], s["gross"])
        for k in ("gross", "revenue", "owner_share", "pass_through", "company_costs", "owner_costs", "payroll", "net_profit"):
            s[k] = _r(s[k])

    ytd_net = ytd["revenue"] - ytd_company_costs - ytd_payroll
    this_m, prev_m = keys[-1], keys[-2] if len(keys) > 1 else None

    def delta(k: str) -> Optional[float]:
        if not prev_m or not series[prev_m][k]:
            return None
        return round(100 * (series[this_m][k] - series[prev_m][k]) / abs(series[prev_m][k]), 1)

    # Expected management fees from instalments still to come (next 6 months)
    fwd_keys = [(today.replace(day=1) + relativedelta(months=i)).strftime("%Y-%m") for i in range(0, 6)]
    fwd = {m: {"month": m, "gross": 0.0, "revenue": 0.0} for m in fwd_keys}
    for p in db.scalars(select(Payment).where(Payment.status.in_(["pending", "overdue"]))).all():
        m = _mk(p.due_date)
        if m in fwd:
            parts = _payment_parts(p)
            fwd[m]["gross"] += float(p.amount or 0)
            fwd[m]["revenue"] += parts["management_fee"]
    forecast = [{"month": v["month"], "gross": _r(v["gross"]), "revenue": _r(v["revenue"])} for v in fwd.values()]

    def top(d: dict, ref: dict, n: int = 8) -> list[dict]:
        rows = [{"id": k, "name": _name(ref.get(k), locale), "gross": _r(v["gross"]), "revenue": _r(v["revenue"]),
                 "take_rate": _pct(v["revenue"], v["gross"])} for k, v in d.items()]
        rows.sort(key=lambda r: -r["revenue"])
        return rows[:n]

    total_window_gross = sum(s["gross"] for s in series.values())
    return {
        "as_of": today.isoformat(),
        "months": months,
        "payroll_included": include_payroll,
        "kpis": {
            "gross_ytd": _r(ytd["gross"]),
            "revenue_ytd": _r(ytd["revenue"]),
            "owner_share_ytd": _r(ytd["owner_share"]),
            "pass_through_ytd": _r(ytd["pass_through"]),
            "company_costs_ytd": _r(ytd_company_costs),
            "owner_costs_ytd": _r(ytd_owner_costs),
            "payroll_ytd": _r(ytd_payroll),
            "net_profit_ytd": _r(ytd_net),
            "net_margin_ytd": _pct(ytd_net, ytd["revenue"]),
            "take_rate_ytd": _pct(ytd["revenue"], ytd["gross"]),
            "owner_payable": _r(payable),
            "owner_payable_count": payable_count,
            "owner_payable_overdue": _r(payable_overdue),
            "owner_payable_overdue_count": payable_overdue_count,
            "receipt_coverage": _pct(with_receipt, paid_since_receipts),
            "payments_without_receipt": paid_since_receipts - with_receipt,
            "revenue_mom": delta("revenue"),
            "net_profit_mom": delta("net_profit"),
        },
        "series": list(series.values()),
        "forecast": forecast,
        "waterfall": [
            {"key": "gross", "amount": _r(ytd["gross"])},
            {"key": "owner_share", "amount": -_r(ytd["owner_share"])},
            {"key": "pass_through", "amount": -_r(ytd["pass_through"])},
            {"key": "revenue", "amount": _r(ytd["revenue"]), "total": True},
            {"key": "company_costs", "amount": -_r(ytd_company_costs)},
            {"key": "payroll", "amount": -_r(ytd_payroll)},
            {"key": "net_profit", "amount": _r(ytd_net), "total": True},
        ],
        "by_building": top(by_building, buildings),
        "by_owner": top(by_owner, owners),
        "payroll_by_company": payroll_companies,
        "cost_mix": [{"category": k, "amount": _r(v)} for k, v in cost_mix.most_common()],
        "method_mix": [{"method": k, "amount": _r(v), "share": _pct(v, total_window_gross)} for k, v in method_mix.most_common()],
    }


# ══════════════════════════════════════════════════════════════════════════════
# Operations — maintenance, renewals, support
# ══════════════════════════════════════════════════════════════════════════════


def operations(db: Session, locale: str = "ar", months: int = 12) -> dict:
    from api.maintenance_models import WorkOrder
    from api.renewal_models import LeaseRenewal

    now = datetime.utcnow()
    today = date.today()
    keys = _months(months, today)
    since = datetime(*map(int, keys[0].split("-")), 1)
    year_start = today.replace(month=1, day=1)
    buildings = {b.id: b for b in db.scalars(select(Building)).all()}

    # ── Maintenance ──
    WO_OPEN = {"new", "assigned", "awaiting_approval", "approved", "in_progress"}
    wos = db.scalars(select(WorkOrder)).all()
    open_wos = [w for w in wos if w.status in WO_OPEN]
    done = [w for w in wos if w.completed_at]
    wo_month = {m: {"month": m, "created": 0, "completed": 0, "cost": 0.0} for m in keys}
    for w in wos:
        if (m := _mk(w.created_at)) in wo_month:
            wo_month[m]["created"] += 1
        if (m := _mk(w.completed_at)) in wo_month:
            wo_month[m]["completed"] += 1
            wo_month[m]["cost"] += float(w.actual_cost or 0)
    for v in wo_month.values():
        v["cost"] = _r(v["cost"])
    per_building = Counter(w.building_id for w in wos if w.created_at and w.created_at >= since)
    cost_ytd = Counter()
    for w in wos:
        if w.completed_at and w.completed_at.date() >= year_start:
            cost_ytd[w.charge_to or "owner"] += float(w.actual_cost or 0)
    res_hours = [_hours(w.created_at, w.completed_at) for w in done if w.created_at and w.created_at >= since]
    on_time = [w for w in done if w.due_at and w.created_at and w.created_at >= since]
    ratings = [w.rating for w in wos if w.rating]
    maintenance = {
        "open": len(open_wos),
        "emergency_open": sum(1 for w in open_wos if w.priority == "emergency"),
        "overdue": sum(1 for w in open_wos if w.due_at and w.due_at < now),
        "awaiting_approval": sum(1 for w in open_wos if w.status == "awaiting_approval"),
        "avg_resolution_hours": _avg(res_hours),
        "median_resolution_hours": round(median([h for h in res_hours if h is not None]), 1) if any(h is not None for h in res_hours) else None,
        "sla_met_pct": _pct(sum(1 for w in on_time if w.completed_at <= w.due_at), len(on_time)),
        "avg_rating": _avg(ratings),
        "cost_ytd": _r(sum(cost_ytd.values())),
        "cost_by_payer": [{"payer": k, "amount": _r(v)} for k, v in cost_ytd.most_common()],
        "by_status": [{"status": k, "count": v} for k, v in Counter(w.status for w in open_wos).most_common()],
        "by_category": [{"category": k, "count": v} for k, v in Counter(w.category for w in wos if w.created_at and w.created_at >= since).most_common()],
        "by_priority": [{"priority": k, "count": v} for k, v in Counter(w.priority for w in open_wos).most_common()],
        "series": list(wo_month.values()),
        "hot_buildings": [{"id": k, "name": _name(buildings.get(k), locale), "count": v} for k, v in per_building.most_common(6)],
    }

    # ── Renewals ──
    RN_OPEN = ["due", "contacted", "offer_sent", "awaiting_owner", "agreed"]
    rns = db.scalars(select(LeaseRenewal)).all()
    year_ago = today - timedelta(days=365)
    closed = [r for r in rns if r.stage in ("renewed", "lost") and r.end_date >= year_ago]
    renewed = [r for r in closed if r.stage == "renewed"]
    uplifts = [100 * (r.proposed_rent - r.current_rent) / r.current_rent for r in renewed if r.proposed_rent and r.current_rent]
    open_rn = [r for r in rns if r.stage in RN_OPEN]
    renewals = {
        "open": len(open_rn),
        "rent_in_play": _r(sum(r.current_rent or 0 for r in open_rn)),
        "renewal_rate": _pct(len(renewed), len(closed)),
        "avg_uplift_pct": round(mean(uplifts), 1) if uplifts else None,
        "follow_ups_due": sum(1 for r in open_rn if r.next_follow_up and r.next_follow_up <= today),
        "ending_30": sum(1 for r in open_rn if r.end_date <= today + timedelta(days=30)),
        "funnel": [{"stage": s, "count": sum(1 for r in rns if r.stage == s), "rent": _r(sum(r.current_rent or 0 for r in rns if r.stage == s))} for s in RN_OPEN + ["renewed", "lost"]],
        "intent": [{"intent": k, "count": v} for k, v in Counter(r.tenant_intent for r in open_rn).most_common()],
        "lost_reasons": [{"reason": k or "other", "count": v} for k, v in Counter(r.lost_reason for r in closed if r.stage == "lost").most_common()],
    }

    # ── Support desk ──
    SUP_ACTIVE = {"open", "in_progress", "waiting_user"}
    tickets = db.scalars(select(SupportTicket)).all()
    t_month = {m: {"month": m, "opened": 0, "resolved": 0} for m in keys}
    for t in tickets:
        if (m := _mk(t.created_at)) in t_month:
            t_month[m]["opened"] += 1
        if (m := _mk(t.resolved_at or t.closed_at)) in t_month:
            t_month[m]["resolved"] += 1
    active = [t for t in tickets if t.status in SUP_ACTIVE]
    recent = [t for t in tickets if t.created_at and t.created_at >= since]
    first_resp = [_hours(t.created_at, t.first_response_at) for t in recent]
    resolve = [_hours(t.created_at, t.resolved_at or t.closed_at) for t in recent]
    breached = sum(1 for t in active if (t.resolve_due_at and t.resolve_due_at < now) or (not t.first_response_at and t.response_due_at and t.response_due_at < now))
    support = {
        "active": len(active),
        "unassigned": sum(1 for t in active if not t.assignee_id),
        "breached": breached,
        "avg_first_response_hours": _avg(first_resp),
        "avg_resolution_hours": _avg(resolve),
        "by_category": [{"category": k, "count": v} for k, v in Counter(t.category for t in recent).most_common()],
        "by_status": [{"status": k, "count": v} for k, v in Counter(t.status for t in tickets).most_common()],
        "series": list(t_month.values()),
    }

    # ── Collections follow-up ──
    collections = {}
    try:
        from api.routers.collections import CollectionAction

        acts = db.scalars(select(CollectionAction).where(CollectionAction.at >= since)).all()
        a_month = {m: {"month": m, "actions": 0, "promises": 0} for m in keys}
        for a in acts:
            if (m := _mk(a.at)) in a_month:
                a_month[m]["actions"] += 1
                if a.kind == "promise":
                    a_month[m]["promises"] += 1
        promises = [a for a in acts if a.kind == "promise" and a.promise_date and a.promise_date < today]
        kept = 0
        for a in promises:
            p = db.get(Payment, a.payment_id)
            if p and p.paid_date and p.paid_date <= a.promise_date + timedelta(days=3):
                kept += 1
        collections = {
            "actions": len(acts),
            "by_kind": [{"kind": k, "count": v} for k, v in Counter(a.kind for a in acts).most_common()],
            "promise_kept_pct": _pct(kept, len(promises)),
            "series": list(a_month.values()),
        }
    except Exception:  # table not created yet on an old database
        collections = {"actions": 0, "by_kind": [], "promise_kept_pct": None, "series": []}

    return {"as_of": today.isoformat(), "months": months, "maintenance": maintenance, "renewals": renewals,
            "support": support, "collections": collections}


# ══════════════════════════════════════════════════════════════════════════════
# People (HR)
# ══════════════════════════════════════════════════════════════════════════════

def people(db: Session, locale: str = "ar", include_pay: bool = False) -> dict:
    from api.hr_models import Attendance, HrProfile, HrRequest, HrSettings
    from api.hr_people_models import HrAsset, HrCompany, HrContract, HrDepartment, HrPersonal

    today = date.today()
    year_start = today.replace(month=1, day=1)
    s = db.get(HrSettings, 1)
    work_start = s.work_start if s else time(9, 0)
    grace = s.grace_minutes if s else 15
    weekend = {int(x) for x in (s.weekend_days if s else "4").split(",") if x.strip().isdigit()}

    from api.routers.hr import _staff

    users = {u.id: u for u in db.scalars(select(User)).all()}
    profiles = {p.user_id: p for p in db.scalars(select(HrProfile)).all()}
    staff_ids = {u.id for u in _staff(db, working_only=True)}
    companies = {c.id: c for c in db.scalars(select(HrCompany)).all()}
    depts = {d.id: d for d in db.scalars(select(HrDepartment)).all()}

    def cname(cid):
        c = companies.get(cid)
        return (c.name_en if locale == "en" and c.name_en else c.name_ar) if c else ("—" if locale == "en" else "—")

    def dname(p: Optional[HrProfile]):
        if p and p.department_id and p.department_id in depts:
            d = depts[p.department_id]
            return d.name_en if locale == "en" and d.name_en else d.name_ar
        return (p.department if p and p.department else None) or ("Unassigned" if locale == "en" else "غير محدد")

    by_company = Counter(cname(profiles[u].company_id) if u in profiles else cname(None) for u in staff_ids)
    by_dept = Counter(dname(profiles.get(u)) for u in staff_ids)
    by_mode = Counter((profiles[u].work_mode if u in profiles else "office") for u in staff_ids)
    by_status = Counter((profiles[u].employment_status if u in profiles else "active") for u in staff_ids)
    by_nat = Counter((profiles[u].nationality or "—") for u in staff_ids if u in profiles)
    tenure = [((today - profiles[u].hire_date).days / 365.25) for u in staff_ids if u in profiles and profiles[u].hire_date]
    hires = Counter(_mk(profiles[u].hire_date) for u in staff_ids if u in profiles and profiles[u].hire_date and profiles[u].hire_date >= today - relativedelta(months=12))

    # ── Attendance: last 30 working days ──
    start = today - timedelta(days=29)
    att = db.scalars(select(Attendance).where(Attendance.day >= start, Attendance.day <= today)).all()
    leaves = db.scalars(select(HrRequest).where(HrRequest.kind == "leave", HrRequest.status == "approved", HrRequest.end_date >= start)).all()

    def on_leave(uid: int, d: date) -> bool:
        return any(r.user_id == uid and r.start_date and r.end_date and r.start_date <= d <= r.end_date for r in leaves)

    late_limit = (datetime.combine(today, work_start) + timedelta(minutes=grace)).time()
    att_by = defaultdict(dict)
    for a in att:
        if a.user_id in staff_ids:
            att_by[a.day][a.user_id] = a
    daily = []
    late_total = present_total = expected_total = 0
    checkins: list[float] = []
    late_by_user: Counter = Counter()
    for i in range(30):
        d = start + timedelta(days=i)
        if d.weekday() in weekend:
            continue
        if s and s.attendance_from and d < s.attendance_from:
            continue
        expected = [u for u in staff_ids if not on_leave(u, d)]
        present = [a for uid, a in att_by[d].items() if a.check_in]
        late = []
        for a in present:
            p = profiles.get(a.user_id)
            limit = (datetime.combine(d, p.work_start) + timedelta(minutes=grace)).time() if p and p.work_start else late_limit
            if a.mode == "office" and a.check_in > limit:
                late.append(a)
                late_by_user[a.user_id] += 1
            checkins.append(a.check_in.hour * 60 + a.check_in.minute)
        n_leave = len(staff_ids) - len(expected)
        daily.append({"day": d.isoformat(), "present": len(present), "late": len(late), "on_leave": n_leave,
                      "absent": max(0, len(expected) - len(present))})
        late_total += len(late)
        present_total += len(present)
        expected_total += len(expected)
    avg_in = round(mean(checkins)) if checkins else None

    today_row = daily[-1] if daily and daily[-1]["day"] == today.isoformat() else None

    # ── Requests ──
    reqs = db.scalars(select(HrRequest).where(HrRequest.created_at >= datetime.combine(year_start, time()))).all()
    leave_days = Counter()
    for r in reqs:
        if r.kind == "leave" and r.status == "approved":
            leave_days[r.leave_type or "annual"] += float(r.days or 0)
    upcoming = [r for r in db.scalars(select(HrRequest).where(HrRequest.kind == "leave", HrRequest.status == "approved", HrRequest.start_date > today, HrRequest.start_date <= today + timedelta(days=30))).all()]
    pending = db.scalars(select(HrRequest).where(HrRequest.status == "pending")).all()
    perm_month = sum(r.minutes or 0 for r in reqs if r.kind == "permission" and r.status == "approved" and r.start_date and r.start_date >= today.replace(day=1))
    tickets_cost = sum(float(r.actual_cost or r.estimated_cost or 0) for r in reqs if r.kind == "ticket" and r.status in ("approved", "booked"))
    req_month = {m: {"month": m, "leave": 0, "permission": 0, "ticket": 0, "work_location": 0} for m in _months(12, today)}
    for r in db.scalars(select(HrRequest).where(HrRequest.created_at >= datetime.combine(today.replace(day=1) - relativedelta(months=11), time()))).all():
        if (m := _mk(r.created_at)) in req_month and r.kind in req_month[m]:
            req_month[m][r.kind] += 1

    # ── Expiries & contracts ──
    horizon = today + timedelta(days=90)
    expiries = []
    for p in db.scalars(select(HrPersonal)).all():
        if p.user_id not in staff_ids:
            continue
        nm = _name(users.get(p.user_id), locale)
        for kind, d in (("id", p.id_expiry), ("passport", p.passport_expiry)):
            if d and d <= horizon:
                expiries.append({"user_id": p.user_id, "name": nm, "kind": kind, "date": d.isoformat(), "days": (d - today).days})
    contracts = db.scalars(select(HrContract)).all()
    for c in contracts:
        if c.user_id not in staff_ids or c.status != "accepted":
            continue
        nm = _name(users.get(c.user_id), locale)
        if c.end_date and c.end_date <= horizon:
            expiries.append({"user_id": c.user_id, "name": nm, "kind": "contract", "date": c.end_date.isoformat(), "days": (c.end_date - today).days})
        if c.probation_end and today <= c.probation_end <= horizon:
            expiries.append({"user_id": c.user_id, "name": nm, "kind": "probation", "date": c.probation_end.isoformat(), "days": (c.probation_end - today).days})
    expiries.sort(key=lambda x: x["days"])
    accepted = [c for c in contracts if c.status == "accepted" and c.user_id in staff_ids]
    with_contract = {c.user_id for c in accepted}

    # ── Assets ──
    assets = db.scalars(select(HrAsset)).all()
    asset_status = Counter(a.status for a in assets)
    asset_kind = Counter(a.kind for a in assets)

    pay = None
    if include_pay:
        monthly = defaultdict(float)
        for c in accepted:
            if c.end_date and c.end_date < today:
                continue
            monthly[cname(c.company_id)] += sum(float(x or 0) for x in (c.basic_salary, c.housing_allowance, c.transport_allowance, c.other_allowance))
        total = sum(monthly.values())
        pay = {"monthly_total": _r(total), "annual_total": _r(total * 12),
               "avg_package": _r(total / len(accepted)) if accepted else None,
               "by_company": [{"company": k, "amount": _r(v)} for k, v in sorted(monthly.items(), key=lambda kv: -kv[1])]}

    return {
        "as_of": today.isoformat(),
        "kpis": {
            "headcount": len(staff_ids),
            "companies": len({cname(profiles[u].company_id) for u in staff_ids if u in profiles}) or (1 if staff_ids else 0),
            "present_today": today_row["present"] if today_row else None,
            "late_today": today_row["late"] if today_row else None,
            "on_leave_today": today_row["on_leave"] if today_row else sum(1 for u in staff_ids if on_leave(u, today)),
            "attendance_rate_30d": _pct(present_total, expected_total),
            "punctuality_30d": _pct(present_total - late_total, present_total),
            "avg_check_in": f"{avg_in // 60:02d}:{avg_in % 60:02d}" if avg_in is not None else None,
            "pending_requests": len(pending),
            "leave_days_ytd": round(sum(leave_days.values()), 1),
            "permission_minutes_month": perm_month,
            "tickets_cost_ytd": _r(tickets_cost),
            "avg_tenure_years": round(mean(tenure), 1) if tenure else None,
            "without_contract": len(staff_ids - with_contract),
            "expiring_90": len(expiries),
            "assets_assigned": asset_status.get("assigned", 0),
            "assets_value": _r(sum(a.value or 0 for a in assets if a.status == "assigned" and a.kind != "cash")),
            "assets_unacknowledged": sum(1 for a in assets if a.status == "assigned" and not a.acknowledged_at),
        },
        "by_company": [{"name": k, "count": v} for k, v in by_company.most_common()],
        "by_department": [{"name": k, "count": v} for k, v in by_dept.most_common()],
        "by_work_mode": [{"mode": k, "count": v} for k, v in by_mode.most_common()],
        "by_status": [{"status": k, "count": v} for k, v in by_status.most_common()],
        "by_nationality": [{"name": k, "count": v} for k, v in by_nat.most_common(6)],
        "hires": [{"month": m, "count": hires.get(m, 0)} for m in _months(12, today)],
        "attendance": daily,
        "tracking_from": s.attendance_from.isoformat() if s and s.attendance_from else None,
        "late_leaders": [{"name": _name(users.get(u), locale), "count": n} for u, n in late_by_user.most_common(5)],
        "leave_by_type": [{"type": k, "days": round(v, 1)} for k, v in leave_days.most_common()],
        "requests_series": list(req_month.values()),
        "pending_by_kind": [{"kind": k, "count": v} for k, v in Counter(r.kind for r in pending).most_common()],
        "upcoming_leave": sorted([{"name": _name(users.get(r.user_id), locale), "start": r.start_date.isoformat(), "end": r.end_date.isoformat() if r.end_date else None, "days": r.days, "type": r.leave_type} for r in upcoming], key=lambda x: x["start"])[:10],
        "expiries": expiries[:15],
        "assets_by_status": [{"status": k, "count": v} for k, v in asset_status.most_common()],
        "assets_by_kind": [{"kind": k, "count": v} for k, v in asset_kind.most_common()],
        "pay": pay,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Growth — website leads, listings, careers
# ══════════════════════════════════════════════════════════════════════════════


def growth(db: Session, locale: str = "ar", months: int = 12) -> dict:
    from api.cms_models import CmsJob, CmsJobApplication, CmsLead, CmsListing

    today = date.today()
    keys = _months(months, today)
    since = datetime(*map(int, keys[0].split("-")), 1)
    leads = db.scalars(select(CmsLead)).all()
    recent = [l for l in leads if l.created_at and l.created_at >= since]
    l_month = {m: {"month": m, "leads": 0, "applications": 0} for m in keys}
    for l in recent:
        if (m := _mk(l.created_at)) in l_month:
            l_month[m]["leads"] += 1
    apps = db.scalars(select(CmsJobApplication)).all()
    for a in apps:
        if (m := _mk(a.created_at)) in l_month:
            l_month[m]["applications"] += 1
    listings = db.scalars(select(CmsListing)).all()
    jobs = db.scalars(select(CmsJob)).all()
    pages = Counter()
    for l in recent:
        src = (l.source_page or "").split("?")[0]
        if src:
            seg = [x for x in src.split("/") if x]
            pages["/" + "/".join(seg[-2:]) if seg else "/"] += 1
    this_m = l_month[keys[-1]]["leads"]
    prev_m = l_month[keys[-2]]["leads"] if len(keys) > 1 else 0

    # Vacant units vs what is advertised
    contracts = db.scalars(select(Contract)).all()
    leased = {c.unit_id for c in contracts if (c.status or "") == "active" and (c.end_date is None or c.end_date >= today)}
    units = db.scalars(select(Unit)).all()
    vacant = sum(1 for u in units if u.id not in leased)
    published = [x for x in listings if x.published]
    first_touch = [l for l in recent if l.status != "new"]
    return {
        "as_of": today.isoformat(),
        "months": months,
        "kpis": {
            "leads_window": len(recent),
            "leads_this_month": this_m,
            "leads_mom": round(100 * (this_m - prev_m) / prev_m, 1) if prev_m else None,
            "new_untouched": sum(1 for l in leads if l.status == "new"),
            "contacted_pct": _pct(len(first_touch), len(recent)),
            "listings_published": len(published),
            "listings_available": sum(1 for x in published if x.status == "available"),
            "vacant_units": vacant,
            "listing_coverage": _pct(sum(1 for x in published if x.status == "available"), vacant),
            "open_jobs": sum(1 for j in jobs if getattr(j, "published", False)),
            "applications_window": sum(1 for a in apps if a.created_at and a.created_at >= since),
            "applications_new": sum(1 for a in apps if a.status == "new"),
        },
        "series": list(l_month.values()),
        "leads_by_kind": [{"kind": k, "count": v} for k, v in Counter(l.kind for l in recent).most_common()],
        "leads_by_status": [{"status": k, "count": v} for k, v in Counter(l.status for l in recent).most_common()],
        "leads_by_city": [{"city": k, "count": v} for k, v in Counter((l.city or "—") for l in recent).most_common(6)],
        "leads_by_locale": [{"locale": k or "—", "count": v} for k, v in Counter(l.locale for l in recent).most_common()],
        "top_pages": [{"page": k, "count": v} for k, v in pages.most_common(6)],
        "listings_by_type": [{"type": k, "count": v} for k, v in Counter(x.property_type for x in published).most_common()],
        "listings_by_purpose": [{"purpose": k, "count": v} for k, v in Counter(x.purpose for x in published).most_common()],
        "applications_by_status": [{"status": k, "count": v} for k, v in Counter(a.status for a in apps).most_common()],
    }
