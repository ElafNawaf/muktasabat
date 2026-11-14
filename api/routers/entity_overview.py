"""Staff overviews for the Properties and Tenants pages.

One request per screen, everything pre-computed:

* ``/buildings/summary``       — every building with occupancy, rent roll, 12-month collections, arrears, expiring leases
* ``/buildings/{id}/overview`` — one building: units (status from *leases*, not the stale ``is_available`` flag),
                                 leases, payments, expenses, work orders
* ``/tenants/summary``         — every tenant with leases, balance, next due date, punctuality, portal status
* ``/tenants/{id}/overview``   — one tenant: profile, leases with schedules, payment history, reports

Occupancy rule: a unit is occupied when it has a lease (not a management
contract) whose status isn't ended and whose term covers today.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from api.deps import DbSession
from api.maintenance_models import WorkOrder
from api.models import Building, Contract, Expense, Payment, Tenant, Unit
from api.permissions import Perm
from api.tenant_portal_models import PaymentReport, TenantUser

router = APIRouter(tags=["overview"])

ENDED = {"terminated", "cancelled", "canceled", "expired", "draft"}
LEASES = {"residential", "commercial"}
OPEN_WO = {"new", "assigned", "awaiting_approval", "approved", "scheduled", "in_progress"}


def r2(x) -> float:
    return round(float(x or 0), 2)


def _iso(d) -> Optional[str]:
    return d.isoformat() if d else None


def _lease(c: Contract) -> bool:
    return (c.contract_type or "residential") in LEASES


def _active(c: Contract, on: date) -> bool:
    return _lease(c) and (c.status or "active").lower() not in ENDED and c.start_date <= on <= c.end_date


def _annual(c: Contract) -> float:
    """Annual rent: the contract's own figure, else its total spread over a year."""
    if c.rent_amount:
        return float(c.rent_amount)
    days = max((c.end_date - c.start_date).days + 1, 1)
    return float(c.total_rent_amount or 0) * 365 / days


def _pay_state(p: Payment, today: date) -> str:
    if (p.status or "") == "paid":
        return "paid"
    if p.due_date < today:
        return "overdue"
    if p.due_date <= today + timedelta(days=14):
        return "due_soon"
    return "upcoming"


def _on_time(pays: list[Payment]) -> Optional[float]:
    paid = [p for p in pays if p.status == "paid" and p.paid_date]
    if not paid:
        return None
    ok = sum(1 for p in paid if p.paid_date <= p.due_date + timedelta(days=3))
    return round(100 * ok / len(paid))


def _buildings(db: Session, building_id: Optional[int] = None) -> list[Building]:
    q = select(Building).options(
        selectinload(Building.owner),
        selectinload(Building.assignee),
        selectinload(Building.images),
        selectinload(Building.units).selectinload(Unit.contracts).selectinload(Contract.payments),
        selectinload(Building.units).selectinload(Unit.contracts).selectinload(Contract.tenant),
    )
    if building_id is not None:
        q = q.where(Building.id == building_id)
    return list(db.scalars(q.order_by(Building.name)).all())


def _unit_status(u: Unit, today: date) -> tuple[str, Optional[Contract]]:
    """occupied · expiring (≤60 d) · overdue · vacant · reserved (future lease only)"""
    cur = next((c for c in u.contracts if _active(c, today)), None)
    if cur is None:
        future = next((c for c in u.contracts if _lease(c) and (c.status or "").lower() not in ENDED and c.start_date > today), None)
        return ("reserved", future) if future else ("vacant", None)
    if any(p.status != "paid" and p.due_date < today for p in cur.payments):
        return "overdue", cur
    if (cur.end_date - today).days <= 60:
        return "expiring", cur
    return "occupied", cur


def _who(u) -> Optional[str]:
    if u is None:
        return None
    return getattr(u, "full_name", None) or u.username


# ═══════════════════════════ buildings ═══════════════════════════


@router.get("/buildings/summary")
def buildings_summary(db: DbSession, _user: Perm("properties", "view")):
    today = date.today()
    year_ago = today - timedelta(days=365)
    wo_open: dict[int, int] = {}
    for (bid,) in db.execute(select(WorkOrder.building_id).where(WorkOrder.status.in_(OPEN_WO))).all():
        wo_open[bid] = wo_open.get(bid, 0) + 1
    out = []
    for b in _buildings(db):
        counts = {"occupied": 0, "expiring": 0, "overdue": 0, "vacant": 0, "reserved": 0}
        rent_roll = collected = overdue = 0.0
        overdue_n = 0
        for u in b.units:
            st, c = _unit_status(u, today)
            counts[st] += 1
            if c is not None and st != "reserved":
                rent_roll += _annual(c)
            for k in u.contracts:
                if not _lease(k):
                    continue
                for p in k.payments:
                    if p.status == "paid" and p.paid_date and p.paid_date >= year_ago:
                        collected += float(p.amount or 0)
                    elif p.status != "paid" and p.due_date < today:
                        overdue += float(p.amount or 0)
                        overdue_n += 1
        n = len(b.units)
        occ = counts["occupied"] + counts["expiring"] + counts["overdue"]
        out.append(
            {
                "id": b.id,
                "name": b.name,
                "name_en": b.name_en,
                "property_type": b.property_type,
                "contract_type": b.contract_type,
                "city": b.city,
                "district": b.district,
                "owner": {"id": b.owner.id, "name": b.owner.name} if b.owner else None,
                "assignee": _who(b.assignee),
                "image": b.images[0].url if b.images else None,
                "units": n,
                "occupied": occ,
                "occupancy": round(100 * occ / n) if n else 0,
                "status_counts": counts,
                "annual_rent_roll": r2(rent_roll),
                "collected_12m": r2(collected),
                "overdue_amount": r2(overdue),
                "overdue_count": overdue_n,
                "open_work_orders": wo_open.get(b.id, 0),
            }
        )
    return out


@router.get("/buildings/{building_id}/overview")
def building_overview(building_id: int, db: DbSession, _user: Perm("properties", "view")):
    rows = _buildings(db, building_id)
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Building not found")
    b = rows[0]
    today = date.today()
    year_ago = today - timedelta(days=365)
    units, leases, payments = [], [], []
    rent_roll = collected = overdue = upcoming = 0.0
    for u in sorted(b.units, key=lambda u: (u.number or "")):
        st, cur = _unit_status(u, today)
        if cur is not None and st != "reserved":
            rent_roll += _annual(cur)
        nxt = None
        u_over = 0.0
        if cur is not None:
            unpaid = sorted((p for p in cur.payments if p.status != "paid"), key=lambda p: p.due_date)
            nxt = unpaid[0] if unpaid else None
            u_over = sum(float(p.amount or 0) for p in unpaid if p.due_date < today)
        last_end = max((c.end_date for c in u.contracts if _lease(c) and c.end_date < today), default=None)
        units.append(
            {
                "id": u.id,
                "number": u.number,
                "type": u.unit_type,
                "usage": u.usage_type,
                "area_sqm": u.area_sqm,
                "rooms": u.rooms_count,
                "bathrooms": u.bathrooms_count,
                "furnished": u.is_furnished,
                "listed_rent": r2(u.rent_amount),
                "electric_meter": u.electric_invoice,
                "water_meter": u.water_invoice,
                "status": st,
                "vacant_days": (today - last_end).days if st == "vacant" and last_end else None,
                "lease": None if cur is None else {
                    "id": cur.id,
                    "contract_number": cur.contract_number,
                    "start_date": cur.start_date.isoformat(),
                    "end_date": cur.end_date.isoformat(),
                    "days_left": (cur.end_date - today).days,
                    "annual_rent": r2(_annual(cur)),
                    "payment_type": cur.payment_type,
                    "ejar_status": cur.ejar_status,
                    "paid": sum(1 for p in cur.payments if p.status == "paid"),
                    "total": len(cur.payments),
                },
                "tenant": None if cur is None or cur.tenant is None else {
                    "id": cur.tenant.id, "name": cur.tenant.name, "phone": cur.tenant.phone,
                },
                "next_due": None if nxt is None else {"date": nxt.due_date.isoformat(), "amount": r2(nxt.amount), "state": _pay_state(nxt, today)},
                "overdue": r2(u_over),
            }
        )
        for c in u.contracts:
            if not _lease(c):
                continue
            pays = sorted(c.payments, key=lambda p: p.due_date)
            leases.append(
                {
                    "id": c.id, "contract_number": c.contract_number, "unit": u.number, "unit_id": u.id,
                    "tenant": c.tenant.name if c.tenant else None, "tenant_id": c.tenant_id,
                    "start_date": c.start_date.isoformat(), "end_date": c.end_date.isoformat(),
                    "active": _active(c, today), "status": c.status, "annual_rent": r2(_annual(c)),
                    "paid_amount": r2(sum(float(p.amount or 0) for p in pays if p.status == "paid")),
                    "total_amount": r2(sum(float(p.amount or 0) for p in pays)),
                    "ejar_status": c.ejar_status,
                }
            )
            for p in pays:
                stt = _pay_state(p, today)
                if p.status == "paid" and p.paid_date and p.paid_date >= year_ago:
                    collected += float(p.amount or 0)
                if stt == "overdue":
                    overdue += float(p.amount or 0)
                if stt in ("due_soon", "upcoming") and p.due_date <= today + timedelta(days=90):
                    upcoming += float(p.amount or 0)
                if (p.paid_date or p.due_date) >= year_ago - timedelta(days=1) and p.due_date <= today + timedelta(days=180):
                    payments.append(
                        {
                            "id": p.id, "unit": u.number, "tenant": c.tenant.name if c.tenant else None,
                            "contract_number": c.contract_number, "due_date": p.due_date.isoformat(),
                            "paid_date": _iso(p.paid_date), "amount": r2(p.amount), "state": stt,
                            "method": p.payment_method, "receipt": p.receipt_number,
                        }
                    )
    leases.sort(key=lambda x: (not x["active"], x["end_date"]))
    payments.sort(key=lambda x: x["due_date"], reverse=True)

    months = []
    for i in range(11, -1, -1):
        y, mo = today.year, today.month - i
        while mo <= 0:
            mo += 12
            y -= 1
        months.append({"key": f"{y}-{mo:02d}", "collected": 0.0, "due": 0.0})
    idx = {m["key"]: m for m in months}
    for p in payments:
        k = (p["paid_date"] or "")[:7]
        if p["state"] == "paid" and k in idx:
            idx[k]["collected"] += p["amount"]
        kd = p["due_date"][:7]
        if kd in idx:
            idx[kd]["due"] += p["amount"]

    expenses = db.scalars(
        select(Expense).where(Expense.building_id == b.id, Expense.expense_date >= year_ago).order_by(Expense.expense_date.desc())
    ).all()
    unit_no = {u.id: u.number for u in b.units}
    work = db.scalars(select(WorkOrder).where(WorkOrder.building_id == b.id).order_by(WorkOrder.created_at.desc()).limit(40)).all()
    counts = {"occupied": 0, "expiring": 0, "overdue": 0, "vacant": 0, "reserved": 0}
    for u in units:
        counts[u["status"]] += 1
    occ = counts["occupied"] + counts["expiring"] + counts["overdue"]
    n = len(units)
    return {
        "id": b.id,
        "name": b.name,
        "name_en": b.name_en,
        "property_type": b.property_type,
        "residence_type": b.residence_type,
        "contract_type": b.contract_type,
        "building_code": b.building_code,
        "city": b.city, "district": b.district, "street": b.street,
        "national_address": b.national_address, "postal_code": b.postal_code, "building_number": b.building_number,
        "additional_number": b.additional_number, "address": b.address,
        "lat": b.latitude, "lng": b.longitude,
        "deed_number": b.deed_number, "deed_date": _iso(b.deed_date), "deed_document_type": b.deed_document_type,
        "ejar_property_id": b.ejar_property_id,
        "water_meter": b.water_meter_number, "electricity_meter": b.electricity_meter_number,
        "notes": b.notes,
        "owner": None if b.owner is None else {"id": b.owner.id, "name": b.owner.name, "phone": b.owner.phone, "email": b.owner.email},
        "assignee": _who(b.assignee),
        "images": [i.url for i in b.images][:12],
        "kpis": {
            "units": n,
            "occupied": occ,
            "occupancy": round(100 * occ / n) if n else 0,
            "status_counts": counts,
            "annual_rent_roll": r2(rent_roll),
            "potential_rent": r2(sum(u["listed_rent"] for u in units if u["status"] == "vacant")),
            "collected_12m": r2(collected),
            "overdue": r2(overdue),
            "due_90d": r2(upcoming),
            "expenses_12m": r2(sum(float(e.amount or 0) for e in expenses)),
            "open_work_orders": sum(1 for w in work if w.status in OPEN_WO),
        },
        "months": [{**m, "collected": r2(m["collected"]), "due": r2(m["due"])} for m in months],
        "units": units,
        "leases": leases,
        "payments": payments[:80],
        "expenses": [
            {"id": e.id, "date": e.expense_date.isoformat(), "category": e.category, "description": e.description,
             "unit": unit_no.get(e.unit_id), "vendor": e.vendor_name, "amount": r2(e.amount), "paid_by": e.paid_by}
            for e in expenses
        ],
        "work_orders": [
            {"id": w.id, "number": w.number, "title": w.title, "status": w.status, "priority": w.priority,
             "unit": unit_no.get(w.unit_id), "created_at": w.created_at.isoformat(), "cost": r2(w.actual_cost or w.estimate_amount)}
            for w in work
        ],
    }


# ═══════════════════════════ tenants ═══════════════════════════


def _tenants(db: Session, tenant_id: Optional[int] = None) -> list[Tenant]:
    q = select(Tenant)
    if tenant_id is not None:
        q = q.where(Tenant.id == tenant_id)
    return list(db.scalars(q.order_by(Tenant.name)).all())


def _tenant_contracts(db: Session, ids: list[int]) -> dict[int, list[Contract]]:
    out: dict[int, list[Contract]] = {i: [] for i in ids}
    if not ids:
        return out
    for c in db.scalars(
        select(Contract)
        .where(Contract.tenant_id.in_(ids))
        .options(selectinload(Contract.payments), selectinload(Contract.unit).selectinload(Unit.building))
    ).all():
        if _lease(c) and (c.status or "").lower() != "draft":
            out[c.tenant_id].append(c)
    return out


def _portal(db: Session, ids: list[int]) -> dict[int, dict]:
    out = {}
    for l in db.scalars(select(TenantUser).where(TenantUser.tenant_id.in_(ids or [0])).options(selectinload(TenantUser.user))).all():
        out[l.tenant_id] = {"has_account": True, "active": bool(l.user and l.user.is_active_user)}
    return out


def _tenant_row(t: Tenant, cs: list[Contract], portal: Optional[dict], today: date) -> dict:
    pays = [p for c in cs for p in c.payments]
    unpaid = sorted((p for p in pays if p.status != "paid"), key=lambda p: p.due_date)
    over = [p for p in unpaid if p.due_date < today]
    active = [c for c in cs if _active(c, today)]
    soonest_end = min((c.end_date for c in active), default=None)
    if over:
        state = "late"
    elif active and soonest_end and (soonest_end - today).days <= 60:
        state = "expiring"
    elif active:
        state = "good"
    elif any(c.start_date > today for c in cs):
        state = "upcoming"
    else:
        state = "no_lease"
    nxt = unpaid[0] if unpaid else None
    return {
        "id": t.id,
        "name": t.name,
        "name_en": t.name_en,
        "type": t.tenant_type,
        "phone": t.phone,
        "email": t.email,
        "national_id": t.national_id,
        "nationality": t.nationality,
        "state": state,
        "active_leases": len(active),
        "units": [
            {"building_id": c.unit.building.id if c.unit and c.unit.building else None,
             "building": c.unit.building.name if c.unit and c.unit.building else None,
             "unit": c.unit.number if c.unit else None, "contract_id": c.id}
            for c in (active or cs[:1])
        ],
        "annual_rent": r2(sum(_annual(c) for c in active)),
        "paid_total": r2(sum(float(p.amount or 0) for p in pays if p.status == "paid")),
        "outstanding": r2(sum(float(p.amount or 0) for p in unpaid)),
        "overdue_amount": r2(sum(float(p.amount or 0) for p in over)),
        "overdue_count": len(over),
        "max_days_late": max(((today - p.due_date).days for p in over), default=0),
        "next_due": None if nxt is None else {"date": nxt.due_date.isoformat(), "amount": r2(nxt.amount), "days": (nxt.due_date - today).days},
        "on_time_rate": _on_time(pays),
        "lease_end": _iso(soonest_end),
        "portal": portal or {"has_account": False, "active": False},
    }


@router.get("/tenants/summary")
def tenants_summary(db: DbSession, _user: Perm("tenants", "view")):
    today = date.today()
    ts = _tenants(db)
    ids = [t.id for t in ts]
    cs = _tenant_contracts(db, ids)
    portal = _portal(db, ids)
    return [_tenant_row(t, cs.get(t.id, []), portal.get(t.id), today) for t in ts]


@router.get("/tenants/{tenant_id}/overview")
def tenant_overview(tenant_id: int, db: DbSession, _user: Perm("tenants", "view")):
    ts = _tenants(db, tenant_id)
    if not ts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    t = ts[0]
    today = date.today()
    cs = _tenant_contracts(db, [t.id])[t.id]
    row = _tenant_row(t, cs, _portal(db, [t.id]).get(t.id), today)
    reports = db.scalars(select(PaymentReport).where(PaymentReport.tenant_id == t.id).order_by(PaymentReport.created_at.desc())).all()
    leases = []
    history = []
    for c in sorted(cs, key=lambda c: c.start_date, reverse=True):
        pays = sorted(c.payments, key=lambda p: p.due_date)
        b = c.unit.building if c.unit else None
        leases.append(
            {
                "id": c.id, "contract_number": c.contract_number, "ejar_contract_number": c.ejar_contract_number,
                "building_id": b.id if b else None, "building": b.name if b else None, "unit": c.unit.number if c.unit else None,
                "start_date": c.start_date.isoformat(), "end_date": c.end_date.isoformat(), "days_left": (c.end_date - today).days,
                "active": _active(c, today), "status": c.status, "annual_rent": r2(_annual(c)), "payment_type": c.payment_type,
                "ejar_status": c.ejar_status,
                "schedule": [
                    {"id": p.id, "due_date": p.due_date.isoformat(), "paid_date": _iso(p.paid_date), "amount": r2(p.amount),
                     "state": _pay_state(p, today), "method": p.payment_method, "receipt": p.receipt_number,
                     "days_late": ((p.paid_date or today) - p.due_date).days if (p.paid_date or today) > p.due_date else 0}
                    for p in pays
                ],
            }
        )
        history += leases[-1]["schedule"]
    history.sort(key=lambda p: p["due_date"])
    return {
        **row,
        "date_of_birth": _iso(t.date_of_birth),
        "id_type": t.id_type,
        "id_expiry_date": _iso(t.id_expiry_date),
        "national_address": t.national_address,
        "cr_number": t.cr_number,
        "tax_number": t.tax_number,
        "representative_name": t.representative_name,
        "leases": leases,
        "punctuality": [
            {"due_date": p["due_date"], "days_late": p["days_late"], "state": p["state"], "amount": p["amount"]}
            for p in history if p["state"] in ("paid", "overdue")
        ][-18:],
        "reports": [
            {"id": r.id, "status": r.status, "paid_on": r.paid_on.isoformat(), "amount": r2(r.amount), "method": r.method,
             "reference": r.reference, "sent_at": r.created_at.isoformat(), "review_note": r.review_note}
            for r in reports[:20]
        ],
    }
