"""Portfolio insights for the staff dashboard (one round-trip, computed in Python).

The portfolio is small (hundreds of rows), so everything is loaded once and
aggregated here. All money is SAR, cash basis for collections (paid_date) and
accrual for expectations (due_date). Every figure is derived from stored data —
nothing is estimated except where a field is labelled `forecast`.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from statistics import mean

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.models import Building, Contract, Expense, ManagementContract, Owner, Payment, Unit


def _name(obj, locale: str) -> str:
    for f in ((f"name_{locale}", "name", "name_en", "name_ar")):
        v = getattr(obj, f, None)
        if v:
            return str(v)
    return f"#{obj.id}"


def _month_key(d: date) -> str:
    return d.strftime("%Y-%m")


def compute_insights(db: Session, locale: str = "ar") -> dict:
    today = date.today()
    first_this = today.replace(day=1)
    year_start = today.replace(month=1, day=1)

    buildings = db.scalars(select(Building)).all()
    units = db.scalars(select(Unit)).all()
    contracts = db.scalars(select(Contract)).all()
    payments = db.scalars(select(Payment)).all()
    expenses = db.scalars(select(Expense)).all()
    owners = {o.id: o for o in db.scalars(select(Owner)).all()}
    mgmt = db.scalars(select(ManagementContract)).all()

    b_by_id = {b.id: b for b in buildings}
    u_by_id = {u.id: u for u in units}
    c_by_id = {c.id: c for c in contracts}

    def active(c: Contract) -> bool:
        return (c.status or "") == "active" and (c.end_date is None or c.end_date >= today)

    active_contracts = [c for c in contracts if active(c)]
    leased_units = {c.unit_id for c in active_contracts}

    # ── Occupancy ──
    total_units = len(units)
    occupied = sum(1 for u in units if u.id in leased_units)
    vacant_units = [u for u in units if u.id not in leased_units]
    occupancy = round(100 * occupied / total_units, 1) if total_units else 0.0
    vacancy_loss_month = round(sum((u.rent_amount or 0) for u in vacant_units), 2)  # unit rent is monthly

    # ── Payments ──
    def is_paid(p: Payment) -> bool:
        return (p.status or "") == "paid" or p.paid_date is not None

    overdue = [p for p in payments if not is_paid(p) and p.due_date and p.due_date < today]
    overdue_amount = round(sum(p.amount or 0 for p in overdue), 2)

    mtd_collected = round(sum(p.amount or 0 for p in payments if p.paid_date and p.paid_date >= first_this), 2)
    mtd_expected = round(sum(p.amount or 0 for p in payments if p.due_date and _month_key(p.due_date) == _month_key(today)), 2)
    ytd_collected = round(sum(p.amount or 0 for p in payments if p.paid_date and p.paid_date >= year_start), 2)
    ytd_expenses = round(sum(e.amount or 0 for e in expenses if e.expense_date and e.expense_date >= year_start), 2)
    due_to_date = [p for p in payments if p.due_date and p.due_date <= today]
    collection_rate = round(100 * sum(p.amount or 0 for p in due_to_date if is_paid(p)) / max(1e-9, sum(p.amount or 0 for p in due_to_date)), 1) if due_to_date else 0.0

    # Payment behaviour (paid instalments): on-time share and average delay
    paid = [p for p in payments if p.paid_date and p.due_date]
    delays = [(p.paid_date - p.due_date).days for p in paid]
    on_time_pct = round(100 * sum(1 for d in delays if d <= 0) / len(delays), 1) if delays else None
    avg_delay = round(mean([d for d in delays if d > 0]), 1) if any(d > 0 for d in delays) else 0.0

    # ── 12-month cash flow (collected, expected, expenses, NOI, collection %) ──
    months = [(first_this - relativedelta(months=i)) for i in range(11, -1, -1)]
    coll_m, exp_m, cost_m = defaultdict(float), defaultdict(float), defaultdict(float)
    for p in payments:
        if p.paid_date:
            coll_m[_month_key(p.paid_date)] += p.amount or 0
        if p.due_date:
            exp_m[_month_key(p.due_date)] += p.amount or 0
    for e in expenses:
        if e.expense_date:
            cost_m[_month_key(e.expense_date)] += e.amount or 0
    cashflow = []
    for m in months:
        k = _month_key(m)
        c, x, e = coll_m[k], exp_m[k], cost_m[k]
        cashflow.append({
            "month": k, "collected": round(c, 2), "expected": round(x, 2), "expenses": round(e, 2),
            "noi": round(c - e, 2), "rate": round(100 * c / x, 1) if x else None,
        })

    # ── Forecast: scheduled (unpaid) instalments for the next 6 months ──
    forecast = []
    for i in range(0, 6):
        m = first_this + relativedelta(months=i)
        k = _month_key(m)
        amt = sum(p.amount or 0 for p in payments if not is_paid(p) and p.due_date and _month_key(p.due_date) == k)
        forecast.append({"month": k, "scheduled": round(amt, 2)})

    # ── Receivables aging ──
    buckets = {"0-30": 0.0, "31-60": 0.0, "61-90": 0.0, "90+": 0.0}
    counts = {k: 0 for k in buckets}
    for p in overdue:
        d = (today - p.due_date).days
        k = "0-30" if d <= 30 else "31-60" if d <= 60 else "61-90" if d <= 90 else "90+"
        buckets[k] += p.amount or 0
        counts[k] += 1
    aging = [{"bucket": k, "amount": round(v, 2), "count": counts[k]} for k, v in buckets.items()]

    # ── Lease expiry ladder (next 12 months) ──
    ladder = []
    for i in range(0, 12):
        m = first_this + relativedelta(months=i)
        k = _month_key(m)
        cs = [c for c in active_contracts if c.end_date and _month_key(c.end_date) == k]
        ladder.append({"month": k, "count": len(cs), "rent": round(sum(c.total_rent_amount or 0 for c in cs), 2)})
    expiring_90 = [c for c in active_contracts if c.end_date and today <= c.end_date <= today + timedelta(days=90)]
    rent_at_risk = round(sum(c.total_rent_amount or 0 for c in expiring_90), 2)

    # ── Per building ──
    per_building = []
    for b in buildings:
        us = [u for u in units if u.building_id == b.id]
        if not us:
            continue
        occ = sum(1 for u in us if u.id in leased_units)
        b_contract_ids = {c.id for c in contracts if c.unit_id in {u.id for u in us}}
        b_coll = sum(p.amount or 0 for p in payments if p.contract_id in b_contract_ids and p.paid_date and p.paid_date >= year_start)
        b_over = sum(p.amount or 0 for p in overdue if p.contract_id in b_contract_ids)
        b_exp = sum(e.amount or 0 for e in expenses if e.building_id == b.id and e.expense_date and e.expense_date >= year_start)
        asking = sum(u.rent_amount or 0 for u in us)
        per_building.append({
            "id": b.id, "name": _name(b, locale), "units": len(us), "occupied": occ,
            "occupancy": round(100 * occ / len(us), 1), "collected_ytd": round(b_coll, 2),
            "expenses_ytd": round(b_exp, 2), "noi_ytd": round(b_coll - b_exp, 2), "overdue": round(b_over, 2),
            "asking_rent": round(asking, 2),
            "vacancy_loss_month": round(sum((u.rent_amount or 0) for u in us if u.id not in leased_units), 2),
        })
    per_building.sort(key=lambda r: (-r["collected_ytd"], r["name"]))

    # ── Revenue concentration by owner (YTD collections) ──
    by_owner = defaultdict(float)
    for p in payments:
        if p.paid_date and p.paid_date >= year_start:
            c = c_by_id.get(p.contract_id)
            u = u_by_id.get(c.unit_id) if c else None
            b = b_by_id.get(u.building_id) if u else None
            if b and b.owner_id:
                by_owner[b.owner_id] += p.amount or 0
    total_owner = sum(by_owner.values()) or 0
    owners_rank = sorted(by_owner.items(), key=lambda kv: -kv[1])
    concentration = [
        {"owner": _name(owners[oid], locale) if oid in owners else f"#{oid}", "amount": round(v, 2),
         "share": round(100 * v / total_owner, 1) if total_owner else 0}
        for oid, v in owners_rank[:6]
    ]
    top_share = round(sum(r["share"] for r in concentration[:3]), 1) if concentration else 0

    # ── Expenses by category (YTD) ──
    cat = defaultdict(float)
    for e in expenses:
        if e.expense_date and e.expense_date >= year_start:
            cat[e.category or "other"] += e.amount or 0
    expense_mix = [{"category": k, "amount": round(v, 2)} for k, v in sorted(cat.items(), key=lambda kv: -kv[1])]

    # ── Rent benchmarking: units priced well below their building's average ──
    underpriced = []
    for b in buildings:
        us = [u for u in units if u.building_id == b.id and (u.rent_amount or 0) > 0]
        if len(us) < 3:
            continue
        avg = mean(u.rent_amount for u in us)
        for u in us:
            if u.rent_amount < 0.8 * avg:
                underpriced.append({"unit": f"{_name(b, locale)} · {u.number or u.id}", "rent": round(u.rent_amount, 2), "avg": round(avg, 2),
                                    "gap_pct": round(100 * (avg - u.rent_amount) / avg, 1)})
    underpriced.sort(key=lambda r: -r["gap_pct"])

    # ── Smart alerts (most urgent first) ──
    alerts: list[dict] = []
    for p in sorted(overdue, key=lambda p: p.due_date)[:200]:
        days = (today - p.due_date).days
        if days >= 30:
            c = c_by_id.get(p.contract_id)
            alerts.append({"level": "high" if days >= 60 else "medium", "kind": "overdue",
                           "ref": c.contract_number if c else f"#{p.contract_id}", "amount": p.amount, "days": days,
                           "href": "payments"})
    for c in sorted(expiring_90, key=lambda c: c.end_date):
        days = (c.end_date - today).days
        u = u_by_id.get(c.unit_id)
        b = b_by_id.get(u.building_id) if u else None
        alerts.append({"level": "high" if days <= 30 else "medium", "kind": "expiring", "ref": c.contract_number,
                       "where": f"{_name(b, locale)} · {u.number}" if (u and b) else None, "days": days,
                       "amount": c.total_rent_amount, "href": "renewals"})
    for c in active_contracts:
        if (c.ejar_status or "") not in ("registered", "active"):
            alerts.append({"level": "low", "kind": "ejar", "ref": c.contract_number, "href": "contracts"})
    for r in per_building:
        if r["units"] >= 2 and r["occupancy"] < 70:
            alerts.append({"level": "medium", "kind": "low_occupancy", "ref": r["name"], "pct": r["occupancy"],
                           "amount": r["vacancy_loss_month"], "href": "properties"})
    pending_payout = [p for p in payments if p.paid_date and p.owner_transfer_due_date and not p.owner_transferred_date and p.owner_transfer_due_date <= today]
    if pending_payout:
        alerts.append({"level": "medium", "kind": "owner_payout", "count": len(pending_payout),
                       "amount": round(sum(p.amount or 0 for p in pending_payout), 2), "href": "payments"})
    for m in mgmt:
        if (m.status or "") == "active" and m.end_date and today <= m.end_date <= today + timedelta(days=60):
            alerts.append({"level": "medium", "kind": "mgmt_expiring", "ref": m.contract_number,
                           "days": (m.end_date - today).days, "href": "management-contracts"})
    # Expense spike: this month vs trailing 3-month average
    this_cost = cost_m[_month_key(first_this)]
    prev = [cost_m[_month_key(first_this - relativedelta(months=i))] for i in (1, 2, 3)]
    if mean(prev) > 0 and this_cost > 1.5 * mean(prev):
        alerts.append({"level": "medium", "kind": "expense_spike", "amount": round(this_cost, 2),
                       "baseline": round(mean(prev), 2), "href": "expenses"})
    order = {"high": 0, "medium": 1, "low": 2}
    try:
        from api.maintenance_models import WorkOrder
        wos = db.scalars(select(WorkOrder).where(WorkOrder.status.in_(["new", "assigned", "awaiting_approval", "approved", "in_progress"]))).all()
        waiting = [w for w in wos if w.status == "awaiting_approval"]
        if waiting:
            alerts.append({"level": "medium", "kind": "wo_approval", "count": len(waiting),
                           "amount": round(sum(w.estimate_amount or 0 for w in waiting), 2), "href": "maintenance"})
        now = datetime.utcnow()
        late = [w for w in wos if w.due_at and w.due_at < now and w.status != "awaiting_approval"]
        if late:
            alerts.append({"level": "high" if any(w.priority == "emergency" for w in late) else "medium",
                           "kind": "wo_overdue", "count": len(late), "href": "maintenance"})
    except Exception:  # maintenance module optional; never break the dashboard
        pass
    try:
        from api.renewal_models import LeaseRenewal
        rn = db.scalars(select(LeaseRenewal).where(LeaseRenewal.stage.in_(["due", "awaiting_owner"]))).all()
        cold = [r for r in rn if r.stage == "due" and (r.end_date - today).days <= 60]
        if cold:
            alerts.append({"level": "high" if any((r.end_date - today).days <= 30 for r in cold) else "medium",
                           "kind": "rn_no_contact", "count": len(cold), "href": "renewals"})
        waiting = [r for r in rn if r.stage == "awaiting_owner"]
        if waiting:
            alerts.append({"level": "medium", "kind": "rn_owner", "count": len(waiting), "href": "renewals"})
    except Exception:  # never break the dashboard
        pass
    alerts.sort(key=lambda a: (order[a["level"]], -(a.get("amount") or 0)))

    return {
        "as_of": today.isoformat(),
        "kpis": {
            "units": total_units, "occupied": occupied, "occupancy": occupancy,
            "vacant": len(vacant_units), "vacancy_loss_month": vacancy_loss_month,
            "active_contracts": len(active_contracts),
            "mtd_collected": mtd_collected, "mtd_expected": mtd_expected,
            "ytd_collected": ytd_collected, "ytd_expenses": ytd_expenses, "ytd_noi": round(ytd_collected - ytd_expenses, 2),
            "collection_rate": collection_rate, "overdue_amount": overdue_amount, "overdue_count": len(overdue),
            "expiring_90": len(expiring_90), "rent_at_risk": rent_at_risk,
            "on_time_pct": on_time_pct, "avg_days_late": avg_delay,
            "avg_rent": round(mean([u.rent_amount for u in units if u.rent_amount]), 2) if any(u.rent_amount for u in units) else 0,
            "owners": len(owners), "buildings": len(buildings), "top3_owner_share": top_share,
        },
        "cashflow": cashflow,
        "forecast": forecast,
        "aging": aging,
        "ladder": ladder,
        "buildings": per_building[:12],
        "concentration": concentration,
        "expense_mix": expense_mix,
        "underpriced": underpriced[:8],
        "alerts": alerts[:40],
    }
