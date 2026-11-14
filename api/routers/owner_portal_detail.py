"""Owner portal — detail views for full transparency.

Builds on the money model in ``owner_portal.py`` (same fee maths, same
scoping). Adds, per instalment, the whole chain an owner cares about:

    due → tenant paid (date, method, receipt) → fees deducted → owner share
        → transfer due date → transferred (date, bank reference)

plus a property page, a lease page with its full schedule, and an activity
timeline across everything we do for the owner.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from api.i18n import localized_value
from api.maintenance_models import WorkOrder
from api.models import Expense
from api.routers.owner_portal import (
    LocaleDep,
    Row,
    ScopedOwner,
    _deductible,
    _is_active,
    _is_lease,
    _name,
    _owner_expenses,
    _rows,
    r2,
)
from api.deps import DbSession
from api.tenant_portal_models import PaymentReport

router = APIRouter(prefix="/owner-portal", tags=["owner-portal"])


def _transfer_state(r: Row, today: date) -> str:
    """not_paid · pending · late · transferred"""
    p = r.payment
    if not r.is_paid:
        return "not_paid"
    if p.owner_transferred_date:
        return "transferred"
    if p.owner_transfer_due_date and p.owner_transfer_due_date < today:
        return "late"
    return "pending"


def _collect_state(r: Row, today: date, reported: set[int]) -> str:
    """paid · reported · overdue · due_soon · upcoming"""
    p = r.payment
    if r.is_paid:
        return "paid"
    if p.id in reported:
        return "reported"
    if p.due_date < today:
        return "overdue"
    if p.due_date <= today + timedelta(days=14):
        return "due_soon"
    return "upcoming"


def _reported_ids(db, payment_ids: list[int]) -> set[int]:
    if not payment_ids:
        return set()
    return set(
        db.scalars(
            select(PaymentReport.payment_id).where(
                PaymentReport.payment_id.in_(payment_ids), PaymentReport.status == "pending"
            )
        ).all()
    )


def _row_json(r: Row, today: date, reported: set[int], locale) -> dict:
    p = r.payment
    c = r.contract
    pays = sorted(c.payments, key=lambda x: (x.due_date, x.id))
    return {
        "id": p.id,
        "contract_id": c.id,
        "contract_number": c.contract_number,
        "building_id": r.building.id,
        "building": _name(r.building, locale),
        "unit_id": r.unit.id,
        "unit": r.unit.number,
        "tenant": localized_value(c.tenant, "name", locale) if c.tenant else None,
        "seq": pays.index(p) + 1,
        "of": len(pays),
        "due_date": p.due_date.isoformat(),
        "days": (p.due_date - today).days,
        "status": _collect_state(r, today, reported),
        "paid_date": p.paid_date.isoformat() if p.paid_date else None,
        "method": p.payment_method,
        "receipt": p.receipt_number,
        "amount": r2(r.amount),
        "management_fee": r2(r.mgmt),
        "agent_fee": r2(r.agent),
        "ejar_fee": r2(r.ejar),
        "fees": r2(r.fees),
        "net": r2(r.net),
        "transfer": {
            "state": _transfer_state(r, today),
            "due_date": p.owner_transfer_due_date.isoformat() if p.owner_transfer_due_date else None,
            "date": p.owner_transferred_date.isoformat() if p.owner_transferred_date else None,
            "reference": p.owner_transfer_reference,
        },
    }


@router.get("/ledger")
def ledger(
    owner: ScopedOwner,
    db: DbSession,
    locale: LocaleDep,
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    building_id: Optional[int] = Query(default=None, ge=1),
    contract_id: Optional[int] = Query(default=None, ge=1),
):
    """Every instalment with collection, fee and payout status."""
    today = date.today()
    rows = [
        r for r in _rows(owner)
        if (year is None or r.payment.due_date.year == year)
        and (building_id is None or r.building.id == building_id)
        and (contract_id is None or r.contract.id == contract_id)
    ]
    reported = _reported_ids(db, [r.payment.id for r in rows])
    items = sorted((_row_json(r, today, reported, locale) for r in rows), key=lambda x: (x["due_date"], x["id"]))
    paid = [i for i in items if i["status"] == "paid"]
    return {
        "as_of": today.isoformat(),
        "items": items,
        "totals": {
            "due": r2(sum(i["amount"] for i in items)),
            "collected": r2(sum(i["amount"] for i in paid)),
            "outstanding": r2(sum(i["amount"] for i in items if i["status"] in ("overdue", "reported"))),
            "upcoming": r2(sum(i["amount"] for i in items if i["status"] in ("due_soon", "upcoming"))),
            "fees": r2(sum(i["fees"] for i in paid)),
            "owner_share": r2(sum(i["net"] for i in paid)),
            "transferred": r2(sum(i["net"] for i in paid if i["transfer"]["state"] == "transferred")),
            "awaiting_transfer": r2(sum(i["net"] for i in paid if i["transfer"]["state"] in ("pending", "late"))),
            "late_transfers": sum(1 for i in paid if i["transfer"]["state"] == "late"),
        },
        "buildings": [{"id": b.id, "name": _name(b, locale)} for b in owner.buildings],
    }


@router.get("/properties/{building_id}")
def property_detail(building_id: int, owner: ScopedOwner, db: DbSession, locale: LocaleDep):
    b = next((b for b in owner.buildings if b.id == building_id), None)
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Property not found")
    today = date.today()
    rows = [r for r in _rows(owner) if r.building.id == b.id]
    reported = _reported_ids(db, [r.payment.id for r in rows])

    units = []
    for u in sorted(b.units, key=lambda u: (u.number or "")):
        leases = sorted((c for c in u.contracts if _is_lease(c)), key=lambda c: c.start_date, reverse=True)
        cur = next((c for c in leases if _is_active(c, today)), None)
        u_rows = [r for r in rows if r.unit.id == u.id]
        nxt = min((r for r in u_rows if not r.is_paid and r.contract is cur), key=lambda r: r.payment.due_date, default=None)
        last_end = max((c.end_date for c in leases if c.end_date < today), default=None)
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
                "occupied": cur is not None,
                "vacant_days": (today - last_end).days if cur is None and last_end else None,
                "lease": None if cur is None else {
                    "id": cur.id,
                    "contract_number": cur.contract_number,
                    "tenant": localized_value(cur.tenant, "name", locale) if cur.tenant else None,
                    "start_date": cur.start_date.isoformat(),
                    "end_date": cur.end_date.isoformat(),
                    "days_left": (cur.end_date - today).days,
                    "annual_rent": r2(cur.rent_amount),
                    "ejar_status": cur.ejar_status,
                },
                "next_due": None if nxt is None else {"date": nxt.payment.due_date.isoformat(), "amount": r2(nxt.amount),
                                                      "status": _collect_state(nxt, today, reported)},
                "overdue": r2(sum(r.amount for r in u_rows if not r.is_paid and r.payment.due_date < today)),
                "collected_12m": r2(sum(r.amount for r in u_rows if r.is_paid and r.cash_date >= today - timedelta(days=365))),
                "history": [
                    {"id": c.id, "contract_number": c.contract_number,
                     "tenant": localized_value(c.tenant, "name", locale) if c.tenant else None,
                     "start_date": c.start_date.isoformat(), "end_date": c.end_date.isoformat(), "annual_rent": r2(c.rent_amount)}
                    for c in leases[:6]
                ],
            }
        )

    start = today - timedelta(days=365)
    expenses = [e for e in _owner_expenses(db, owner, start, today) if e.building_id == b.id]
    work = db.scalars(select(WorkOrder).where(WorkOrder.building_id == b.id).order_by(WorkOrder.created_at.desc()).limit(30)).all()
    unit_no = {u.id: u.number for u in b.units}
    paid12 = [r for r in rows if r.is_paid and r.cash_date >= start]
    occ = sum(1 for u in units if u["occupied"])
    return {
        "id": b.id,
        "name": _name(b, locale),
        "property_type": b.property_type,
        "city": localized_value(b, "city", locale),
        "district": localized_value(b, "district", locale),
        "address": localized_value(b, "address", locale) or b.national_address,
        "deed_number": b.deed_number,
        "deed_date": b.deed_date.isoformat() if b.deed_date else None,
        "lat": b.latitude,
        "lng": b.longitude,
        "images": [i.url for i in getattr(b, "images", [])][:8],
        "kpis": {
            "units": len(units),
            "occupied": occ,
            "occupancy": r2(100 * occ / len(units)) if units else 0,
            "annual_rent_roll": r2(sum(u["lease"]["annual_rent"] for u in units if u["lease"])),
            "collected_12m": r2(sum(r.amount for r in paid12)),
            "fees_12m": r2(sum(r.fees for r in paid12)),
            "expenses_12m": r2(sum(e.amount for e in expenses if _deductible(e))),
            "net_12m": r2(sum(r.net for r in paid12) - sum(e.amount for e in expenses if _deductible(e))),
            "overdue": r2(sum(r.amount for r in rows if not r.is_paid and r.payment.due_date < today)),
        },
        "units": units,
        "expenses": [
            {"date": e.expense_date.isoformat(), "category": e.category,
             "description": localized_value(e, "description", locale), "unit": unit_no.get(e.unit_id),
             "vendor": e.vendor_name, "amount": r2(e.amount), "paid_by": e.paid_by, "deducted": _deductible(e),
             "receipt": e.receipt_number}
            for e in sorted(expenses, key=lambda e: e.expense_date, reverse=True)
        ],
        "work_orders": [
            {"id": w.id, "number": w.number, "title": w.title, "category": w.category, "priority": w.priority,
             "status": w.status, "unit": unit_no.get(w.unit_id), "created_at": w.created_at.isoformat(),
             "completed_at": w.completed_at.isoformat() if w.completed_at else None,
             "estimate": r2(w.estimate_amount), "cost": r2(w.actual_cost), "charge_to": w.charge_to}
            for w in work
        ],
    }


@router.get("/contracts/{contract_id}")
def contract_detail(contract_id: int, owner: ScopedOwner, db: DbSession, locale: LocaleDep):
    today = date.today()
    rows = [r for r in _rows(owner) if r.contract.id == contract_id]
    c = None
    for b in owner.buildings:
        for u in b.units:
            for k in u.contracts:
                if k.id == contract_id and _is_lease(k):
                    c, unit, building = k, u, b
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    reported = _reported_ids(db, [r.payment.id for r in rows])
    items = sorted((_row_json(r, today, reported, locale) for r in rows), key=lambda x: (x["due_date"], x["id"]))
    paid = [i for i in items if i["status"] == "paid"]
    mgmt_pct = float(c.management_percentage or unit.management_percentage or 0)
    agent_pct = float(c.agent_percentage or unit.agent_percentage or 0)
    t = c.tenant
    return {
        "id": c.id,
        "contract_number": c.contract_number,
        "ejar_contract_number": c.ejar_contract_number,
        "ejar_status": c.ejar_status,
        "type": c.contract_type,
        "status": c.status,
        "active": _is_active(c, today),
        "building_id": building.id,
        "building": _name(building, locale),
        "unit": unit.number,
        "tenant": None if t is None else {
            "name": localized_value(t, "name", locale),
            "type": t.tenant_type,
            "nationality": t.nationality,
        },
        "start_date": c.start_date.isoformat(),
        "end_date": c.end_date.isoformat(),
        "days_left": (c.end_date - today).days,
        "annual_rent": r2(c.rent_amount),
        "total_amount": r2(c.total_amount),
        "payment_type": c.payment_type,
        "payment_count": c.payment_count,
        "management_pct": mgmt_pct,
        "agent_pct": agent_pct,
        "ejar_fee": r2(c.ejar_registration_fee or unit.ejar_fee),
        "totals": {
            "scheduled": r2(sum(i["amount"] for i in items)),
            "collected": r2(sum(i["amount"] for i in paid)),
            "outstanding": r2(sum(i["amount"] for i in items if i["status"] in ("overdue", "reported"))),
            "fees": r2(sum(i["fees"] for i in paid)),
            "owner_share": r2(sum(i["net"] for i in paid)),
            "transferred": r2(sum(i["net"] for i in paid if i["transfer"]["state"] == "transferred")),
        },
        "schedule": items,
    }


@router.get("/activity")
def activity(owner: ScopedOwner, db: DbSession, locale: LocaleDep, days: int = Query(default=120, ge=7, le=730)):
    """What happened on the owner's properties, newest first."""
    today = date.today()
    since = today - timedelta(days=days)
    ev: list[dict] = []
    rows = _rows(owner)
    for r in rows:
        p = r.payment
        where = {"building": _name(r.building, locale), "unit": r.unit.number,
                 "contract_id": r.contract.id, "building_id": r.building.id}
        if r.is_paid and p.paid_date and p.paid_date >= since:
            ev.append({"at": p.paid_date.isoformat(), "kind": "collected", "amount": r2(r.amount), "net": r2(r.net),
                       "tenant": localized_value(r.contract.tenant, "name", locale) if r.contract.tenant else None, **where})
        if p.owner_transferred_date and p.owner_transferred_date >= since:
            ev.append({"at": p.owner_transferred_date.isoformat(), "kind": "transferred", "amount": r2(r.net),
                       "reference": p.owner_transfer_reference, **where})
        if not r.is_paid and since <= p.due_date < today:
            ev.append({"at": p.due_date.isoformat(), "kind": "missed", "amount": r2(r.amount),
                       "tenant": localized_value(r.contract.tenant, "name", locale) if r.contract.tenant else None, **where})
    seen = set()
    for r in rows:
        c = r.contract
        if c.id in seen:
            continue
        seen.add(c.id)
        where = {"building": _name(r.building, locale), "unit": r.unit.number, "contract_id": c.id, "building_id": r.building.id,
                 "tenant": localized_value(c.tenant, "name", locale) if c.tenant else None}
        if since <= c.start_date <= today:
            ev.append({"at": c.start_date.isoformat(), "kind": "lease_started", "amount": r2(c.rent_amount), **where})
        if since <= c.end_date <= today:
            ev.append({"at": c.end_date.isoformat(), "kind": "lease_ended", **where})
    for e in _owner_expenses(db, owner, since, today):
        ev.append({"at": e.expense_date.isoformat(), "kind": "expense", "amount": r2(e.amount), "deducted": _deductible(e),
                   "category": e.category, "description": localized_value(e, "description", locale),
                   "building": _name(e.building, locale) if e.building else None, "building_id": e.building_id})
    b_ids = {b.id: b for b in owner.buildings}
    if b_ids:
        for w in db.scalars(
            select(WorkOrder).where(WorkOrder.building_id.in_(list(b_ids)), WorkOrder.created_at >= datetime.combine(since, datetime.min.time()))
        ).all():
            ev.append({"at": w.created_at.date().isoformat(), "kind": "work_order", "title": w.title, "status": w.status,
                       "number": w.number, "building": _name(b_ids[w.building_id], locale), "building_id": w.building_id})
    ev.sort(key=lambda e: e["at"], reverse=True)
    return ev[:80]


# ═══════════════════════════ exports (CSV, Excel-friendly) ═══════════════════════════

import csv as _csv
import io as _io

from fastapi.responses import Response as _Response


def _csv_response(name: str, header: list[str], rows: list[list]) -> _Response:
    buf = _io.StringIO()
    w = _csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    # UTF-8 BOM so Excel opens Arabic text correctly.
    return _Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                     headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})


@router.get("/export/{kind}.csv")
def export(kind: str, owner: ScopedOwner, db: DbSession, locale: LocaleDep):
    ar = locale == "ar"
    H = lambda a, e: a if ar else e  # noqa: E731
    today = date.today()
    ST = {"paid": H("محصّلة", "Collected"), "reported": H("أبلغ المستأجر بالسداد", "Tenant reported paying"), "overdue": H("متأخرة", "Overdue"),
          "due_soon": H("مستحقة قريباً", "Due soon"), "upcoming": H("قادمة", "Upcoming"), "transferred": H("حُوّلت", "Sent"),
          "pending": H("قيد التحويل", "Scheduled"), "late": H("تحويل متأخر", "Late"), "not_paid": ""}
    if kind == "payments":
        rows = _rows(owner)
        reported = _reported_ids(db, [r.payment.id for r in rows])
        items = sorted((_row_json(r, today, reported, locale) for r in rows), key=lambda x: x["due_date"])
        return _csv_response("payments", [
            H("تاريخ الاستحقاق", "Due date"), H("العقار", "Property"), H("الوحدة", "Unit"), H("المستأجر", "Tenant"), H("رقم العقد", "Lease"),
            H("المبلغ", "Amount"), H("حالة التحصيل", "Collection"), H("تاريخ السداد", "Paid on"), H("رقم الإيصال", "Receipt"),
            H("أتعاب الإدارة", "Management fee"), H("الوساطة", "Brokerage"), H("رسوم إيجار", "Ejar fee"), H("حصتك", "Your share"),
            H("حالة التحويل", "Payout"), H("موعد التحويل", "Payout due"), H("تاريخ التحويل", "Sent on"), H("مرجع الحوالة", "Bank reference"),
        ], [[i["due_date"], i["building"], i["unit"], i["tenant"] or "", i["contract_number"], i["amount"], ST[i["status"]], i["paid_date"] or "",
             i["receipt"] or "", i["management_fee"], i["agent_fee"], i["ejar_fee"], i["net"], ST[i["transfer"]["state"]],
             i["transfer"]["due_date"] or "", i["transfer"]["date"] or "", i["transfer"]["reference"] or ""] for i in items])
    if kind == "units":
        out = []
        for b in owner.buildings:
            for u in sorted(b.units, key=lambda u: u.number or ""):
                cur = next((c for c in u.contracts if _is_lease(c) and _is_active(c, today)), None)
                out.append([_name(b, locale), u.number, u.unit_type or "", u.area_sqm or "", H("مؤجرة", "Leased") if cur else H("شاغرة", "Vacant"),
                            localized_value(cur.tenant, "name", locale) if cur and cur.tenant else "", cur.contract_number if cur else "",
                            cur.start_date.isoformat() if cur else "", cur.end_date.isoformat() if cur else "", r2(cur.rent_amount) if cur else r2(u.rent_amount)])
        return _csv_response("units", [H("العقار", "Property"), H("الوحدة", "Unit"), H("النوع", "Type"), H("المساحة م²", "Area m²"), H("الحالة", "Status"),
                                       H("المستأجر", "Tenant"), H("رقم العقد", "Lease"), H("بداية العقد", "Lease start"), H("نهاية العقد", "Lease end"), H("الإيجار السنوي", "Annual rent")], out)
    if kind == "expenses":
        exps = _owner_expenses(db, owner, date(2000, 1, 1), today)
        return _csv_response("expenses", [H("التاريخ", "Date"), H("العقار", "Property"), H("البند", "Category"), H("الوصف", "Description"), H("المورد", "Vendor"),
                                          H("المبلغ", "Amount"), H("يُخصم من حصتك", "Deducted from you"), H("رقم الإيصال", "Receipt")],
                             [[e.expense_date.isoformat(), _name(e.building, locale) if e.building else "", e.category, localized_value(e, "description", locale) or "",
                               e.vendor_name or "", r2(e.amount), H("نعم", "Yes") if _deductible(e) else H("لا", "No"), e.receipt_number or ""]
                              for e in sorted(exps, key=lambda e: e.expense_date)])
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown export")
