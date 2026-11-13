"""Owner portal — what a property owner under management sees.

Security model
--------------
* Owner accounts are users with role ``owner`` linked to exactly one ``Owner``
  through ``owner_users``. Every query here is scoped to that owner id; nothing
  is looked up by an id supplied by the owner.
* ``api.deps.get_current_user`` additionally blocks owner accounts from every
  other API route (they could otherwise read staff endpoints).
* Staff with ``owners.view`` may preview any owner's portal with
  ``?as_owner=<id>`` (the "View as owner" button in the portal).

Money model (shared by overview, payments and statements so numbers agree)
-------------------------------------------------------------------------
For every lease payment that is paid:
  management fee = amount × (contract.management_percentage or unit.management_percentage)
  agent fee      = amount × (contract.agent_percentage or unit.agent_percentage)
  Ejar fee       = contract.ejar_registration_fee (or unit.ejar_fee), charged once,
                   on the contract's first payment
  owner share    = amount − fees
Expenses marked ``paid_by == "owner"`` are deducted from the owner's net, matching
the existing staff owner statement (`/analytics/owner-statement`).
"""
from __future__ import annotations

import csv
import io
import logging
import re
import secrets
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from api.config import get_settings
from api.deps import CurrentUser, DbSession
from api.email import EmailMessage, send_email
from api.i18n import Locale, get_locale, localized_value
from api.models import (
    AuditLog,
    Building,
    Contract,
    Expense,
    ManagementContract,
    Owner,
    OwnerUser,
    Payment,
    Unit,
    User,
)
from api.permissions import has_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/owner-portal", tags=["owner-portal"])
LocaleDep = Annotated[Locale, Depends(get_locale)]

LEASE_TYPES = {"residential", "commercial"}
ENDED = {"terminated", "cancelled", "canceled", "expired", "draft"}


# ═══════════════════════════ scope ═══════════════════════════


def _resolve_owner_id(db: Session, user: User, as_owner: Optional[int]) -> int:
    if user.role == "owner":
        link = db.scalar(select(OwnerUser).where(OwnerUser.user_id == user.id))
        if link is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is not linked to an owner yet.")
        return link.owner_id
    # Staff preview ("View as owner")
    if as_owner is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "as_owner is required for staff preview")
    if not has_permission(db, user, "owners", "view"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Permission denied: owners.view")
    return as_owner


def _load_owner(db: Session, owner_id: int) -> Owner:
    owner = db.scalar(
        select(Owner)
        .where(Owner.id == owner_id)
        .options(
            selectinload(Owner.buildings)
            .selectinload(Building.units)
            .selectinload(Unit.contracts)
            .selectinload(Contract.payments),
            selectinload(Owner.buildings).selectinload(Building.units).selectinload(Unit.contracts).selectinload(Contract.tenant),
            selectinload(Owner.buildings).selectinload(Building.images),
        )
    )
    if owner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Owner not found")
    return owner


def scoped_owner(
    db: DbSession,
    user: CurrentUser,
    as_owner: Annotated[Optional[int], Query(ge=1)] = None,
) -> Owner:
    return _load_owner(db, _resolve_owner_id(db, user, as_owner))


ScopedOwner = Annotated[Owner, Depends(scoped_owner)]


# ═══════════════════════════ money model ═══════════════════════════


def _is_lease(c: Contract) -> bool:
    return (c.contract_type or "residential") in LEASE_TYPES


def _is_active(c: Contract, on: date) -> bool:
    return (c.status or "active").lower() not in ENDED and c.start_date <= on <= c.end_date


def _pct(contract_value: float | None, unit_value: float | None) -> float:
    return float(contract_value) if contract_value else float(unit_value or 0)


@dataclass
class Row:
    payment: Payment
    contract: Contract
    unit: Unit
    building: Building
    mgmt: float
    agent: float
    ejar: float

    @property
    def amount(self) -> float:
        return float(self.payment.amount or 0)

    @property
    def fees(self) -> float:
        return self.mgmt + self.agent + self.ejar

    @property
    def net(self) -> float:
        return self.amount - self.fees

    @property
    def is_paid(self) -> bool:
        return (self.payment.status or "") == "paid"

    @property
    def cash_date(self) -> date:
        return self.payment.paid_date or self.payment.due_date


def _rows(owner: Owner) -> list[Row]:
    out: list[Row] = []
    for b in owner.buildings:
        for u in b.units:
            for c in u.contracts:
                if not _is_lease(c):
                    continue
                pays = sorted(c.payments, key=lambda p: (p.due_date, p.id))
                ejar_total = float(c.ejar_registration_fee or u.ejar_fee or 0)
                for i, p in enumerate(pays):
                    amt = float(p.amount or 0)
                    out.append(
                        Row(
                            payment=p,
                            contract=c,
                            unit=u,
                            building=b,
                            mgmt=amt * _pct(c.management_percentage, u.management_percentage) / 100,
                            agent=amt * _pct(c.agent_percentage, u.agent_percentage) / 100,
                            ejar=ejar_total if i == 0 else 0.0,
                        )
                    )
    return out


def _owner_expenses(db: Session, owner: Owner, start: date, end: date) -> list[Expense]:
    building_ids = [b.id for b in owner.buildings]
    q = select(Expense).where(Expense.expense_date >= start, Expense.expense_date <= end)
    if building_ids:
        q = q.where((Expense.owner_id == owner.id) | (Expense.building_id.in_(building_ids)))
    else:
        q = q.where(Expense.owner_id == owner.id)
    return list(db.scalars(q.options(selectinload(Expense.building))).all())


def _deductible(e: Expense) -> bool:
    return (e.paid_by or "") == "owner"


def r2(x: float) -> float:
    return round(float(x or 0), 2)


def _name(obj, locale: Locale) -> str:
    return localized_value(obj, "name", locale)


# ═══════════════════════════ owner endpoints ═══════════════════════════


@router.get("/me")
def me(owner: ScopedOwner, locale: LocaleDep):
    iban = (owner.iban or "").replace(" ", "")
    return {
        "owner_id": owner.id,
        "name": _name(owner, locale),
        "email": owner.email,
        "phone": owner.phone,
        "bank_name": owner.bank_name,
        "iban_last4": iban[-4:] if iban else None,
        "buildings": len(owner.buildings),
    }


@router.get("/overview")
def overview(
    owner: ScopedOwner,
    db: DbSession,
    locale: LocaleDep,
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
):
    today = date.today()
    y_start, y_end = date(year, 1, 1), date(year, 12, 31)
    period_end = min(y_end, today)
    rows = _rows(owner)

    # Units & occupancy (today)
    units = [u for b in owner.buildings for u in b.units]
    occupied_ids = {u.id for u in units if any(_is_lease(c) and _is_active(c, today) for c in u.contracts)}
    active_leases = [c for u in units for c in u.contracts if _is_lease(c) and _is_active(c, today)]

    def annual(c: Contract) -> float:
        days = max((c.end_date - c.start_date).days + 1, 1)
        return float(c.total_rent_amount or 0) * 365 / days

    rent_roll = sum(annual(c) for c in active_leases)

    # Year cash flow (cash basis — what actually arrived)
    paid_in_year = [r for r in rows if r.is_paid and y_start <= r.cash_date <= y_end]
    billed = [r for r in rows if y_start <= r.payment.due_date <= period_end]
    collected_on_billed = sum(r.amount for r in billed if r.is_paid)
    overdue = [r for r in rows if not r.is_paid and r.payment.due_date < today]
    upcoming = [r for r in rows if not r.is_paid and today <= r.payment.due_date <= today + timedelta(days=60)]
    expenses = _owner_expenses(db, owner, y_start, y_end)
    deducted = sum(e.amount for e in expenses if _deductible(e))

    gross = sum(r.amount for r in paid_in_year)
    mgmt = sum(r.mgmt for r in paid_in_year)
    agent = sum(r.agent for r in paid_in_year)
    ejar = sum(r.ejar for r in paid_in_year)

    # Monthly series
    months = []
    by_m: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for r in paid_in_year:
        m = by_m[r.cash_date.month]
        m["collected"] += r.amount
        m["fees"] += r.fees
    for r in rows:
        if y_start <= r.payment.due_date <= y_end:
            by_m[r.payment.due_date.month]["due"] += r.amount
    for e in expenses:
        if _deductible(e):
            by_m[e.expense_date.month]["expenses"] += e.amount
    for mo in range(1, 13):
        m = by_m[mo]
        months.append(
            {
                "month": mo,
                "due": r2(m["due"]),
                "collected": r2(m["collected"]),
                "fees": r2(m["fees"]),
                "expenses": r2(m["expenses"]),
                "net": r2(m["collected"] - m["fees"] - m["expenses"]),
            }
        )

    # Per building
    buildings = []
    for b in owner.buildings:
        b_units = b.units
        b_occ = sum(1 for u in b_units if u.id in occupied_ids)
        b_paid = [r for r in paid_in_year if r.building.id == b.id]
        b_overdue = [r for r in overdue if r.building.id == b.id]
        b_exp = sum(e.amount for e in expenses if _deductible(e) and e.building_id == b.id)
        buildings.append(
            {
                "id": b.id,
                "name": _name(b, locale),
                "city": localized_value(b, "city", locale),
                "district": localized_value(b, "district", locale),
                "units": len(b_units),
                "occupied": b_occ,
                "occupancy": r2(100 * b_occ / len(b_units)) if b_units else 0,
                "collected": r2(sum(r.amount for r in b_paid)),
                "net": r2(sum(r.net for r in b_paid) - b_exp),
                "outstanding": r2(sum(r.amount for r in b_overdue)),
                "image": b.images[0].url if getattr(b, "images", None) else None,
            }
        )
    buildings.sort(key=lambda x: -x["collected"])

    expiring = sorted(
        (
            {
                "contract_id": c.id,
                "contract_number": c.contract_number,
                "building": _name(c.unit.building, locale),
                "unit": c.unit.number,
                "tenant": localized_value(c.tenant, "name", locale) if c.tenant else None,
                "end_date": c.end_date.isoformat(),
                "days_left": (c.end_date - today).days,
                "annual_rent": r2(annual(c)),
            }
            for c in active_leases
            if (c.end_date - today).days <= 90
        ),
        key=lambda x: x["days_left"],
    )

    return {
        "year": year,
        "as_of": today.isoformat(),
        "kpis": {
            "buildings": len(owner.buildings),
            "units": len(units),
            "occupied_units": len(occupied_ids),
            "vacant_units": len(units) - len(occupied_ids),
            "occupancy_rate": r2(100 * len(occupied_ids) / len(units)) if units else 0,
            "active_leases": len(active_leases),
            "annual_rent_roll": r2(rent_roll),
            "gross_collected": r2(gross),
            "management_fees": r2(mgmt),
            "agent_fees": r2(agent),
            "ejar_fees": r2(ejar),
            "expenses": r2(deducted),
            "net_income": r2(gross - mgmt - agent - ejar - deducted),
            "billed_to_date": r2(sum(r.amount for r in billed)),
            "collection_rate": r2(100 * collected_on_billed / sum(r.amount for r in billed)) if billed else None,
            "overdue_amount": r2(sum(r.amount for r in overdue)),
            "overdue_count": len(overdue),
            "upcoming_amount": r2(sum(r.amount for r in upcoming)),
            "upcoming_count": len(upcoming),
        },
        "months": months,
        "buildings": buildings,
        "expiring": expiring,
        "overdue": [
            {
                "building": _name(r.building, locale),
                "unit": r.unit.number,
                "tenant": localized_value(r.contract.tenant, "name", locale) if r.contract.tenant else None,
                "due_date": r.payment.due_date.isoformat(),
                "days_late": (today - r.payment.due_date).days,
                "amount": r2(r.amount),
            }
            for r in sorted(overdue, key=lambda r: r.payment.due_date)[:20]
        ],
    }


@router.get("/properties")
def properties(owner: ScopedOwner, locale: LocaleDep):
    today = date.today()
    out = []
    for b in owner.buildings:
        units = []
        for u in sorted(b.units, key=lambda u: (u.number or "")):
            lease = next((c for c in u.contracts if _is_lease(c) and _is_active(c, today)), None)
            units.append(
                {
                    "id": u.id,
                    "number": u.number,
                    "type": u.unit_type,
                    "usage": u.usage_type,
                    "area_sqm": u.area_sqm,
                    "listed_rent": r2(u.rent_amount),
                    "occupied": lease is not None,
                    "tenant": localized_value(lease.tenant, "name", locale) if lease and lease.tenant else None,
                    "lease_end": lease.end_date.isoformat() if lease else None,
                    "lease_rent": r2(lease.total_rent_amount) if lease else None,
                    "ejar_status": lease.ejar_status if lease else None,
                }
            )
        out.append(
            {
                "id": b.id,
                "name": _name(b, locale),
                "city": localized_value(b, "city", locale),
                "district": localized_value(b, "district", locale),
                "property_type": b.property_type,
                "deed_number": b.deed_number,
                "lat": b.latitude,
                "lng": getattr(b, "longitude", None),
                "images": [i.url for i in getattr(b, "images", [])][:6],
                "units": units,
                "occupied": sum(1 for u in units if u["occupied"]),
            }
        )
    return out


@router.get("/contracts")
def contracts(owner: ScopedOwner, db: DbSession, locale: LocaleDep):
    today = date.today()
    leases = []
    for b in owner.buildings:
        for u in b.units:
            for c in u.contracts:
                if not _is_lease(c):
                    continue
                paid = sum(float(p.amount or 0) for p in c.payments if p.status == "paid")
                total = sum(float(p.amount or 0) for p in c.payments)
                leases.append(
                    {
                        "id": c.id,
                        "contract_number": c.contract_number,
                        "type": c.contract_type,
                        "building": _name(b, locale),
                        "unit": u.number,
                        "tenant": localized_value(c.tenant, "name", locale) if c.tenant else None,
                        "start_date": c.start_date.isoformat(),
                        "end_date": c.end_date.isoformat(),
                        "active": _is_active(c, today),
                        "status": c.status,
                        "total_rent": r2(c.total_rent_amount),
                        "payment_type": c.payment_type,
                        "payments_paid": r2(paid),
                        "payments_total": r2(total),
                        "ejar_status": c.ejar_status,
                        "ejar_contract_number": c.ejar_contract_number,
                    }
                )
    leases.sort(key=lambda x: (not x["active"], x["end_date"]))
    mandates = db.scalars(select(ManagementContract).where(ManagementContract.owner_id == owner.id)).all()
    return {
        "leases": leases,
        "management": [
            {
                "id": m.id,
                "contract_number": getattr(m, "contract_number", None),
                "start_date": m.start_date.isoformat(),
                "end_date": m.end_date.isoformat(),
                "status": m.status,
                "fee_type": m.fee_type,
                "fee_percentage": m.fee_percentage,
                "fee_fixed_amount": r2(m.fee_fixed_amount),
                "maintenance_limit_amount": r2(m.maintenance_limit_amount),
                "ejar_status": m.ejar_status,
            }
            for m in mandates
        ],
    }


@router.get("/payments")
def payments(
    owner: ScopedOwner,
    locale: LocaleDep,
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
):
    today = date.today()
    out = []
    for r in _rows(owner):
        if r.payment.due_date.year != year:
            continue
        st = "paid" if r.is_paid else ("overdue" if r.payment.due_date < today else "upcoming")
        out.append(
            {
                "id": r.payment.id,
                "due_date": r.payment.due_date.isoformat(),
                "paid_date": r.payment.paid_date.isoformat() if r.payment.paid_date else None,
                "building": _name(r.building, locale),
                "unit": r.unit.number,
                "tenant": localized_value(r.contract.tenant, "name", locale) if r.contract.tenant else None,
                "amount": r2(r.amount),
                "fees": r2(r.fees),
                "net": r2(r.net),
                "status": st,
            }
        )
    out.sort(key=lambda x: x["due_date"])
    return out


def _statement(db: Session, owner: Owner, locale: Locale, start: date, end: date) -> dict:
    lines = []
    for r in _rows(owner):
        if not r.is_paid or not (start <= r.cash_date <= end):
            continue
        lines.append(
            {
                "date": r.cash_date.isoformat(),
                "building": _name(r.building, locale),
                "unit": r.unit.number,
                "tenant": localized_value(r.contract.tenant, "name", locale) if r.contract.tenant else None,
                "receipt": r.payment.receipt_number,
                "gross": r2(r.amount),
                "management_fee": r2(r.mgmt),
                "agent_fee": r2(r.agent),
                "ejar_fee": r2(r.ejar),
                "net": r2(r.net),
            }
        )
    lines.sort(key=lambda x: x["date"])
    exps = _owner_expenses(db, owner, start, end)
    expense_lines = [
        {
            "date": e.expense_date.isoformat(),
            "category": e.category,
            "description": localized_value(e, "description", locale),
            "building": _name(e.building, locale) if e.building else None,
            "vendor": e.vendor_name,
            "amount": r2(e.amount),
            "paid_by": e.paid_by,
            "deducted": _deductible(e),
        }
        for e in sorted(exps, key=lambda e: e.expense_date)
    ]
    gross = sum(x["gross"] for x in lines)
    fees_m = sum(x["management_fee"] for x in lines)
    fees_a = sum(x["agent_fee"] for x in lines)
    fees_e = sum(x["ejar_fee"] for x in lines)
    deducted = sum(x["amount"] for x in expense_lines if x["deducted"])
    iban = (owner.iban or "").replace(" ", "")
    return {
        "owner": {"name": _name(owner, locale), "bank_name": owner.bank_name, "iban_last4": iban[-4:] if iban else None},
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "income": lines,
        "expenses": expense_lines,
        "totals": {
            "gross": r2(gross),
            "management_fee": r2(fees_m),
            "agent_fee": r2(fees_a),
            "ejar_fee": r2(fees_e),
            "expenses": r2(deducted),
            "net_payable": r2(gross - fees_m - fees_a - fees_e - deducted),
        },
    }


def _period(year: int, month: Optional[int]) -> tuple[date, date]:
    if month:
        s = date(year, month, 1)
        return s, s + relativedelta(months=1) - timedelta(days=1)
    return date(year, 1, 1), date(year, 12, 31)


@router.get("/statement")
def statement(
    owner: ScopedOwner,
    db: DbSession,
    locale: LocaleDep,
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
    month: Optional[int] = Query(default=None, ge=1, le=12),
):
    s, e = _period(year, month)
    return _statement(db, owner, locale, s, e)


@router.get("/statement.csv")
def statement_csv(
    owner: ScopedOwner,
    db: DbSession,
    locale: LocaleDep,
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
    month: Optional[int] = Query(default=None, ge=1, le=12),
):
    s, e = _period(year, month)
    st = _statement(db, owner, locale, s, e)
    ar = locale == "ar"
    buf = io.StringIO()
    buf.write("﻿")
    w = csv.writer(buf)

    def safe(v):
        v = "" if v is None else str(v)
        return "'" + v if v[:1] in ("=", "+", "-", "@") else v

    w.writerow(["كشف حساب المالك" if ar else "Owner statement", st["owner"]["name"], f'{st["period_start"]} → {st["period_end"]}'])
    w.writerow([])
    w.writerow(
        ["التاريخ", "العقار", "الوحدة", "المستأجر", "رقم السند", "الإجمالي", "أتعاب الإدارة", "عمولة الوسيط", "رسوم إيجار", "الصافي"]
        if ar
        else ["Date", "Property", "Unit", "Tenant", "Receipt", "Gross", "Management fee", "Agent fee", "Ejar fee", "Net"]
    )
    for x in st["income"]:
        w.writerow([safe(x[k]) for k in ("date", "building", "unit", "tenant", "receipt", "gross", "management_fee", "agent_fee", "ejar_fee", "net")])
    w.writerow([])
    w.writerow(["المصروفات" if ar else "Expenses"])
    w.writerow(["التاريخ", "الفئة", "الوصف", "العقار", "المورد", "المبلغ", "مخصوم"] if ar else ["Date", "Category", "Description", "Property", "Vendor", "Amount", "Deducted"])
    for x in st["expenses"]:
        w.writerow([safe(x["date"]), safe(x["category"]), safe(x["description"]), safe(x["building"]), safe(x["vendor"]), x["amount"], "✓" if x["deducted"] else ""])
    w.writerow([])
    t = st["totals"]
    labels = (
        [("إجمالي المحصّل", "gross"), ("أتعاب الإدارة", "management_fee"), ("عمولة الوسيط", "agent_fee"), ("رسوم إيجار", "ejar_fee"), ("المصروفات المخصومة", "expenses"), ("الصافي المستحق للمالك", "net_payable")]
        if ar
        else [("Gross collected", "gross"), ("Management fees", "management_fee"), ("Agent fees", "agent_fee"), ("Ejar fees", "ejar_fee"), ("Deducted expenses", "expenses"), ("Net payable to owner", "net_payable")]
    )
    for label, key in labels:
        w.writerow([label, t[key]])
    fname = f"muktasabat-statement-{st['period_start'][:7] if month else year}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


# ═══════════════════════════ staff: portal access ═══════════════════════════


def _require_owner_perm(db: Session, user: User, action: str) -> None:
    if user.role == "owner" or not has_permission(db, user, "owners", action):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Permission denied: owners.{action}")


class InviteIn(BaseModel):
    email: str = Field(max_length=120)
    locale: Locale = "ar"

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Invalid email")
        return v


@router.get("/admin/access")
def access_list(db: DbSession, user: CurrentUser, locale: LocaleDep):
    _require_owner_perm(db, user, "view")
    links = {
        l.owner_id: l
        for l in db.scalars(select(OwnerUser).options(selectinload(OwnerUser.user))).all()
    }
    last_login = dict(
        db.execute(
            select(AuditLog.user_id, func.max(AuditLog.timestamp))
            .where(AuditLog.action == "login")
            .group_by(AuditLog.user_id)
        ).all()
    )
    out = []
    for o in db.scalars(select(Owner).order_by(Owner.name)).all():
        link = links.get(o.id)
        u = link.user if link else None
        out.append(
            {
                "owner_id": o.id,
                "name": _name(o, locale),
                "email": o.email,
                "has_account": u is not None,
                "active": bool(u and u.is_active_user),
                "username": u.username if u else None,
                "invite_pending": bool(u and u.password_reset_token and not last_login.get(u.id)),
                "last_login": last_login[u.id].isoformat() if u and last_login.get(u.id) else None,
            }
        )
    return out


def _send_owner_invite(to: str, owner_name: str, url: str, locale: Locale) -> None:
    subject = "دعوة إلى بوابة الملاك — مكتسبات العقارية | Your Muktasabat owner portal"
    text = (
        f"مرحباً {owner_name}،\n\n"
        "تمت دعوتك إلى بوابة الملاك في مكتسبات العقارية لمتابعة عقاراتك وعقودك وإيراداتك وكشوف حسابك.\n"
        f"لتعيين كلمة المرور وتفعيل حسابك (الرابط صالح لمدة 72 ساعة):\n{url}\n\n"
        f"اسم المستخدم: {to}\n\n— — —\n\n"
        f"Hello {owner_name},\n\n"
        "You've been invited to the Muktasabat owner portal to follow your properties, leases, revenue and statements.\n"
        f"Set your password to activate your account (link valid for 72 hours):\n{url}\n\nUsername: {to}\n"
    )
    html = f"""
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1f2328">
  <div style="background:#7B1A1A;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
    <strong style="font-size:18px">مكتسبات العقارية · Muktasabat</strong>
  </div>
  <div style="border:1px solid #e3ddd2;border-top:0;padding:24px;border-radius:0 0 10px 10px">
    <div dir="rtl" style="text-align:right">
      <p>مرحباً {owner_name}،</p>
      <p>تمت دعوتك إلى <strong>بوابة الملاك</strong> لمتابعة عقاراتك وعقود الإيجار والتحصيل وصافي الإيرادات وكشوف الحساب الشهرية.</p>
    </div>
    <p style="text-align:center;margin:28px 0">
      <a href="{url}" style="background:#7B1A1A;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold">تفعيل الحساب · Activate account</a>
    </p>
    <p style="font-size:13px;color:#5d636b">Username / اسم المستخدم: <strong dir="ltr">{to}</strong><br>
    The link is valid for 72 hours. · الرابط صالح لمدة 72 ساعة.</p>
  </div>
</div>"""
    send_email(EmailMessage(to=to, subject=subject, text_body=text, html_body=html))


@router.post("/admin/owners/{owner_id}/invite")
def invite_owner(owner_id: int, payload: InviteIn, db: DbSession, user: CurrentUser, locale: LocaleDep):
    """Create (or re-issue) the owner's portal login and return a set-password link.

    The link is returned to staff as well as emailed, so it can be shared over
    WhatsApp while SES delivery is being set up.
    """
    _require_owner_perm(db, user, "edit")
    owner = db.get(Owner, owner_id)
    if owner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Owner not found")

    link = db.scalar(select(OwnerUser).where(OwnerUser.owner_id == owner_id))
    acct = db.get(User, link.user_id) if link else None
    clash = db.scalar(select(User).where((User.email == payload.email) | (User.username == payload.email)))
    if acct is None:
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This email already belongs to another account.")
        acct = User(username=payload.email, email=payload.email, role="owner", is_active_user=True, email_verified=True)
        acct.set_password(secrets.token_urlsafe(24))
        db.add(acct)
        db.flush()
        db.add(OwnerUser(owner_id=owner_id, user_id=acct.id))
    else:
        if clash is not None and clash.id != acct.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "This email already belongs to another account.")
        acct.email = payload.email
        acct.is_active_user = True

    raw = secrets.token_urlsafe(32)
    import hashlib

    acct.password_reset_token = hashlib.sha256(raw.encode()).hexdigest()
    acct.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=72)
    db.add(AuditLog(user_id=user.id, username=user.username, action="owner_portal_invite", entity_type="owner", entity_id=str(owner_id)))
    db.commit()

    url = f"{get_settings().web_base_url.rstrip('/')}/{payload.locale}/reset-password?token={raw}"
    _send_owner_invite(payload.email, localized_value(owner, "name", payload.locale), url, payload.locale)
    return {"username": acct.username, "invite_url": url, "expires_hours": 72}


@router.post("/admin/owners/{owner_id}/revoke")
def revoke_owner(owner_id: int, db: DbSession, user: CurrentUser):
    _require_owner_perm(db, user, "edit")
    link = db.scalar(select(OwnerUser).where(OwnerUser.owner_id == owner_id))
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No portal account")
    acct = db.get(User, link.user_id)
    acct.is_active_user = False
    acct.password_reset_token = None
    db.add(AuditLog(user_id=user.id, username=user.username, action="owner_portal_revoke", entity_type="owner", entity_id=str(owner_id)))
    db.commit()
    return {"ok": True}
