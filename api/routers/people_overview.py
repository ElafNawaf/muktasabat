"""Staff overviews for the Owners and Agents pages (mirrors the Tenants overview).

* ``/owners/summary``        — every owner: portfolio, occupancy, rent roll, collections,
                               owner share, payouts (pending / late / sent), arrears, portal
* ``/owners/{id}/overview``  — one owner: profile, buildings, payment ledger with the money
                               split, 12-month trend, management contracts, portal access
* ``/agents/summary``        — every agent: linked owners, brokered leases, commission
* ``/agents/{id}/overview``  — one agent: owners, leases, commission schedule, 12-month trend

Money follows the owner-portal model (``owner_portal._rows``): owner share =
amount − management fee − agent fee − Ejar fee (first payment only).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from api.deps import DbSession
from api.models import Agent, AuditLog, Building, Contract, ManagementContract, Owner, OwnerUser, Payment, Unit
from api.permissions import Perm
from api.routers.entity_overview import ENDED, _active, _annual, _iso, _lease, _unit_status, r2
from api.routers.owner_portal import Row, _pct, _rows

router = APIRouter(tags=["overview"])


def _months(today: date, n: int = 12) -> list[str]:
    y, m = today.year, today.month
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out[::-1]


# ═══════════════════════════ owners ═══════════════════════════


def _owners(db: Session, owner_id: Optional[int] = None) -> list[Owner]:
    units = selectinload(Owner.buildings).selectinload(Building.units)
    q = select(Owner).options(
        selectinload(Owner.agent),
        selectinload(Owner.management_contracts),
        selectinload(Owner.buildings).selectinload(Building.images),
        units.selectinload(Unit.contracts).selectinload(Contract.payments),
        units.selectinload(Unit.contracts).selectinload(Contract.tenant),
    )
    if owner_id is not None:
        q = q.where(Owner.id == owner_id)
    return list(db.scalars(q.order_by(Owner.name)).all())


def _owner_portal(db: Session, ids: list[int]) -> dict[int, dict]:
    links = db.scalars(select(OwnerUser).where(OwnerUser.owner_id.in_(ids or [0])).options(selectinload(OwnerUser.user))).all()
    uids = [l.user_id for l in links]
    last = dict(
        db.execute(
            select(AuditLog.user_id, func.max(AuditLog.timestamp))
            .where(AuditLog.action == "login", AuditLog.user_id.in_(uids or [0]))
            .group_by(AuditLog.user_id)
        ).all()
    )
    out = {}
    for l in links:
        u = l.user
        out[l.owner_id] = {
            "has_account": u is not None,
            "active": bool(u and u.is_active_user),
            "username": u.username if u else None,
            "invite_pending": bool(u and u.password_reset_token and not last.get(u.id)),
            "last_login": last[u.id].isoformat() if u and last.get(u.id) else None,
        }
    return out


def _payout_state(r: Row, today: date) -> str:
    p = r.payment
    if (p.status or "") != "paid":
        return "not_paid"
    if p.owner_transferred_date:
        return "transferred"
    if p.owner_transfer_due_date and p.owner_transfer_due_date < today:
        return "late"
    return "pending"


def _mc_active(m: ManagementContract, today: date) -> bool:
    return (m.status or "active").lower() not in ENDED and m.start_date <= today <= m.end_date


def _owner_row(o: Owner, portal: Optional[dict], today: date) -> dict:
    year_ago = today - timedelta(days=365)
    counts = {"occupied": 0, "expiring": 0, "overdue": 0, "vacant": 0, "reserved": 0}
    rent_roll = 0.0
    n_units = 0
    for b in o.buildings:
        for u in b.units:
            n_units += 1
            st, c = _unit_status(u, today)
            counts[st] += 1
            if c is not None and st != "reserved":
                rent_roll += _annual(c)
    rows = _rows(o)
    paid12 = [r for r in rows if r.is_paid and r.payment.paid_date and r.payment.paid_date >= year_ago]
    states = [(r, _payout_state(r, today)) for r in rows]
    pending = [r for r, s in states if s == "pending"]
    late = [r for r, s in states if s == "late"]
    sent12 = [r for r, s in states if s == "transferred" and r.payment.owner_transferred_date >= year_ago]
    arrears = [r for r in rows if not r.is_paid and r.payment.due_date < today]
    occ = counts["occupied"] + counts["expiring"] + counts["overdue"]
    mcs = sorted(o.management_contracts, key=lambda m: m.end_date, reverse=True)
    mc = next((m for m in mcs if _mc_active(m, today)), None)
    next_payout = min((r.payment.owner_transfer_due_date for r in pending if r.payment.owner_transfer_due_date), default=None)
    if late:
        state = "payout_late"
    elif arrears:
        state = "arrears"
    elif not o.buildings:
        state = "no_property"
    elif n_units and occ / n_units < 0.7:
        state = "vacancy"
    else:
        state = "good"
    return {
        "id": o.id,
        "name": o.name,
        "name_en": o.name_en,
        "name_ar": o.name_ar,
        "type": o.owner_type,
        "phone": o.phone,
        "email": o.email,
        "national_id": o.national_id,
        "agent": None if o.agent is None else {"id": o.agent.id, "name": o.agent.name},
        "state": state,
        "buildings": len(o.buildings),
        "properties": [{"id": b.id, "name": b.name, "units": len(b.units)} for b in o.buildings][:4],
        "image": next((b.images[0].url for b in o.buildings if b.images), None),
        "units": n_units,
        "occupied": occ,
        "occupancy": round(100 * occ / n_units) if n_units else 0,
        "status_counts": counts,
        "annual_rent_roll": r2(rent_roll),
        "collected_12m": r2(sum(r.amount for r in paid12)),
        "fees_12m": r2(sum(r.fees for r in paid12)),
        "owner_share_12m": r2(sum(r.net for r in paid12)),
        "payout_pending": r2(sum(r.net for r in pending)),
        "payout_pending_count": len(pending),
        "payout_late": r2(sum(r.net for r in late)),
        "payout_late_count": len(late),
        "payout_sent_12m": r2(sum(r.net for r in sent12)),
        "next_payout": _iso(next_payout),
        "arrears": r2(sum(r.amount for r in arrears)),
        "arrears_count": len(arrears),
        "management": None if mc is None else {
            "id": mc.id, "number": mc.contract_number, "end_date": mc.end_date.isoformat(),
            "days_left": (mc.end_date - today).days, "fee_type": mc.fee_type, "fee_percentage": mc.fee_percentage,
        },
        "portal": portal or {"has_account": False, "active": False},
    }


@router.get("/owners/summary")
def owners_summary(db: DbSession, _user: Perm("owners", "view")):
    today = date.today()
    os_ = _owners(db)
    portal = _owner_portal(db, [o.id for o in os_])
    return [_owner_row(o, portal.get(o.id), today) for o in os_]


@router.get("/owners/{owner_id}/overview")
def owner_overview(owner_id: int, db: DbSession, _user: Perm("owners", "view")):
    rows_ = _owners(db, owner_id)
    if not rows_:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Owner not found")
    o = rows_[0]
    today = date.today()
    row = _owner_row(o, _owner_portal(db, [o.id]).get(o.id), today)

    buildings = []
    for b in o.buildings:
        counts = {"occupied": 0, "expiring": 0, "overdue": 0, "vacant": 0, "reserved": 0}
        roll = 0.0
        for u in b.units:
            st, c = _unit_status(u, today)
            counts[st] += 1
            if c is not None and st != "reserved":
                roll += _annual(c)
        n = len(b.units)
        occ = counts["occupied"] + counts["expiring"] + counts["overdue"]
        buildings.append({
            "id": b.id, "name": b.name, "name_en": b.name_en, "property_type": b.property_type,
            "city": b.city, "city_en": b.city_en, "city_ar": b.city_ar,
            "district": b.district, "district_en": b.district_en, "district_ar": b.district_ar,
            "image": b.images[0].url if b.images else None, "units": n, "occupied": occ,
            "occupancy": round(100 * occ / n) if n else 0, "status_counts": counts, "annual_rent_roll": r2(roll),
        })

    rows = sorted(_rows(o), key=lambda r: (r.payment.due_date, r.payment.id))
    ledger = []
    for r in rows:
        p = r.payment
        if p.due_date > today + timedelta(days=60) and not r.is_paid:
            continue
        ledger.append({
            "id": p.id, "due_date": p.due_date.isoformat(), "paid_date": _iso(p.paid_date),
            "building": r.building.name, "building_id": r.building.id, "unit": r.unit.number,
            "tenant": r.contract.tenant.name if r.contract.tenant else None, "contract_id": r.contract.id,
            "amount": r2(r.amount), "mgmt": r2(r.mgmt), "agent": r2(r.agent), "ejar": r2(r.ejar), "net": r2(r.net),
            "collect": "paid" if r.is_paid else ("overdue" if p.due_date < today else "upcoming"),
            "payout": _payout_state(r, today), "payout_due": _iso(p.owner_transfer_due_date),
            "payout_date": _iso(p.owner_transferred_date), "payout_ref": p.owner_transfer_reference,
        })
    ledger = ledger[::-1][:60]

    months = _months(today)
    trend = {m: {"month": m, "collected": 0.0, "net": 0.0, "sent": 0.0} for m in months}
    for r in rows:
        p = r.payment
        if r.is_paid and p.paid_date:
            k = p.paid_date.strftime("%Y-%m")
            if k in trend:
                trend[k]["collected"] += r.amount
                trend[k]["net"] += r.net
        if p.owner_transferred_date:
            k = p.owner_transferred_date.strftime("%Y-%m")
            if k in trend:
                trend[k]["sent"] += r.net
    leases = []
    for b in o.buildings:
        for u in b.units:
            for c in u.contracts:
                if _active(c, today):
                    leases.append({
                        "id": c.id, "building": b.name, "building_id": b.id, "unit": u.number,
                        "tenant": c.tenant.name if c.tenant else None, "tenant_id": c.tenant_id,
                        "end_date": c.end_date.isoformat(), "days_left": (c.end_date - today).days, "annual_rent": r2(_annual(c)),
                    })
    leases.sort(key=lambda x: x["days_left"])
    return {
        **row,
        "id_type": o.id_type, "id_expiry_date": _iso(o.id_expiry_date), "date_of_birth": _iso(o.date_of_birth),
        "nationality": o.nationality, "national_address": o.national_address, "cr_number": o.cr_number,
        "representative_name": o.representative_name, "representative_phone": o.representative_phone,
        "bank_name": o.bank_name, "iban": o.iban, "absher_phone": o.absher_phone, "notes": o.notes,
        "buildings_detail": buildings,
        "ledger": ledger,
        "trend": [{**v, "collected": r2(v["collected"]), "net": r2(v["net"]), "sent": r2(v["sent"])} for v in trend.values()],
        "leases": leases,
        "management_contracts": [
            {"id": m.id, "number": m.contract_number, "start_date": m.start_date.isoformat(), "end_date": m.end_date.isoformat(),
             "status": m.status, "active": _mc_active(m, today), "fee_type": m.fee_type, "fee_percentage": m.fee_percentage,
             "fee_fixed_amount": m.fee_fixed_amount, "payout_cycle_months": m.payout_cycle_months}
            for m in sorted(o.management_contracts, key=lambda m: m.start_date, reverse=True)
        ],
    }


# ═══════════════════════════ agents ═══════════════════════════


def _agent_contracts(db: Session, ids: list[int]) -> dict[int, list[Contract]]:
    out: dict[int, list[Contract]] = {i: [] for i in ids}
    if not ids:
        return out
    for c in db.scalars(
        select(Contract)
        .where(Contract.agent_id.in_(ids))
        .options(
            selectinload(Contract.payments),
            selectinload(Contract.tenant),
            selectinload(Contract.unit).selectinload(Unit.building).selectinload(Building.owner),
        )
    ).all():
        if (c.status or "").lower() != "draft":
            out[c.agent_id].append(c)
    return out


def _commission(c: Contract, p: Payment) -> float:
    return float(p.amount or 0) * _pct(c.agent_percentage, c.unit.agent_percentage if c.unit else 0) / 100


def _agent_row(a: Agent, cs: list[Contract], today: date) -> dict:
    year_ago = today - timedelta(days=365)
    earned = pending = overdue = 0.0
    for c in cs:
        for p in c.payments:
            v = _commission(c, p)
            if p.status == "paid":
                if p.paid_date and p.paid_date >= year_ago:
                    earned += v
            elif p.due_date < today:
                overdue += v
            else:
                pending += v
    active = [c for c in cs if _active(c, today)]
    expiring = [c for c in active if (c.end_date - today).days <= 60]
    units = {c.unit_id for c in active}
    owners_ids = {o.id for o in a.owners} | {c.unit.building.owner_id for c in cs if c.unit and c.unit.building and c.unit.building.owner_id}
    last = max((c.start_date for c in cs), default=None)
    if expiring:
        state = "expiring"
    elif active:
        state = "active"
    elif cs:
        state = "idle"
    else:
        state = "new"
    return {
        "id": a.id,
        "name": a.name,
        "name_en": a.name_en,
        "name_ar": a.name_ar,
        "phone": a.phone,
        "email": a.email,
        "national_id": a.national_id,
        "state": state,
        "owners": len(owners_ids),
        "owner_list": [{"id": o.id, "name": o.name} for o in a.owners][:4],
        "leases_total": len(cs),
        "leases_active": len(active),
        "leases_expiring": len(expiring),
        "units_active": len(units),
        "rent_brokered": r2(sum(_annual(c) for c in active)),
        "commission_12m": r2(earned),
        "commission_pending": r2(pending),
        "commission_overdue": r2(overdue),
        "avg_rate": round(sum(_pct(c.agent_percentage, c.unit.agent_percentage if c.unit else 0) for c in cs) / len(cs), 2) if cs else 0,
        "last_deal": _iso(last),
    }


@router.get("/agents/summary")
def agents_summary(db: DbSession, _user: Perm("agents", "view")):
    today = date.today()
    ags = list(db.scalars(select(Agent).options(selectinload(Agent.owners)).order_by(Agent.name)).all())
    cs = _agent_contracts(db, [a.id for a in ags])
    return [_agent_row(a, cs.get(a.id, []), today) for a in ags]


@router.get("/agents/{agent_id}/overview")
def agent_overview(agent_id: int, db: DbSession, _user: Perm("agents", "view")):
    a = db.scalar(
        select(Agent).where(Agent.id == agent_id).options(selectinload(Agent.owners).selectinload(Owner.buildings).selectinload(Building.units))
    )
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
    today = date.today()
    cs = _agent_contracts(db, [a.id])[a.id]
    row = _agent_row(a, cs, today)
    months = _months(today)
    trend = {m: {"month": m, "earned": 0.0} for m in months}
    schedule = []
    for c in cs:
        for p in c.payments:
            v = _commission(c, p)
            if p.status == "paid" and p.paid_date:
                k = p.paid_date.strftime("%Y-%m")
                if k in trend:
                    trend[k]["earned"] += v
            if p.status != "paid" or (p.paid_date and p.paid_date >= today - timedelta(days=120)):
                schedule.append({
                    "id": p.id, "due_date": p.due_date.isoformat(), "paid_date": _iso(p.paid_date),
                    "tenant": c.tenant.name if c.tenant else None,
                    "building": c.unit.building.name if c.unit and c.unit.building else None,
                    "unit": c.unit.number if c.unit else None, "amount": r2(p.amount), "commission": r2(v),
                    "state": "paid" if p.status == "paid" else ("overdue" if p.due_date < today else "upcoming"),
                })
    schedule.sort(key=lambda x: x["due_date"])
    upcoming = [s for s in schedule if s["state"] != "paid"][:30]
    recent = [s for s in schedule if s["state"] == "paid"][-20:][::-1]
    owners = []
    for o in a.owners:
        n = sum(len(b.units) for b in o.buildings)
        owners.append({"id": o.id, "name": o.name, "name_en": o.name_en, "phone": o.phone, "buildings": len(o.buildings), "units": n})
    leases = []
    for c in sorted(cs, key=lambda c: c.start_date, reverse=True):
        b = c.unit.building if c.unit else None
        pct = _pct(c.agent_percentage, c.unit.agent_percentage if c.unit else 0)
        leases.append({
            "id": c.id, "contract_number": c.contract_number, "tenant": c.tenant.name if c.tenant else None, "tenant_id": c.tenant_id,
            "building": b.name if b else None, "building_id": b.id if b else None, "unit": c.unit.number if c.unit else None,
            "owner": b.owner.name if b and b.owner else None, "owner_id": b.owner_id if b else None,
            "start_date": c.start_date.isoformat(), "end_date": c.end_date.isoformat(), "days_left": (c.end_date - today).days,
            "active": _active(c, today), "lease": _lease(c), "contract_type": c.contract_type, "annual_rent": r2(_annual(c)), "rate": pct,
            "commission_total": r2(sum(_commission(c, p) for p in c.payments)),
            "commission_paid": r2(sum(_commission(c, p) for p in c.payments if p.status == "paid")),
        })
    return {
        **row,
        "bank_name": a.bank_name,
        "iban": a.iban,
        "notes": a.notes,
        "created_at": _iso(a.created_at.date() if a.created_at else None),
        "owners_detail": owners,
        "leases": leases,
        "trend": [{**v, "earned": r2(v["earned"])} for v in trend.values()],
        "upcoming": upcoming,
        "recent": recent,
    }
