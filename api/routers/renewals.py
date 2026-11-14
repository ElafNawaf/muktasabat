"""Lease renewal pipeline (see api/renewal_models.py for the workflow).

Staff: /renewals (module `contracts`). Owners: /owner-portal/renewals.
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta
from html import escape
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.cms_models import CmsListing
from api.deps import CurrentUser, DbSession
from api.models import Building, Contract, Owner, Tenant, Unit, User
from api.permissions import Perm, has_permission
from api.services import workflows as wf
from api.renewal_models import LeaseRenewal, LeaseRenewalEvent
from api.routers.maintenance import _base, _mail, _name, _owner_scope

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/renewals", tags=["renewals"])
owner_router = APIRouter(prefix="/owner-portal/renewals", tags=["owner-portal"])

WINDOW_DAYS = 90
OPEN = {"due", "contacted", "offer_sent", "awaiting_owner", "agreed"}
LostReason = Literal["price", "relocation", "bought_home", "dissatisfied", "owner_ending", "other"]


# ───────────────────────── helpers ─────────────────────────


def _actor(u: User) -> str:
    return getattr(u, "full_name", None) or u.username


def _log(db: Session, r: LeaseRenewal, actor: str, action: str, note: Optional[str] = None) -> None:
    db.add(LeaseRenewalEvent(renewal_id=r.id, actor=actor, action=action, note=note))


def sync_cases(db: Session) -> int:
    """Open a case for every active lease ending within the window. Idempotent."""
    today = date.today()
    have = set(db.scalars(select(LeaseRenewal.contract_id)).all())
    rows = db.scalars(
        select(Contract).where(
            Contract.status == "active",
            Contract.end_date >= today,
            Contract.end_date <= today + timedelta(days=WINDOW_DAYS),
        )
    ).all()
    n = 0
    for c in rows:
        if c.id in have:
            continue
        u = db.get(Unit, c.unit_id)
        b = db.get(Building, u.building_id) if u else None
        r = LeaseRenewal(
            contract_id=c.id, unit_id=c.unit_id, building_id=b.id if b else None,
            assignee_id=b.assignee_id if b else None, end_date=c.end_date,
            current_rent=float(c.total_rent_amount or c.rent_amount or 0),
            next_follow_up=today,
        )
        db.add(r)
        db.flush()
        _log(db, r, "system", "opened", f"{(c.end_date - today).days}")
        n += 1
    if n:
        db.commit()
    return n


def _days_left(r: LeaseRenewal) -> int:
    return (r.end_date - date.today()).days


def _bucket(r: LeaseRenewal) -> str:
    d = _days_left(r)
    return "overdue" if d < 0 else "d30" if d <= 30 else "d60" if d <= 60 else "d90"


def _out(db: Session, r: LeaseRenewal, locale: str, detail: bool = False) -> dict:
    c = db.get(Contract, r.contract_id)
    u = db.get(Unit, r.unit_id) if r.unit_id else None
    b = db.get(Building, r.building_id) if r.building_id else None
    t = db.get(Tenant, c.tenant_id) if c and c.tenant_id else None
    a = db.get(User, r.assignee_id) if r.assignee_id else None
    change = None
    if r.proposed_rent is not None and r.current_rent:
        change = round((r.proposed_rent - r.current_rent) / r.current_rent * 100, 1)
    d = {
        "id": r.id, "contract_id": r.contract_id, "contract_number": c.contract_number if c else None,
        "stage": r.stage, "tenant_intent": r.tenant_intent, "end_date": r.end_date.isoformat(),
        "days_left": _days_left(r), "bucket": _bucket(r),
        "building_id": r.building_id, "building": _name(b, locale) if b else None,
        "unit": (u.number or _name(u, locale)) if u else None,
        "owner_id": b.owner_id if b else None,
        "owner": _name(db.get(Owner, b.owner_id), locale) if b and b.owner_id else None,
        "tenant": _name(t, locale) if t else None, "tenant_phone": t.phone if t else None,
        "assignee_id": r.assignee_id, "assignee": _actor(a) if a else None,
        "current_rent": r.current_rent, "proposed_rent": r.proposed_rent, "change_pct": change,
        "unit_rent": u.rent_amount * 12 if u and u.rent_amount else None,
        "next_follow_up": r.next_follow_up.isoformat() if r.next_follow_up else None,
        "follow_up_due": bool(r.stage in OPEN and r.next_follow_up and r.next_follow_up <= date.today()),
        "owner_decision_by": r.owner_decision_by, "owner_decision_note": r.owner_decision_note,
        "lost_reason": r.lost_reason, "listing_id": r.listing_id, "new_contract_number": r.new_contract_number,
        "updated_at": r.updated_at.isoformat(),
    }
    if detail:
        d["approval_chain"] = wf.chain_json(db, "renewal_offer", r.id, locale)
        d["events"] = [{"at": e.at.isoformat(), "actor": e.actor, "action": e.action, "note": e.note} for e in r.events]
    return d


def _get(db: Session, rid: int) -> LeaseRenewal:
    r = db.get(LeaseRenewal, rid)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Renewal not found")
    return r


def _need(r: LeaseRenewal, allowed: set[str], what: str) -> None:
    if r.stage not in allowed:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot {what} while the renewal is '{r.stage}'.")


def _owner_email(db: Session, owner_id: Optional[int]) -> Optional[str]:
    from api.models import OwnerUser

    if not owner_id:
        return None
    link = db.scalar(select(OwnerUser).where(OwnerUser.owner_id == owner_id))
    if link:
        u = db.get(User, link.user_id)
        if u and u.email:
            return u.email
    o = db.get(Owner, owner_id)
    return getattr(o, "email", None)


def _create_listing(db: Session, r: LeaseRenewal) -> Optional[int]:
    """Draft (unpublished) listing so marketing can start before the unit is empty."""
    u = db.get(Unit, r.unit_id) if r.unit_id else None
    b = db.get(Building, r.building_id) if r.building_id else None
    if u is None:
        return None
    base = re.sub(r"[^a-z0-9]+", "-", f"unit-{u.id}-{r.end_date.isoformat()}").strip("-")
    slug, i = base, 2
    while db.scalar(select(CmsListing.id).where(CmsListing.slug == slug)):
        slug, i = f"{base}-{i}", i + 1
    ptype = "office" if (u.usage_type or "").startswith("comm") else "apartment"
    lst = CmsListing(
        slug=slug, ref=(u.number or str(u.id))[:30], purpose="rent", property_type=ptype, status="available",
        title_ar=f"{_name(b, 'ar')} — وحدة {u.number}"[:200], title_en=f"{_name(b, 'en')} — Unit {u.number}"[:200],
        summary_ar=f"متاحة اعتبارًا من {r.end_date.isoformat()}", summary_en=f"Available from {r.end_date.isoformat()}",
        city_ar=getattr(b, "city", None), city_en=getattr(b, "city", None),
        price=r.proposed_rent or r.current_rent or None, price_period="year",
        area_sqm=u.area_sqm, bedrooms=u.rooms_count, bathrooms=u.bathrooms_count, furnished=bool(u.is_furnished),
        published=False,
    )
    db.add(lst)
    db.flush()
    return lst.id


# ───────────────────────── staff API ─────────────────────────


class AssignIn(BaseModel):
    assignee_id: Optional[int] = None


class ContactIn(BaseModel):
    tenant_intent: Literal["unknown", "renew", "undecided", "leave"]
    note: Optional[str] = Field(default=None, max_length=2000)
    next_follow_up: Optional[date] = None


class OfferIn(BaseModel):
    proposed_rent: float = Field(ge=0, le=100_000_000)
    note: Optional[str] = Field(default=None, max_length=2000)


class DecisionIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=2000)


class AgreeIn(BaseModel):
    note: Optional[str] = Field(default=None, max_length=2000)


class RenewedIn(BaseModel):
    new_contract_number: Optional[str] = Field(default=None, max_length=50)


class LostIn(BaseModel):
    reason: LostReason
    note: Optional[str] = Field(default=None, max_length=2000)
    create_listing: bool = True


class NoteIn(BaseModel):
    note: str = Field(min_length=1, max_length=2000)
    next_follow_up: Optional[date] = None


@router.get("")
def list_renewals(db: DbSession, user: Perm("contracts", "view"),
                  locale: str = Query("ar", pattern="^(ar|en)$"), scope: str = Query("open", pattern="^(open|closed|all)$"),
                  assignee_id: Optional[int] = None):
    sync_cases(db)
    q = select(LeaseRenewal)
    if scope == "open":
        q = q.where(LeaseRenewal.stage.in_(OPEN))
    elif scope == "closed":
        q = q.where(LeaseRenewal.stage.in_({"renewed", "lost"}))
    if assignee_id:
        q = q.where(LeaseRenewal.assignee_id == assignee_id)
    rows = db.scalars(q.order_by(LeaseRenewal.end_date).limit(500)).all()
    return [_out(db, r, locale) for r in rows]


@router.get("/stats")
def renewal_stats(db: DbSession, user: Perm("contracts", "view")):
    sync_cases(db)
    rows = db.scalars(select(LeaseRenewal)).all()
    open_ = [r for r in rows if r.stage in OPEN]
    year_ago = date.today() - timedelta(days=365)
    closed = [r for r in rows if r.stage in {"renewed", "lost"} and r.end_date >= year_ago]
    renewed = [r for r in closed if r.stage == "renewed"]
    ups = [(r.proposed_rent - r.current_rent) / r.current_rent * 100 for r in renewed if r.proposed_rent and r.current_rent]
    return {
        "open": len(open_),
        "d30": sum(1 for r in open_ if 0 <= _days_left(r) <= 30),
        "overdue": sum(1 for r in open_ if _days_left(r) < 0),
        "no_contact": sum(1 for r in open_ if r.stage == "due"),
        "awaiting_owner": sum(1 for r in open_ if r.stage == "awaiting_owner"),
        "follow_ups_due": sum(1 for r in open_ if r.next_follow_up and r.next_follow_up <= date.today()),
        "rent_at_stake": round(sum(r.current_rent for r in open_), 2),
        "retention_pct": round(len(renewed) / len(closed) * 100, 1) if closed else None,
        "avg_change_pct": round(sum(ups) / len(ups), 1) if ups else None,
        "closed_12m": len(closed),
    }


@router.get("/{rid}")
def get_renewal(rid: int, db: DbSession, user: Perm("contracts", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    return _out(db, _get(db, rid), locale, detail=True)


def _done(db: Session, r: LeaseRenewal, locale: str = "ar") -> dict:
    locale = locale if locale in ("ar", "en") else "ar"
    db.commit()
    db.refresh(r)
    return _out(db, r, locale, detail=True)


@router.post("/{rid}/assign")
def assign(rid: int, payload: AssignIn, db: DbSession, user: Perm("contracts", "edit"), locale: str = "ar"):
    r = _get(db, rid)
    r.assignee_id = payload.assignee_id
    a = db.get(User, payload.assignee_id) if payload.assignee_id else None
    _log(db, r, _actor(user), "assigned", _actor(a) if a else None)
    if a and a.email and a.id != user.id:
        _mail(a.email, "تجديد عقد مُسند إليك | Lease renewal assigned to you",
              "<p>أُسندت إليك متابعة تجديد عقد.</p>", "<p>A lease renewal has been assigned to you.</p>",
              f"{_base()}/ar/renewals?open={r.id}", "فتح الملف", "Open renewal")
    return _done(db, r, locale)


@router.post("/{rid}/contact")
def contact(rid: int, payload: ContactIn, db: DbSession, user: Perm("contracts", "edit"), locale: str = "ar"):
    r = _get(db, rid)
    _need(r, OPEN, "log contact")
    r.tenant_intent = payload.tenant_intent
    if r.stage == "due":
        r.stage = "contacted"
    r.next_follow_up = payload.next_follow_up or (date.today() + timedelta(days=7))
    _log(db, r, _actor(user), f"contact_{payload.tenant_intent}", payload.note)
    return _done(db, r, locale)


@router.post("/{rid}/offer")
def offer(rid: int, payload: OfferIn, db: DbSession, user: Perm("contracts", "edit"), locale: str = "ar"):
    r = _get(db, rid)
    _need(r, {"due", "contacted", "offer_sent", "awaiting_owner"}, "send an offer")
    r.proposed_rent = payload.proposed_rent
    r.owner_decision_by = r.owner_decision_note = None
    _log(db, r, _actor(user), "offer", f"{payload.proposed_rent:,.0f}" + (f" — {payload.note}" if payload.note else ""))
    tasks = []
    if r.current_rent and payload.proposed_rent < r.current_rent:
        # Chain from the "renewal_offer" workflow (default: the owner approves).
        tasks = wf.start(db, "renewal_offer", r.id, _wf_ctx(db, r, requester_id=user.id))
    if tasks:
        r.stage = "awaiting_owner"
        _log(db, r, "system", "owner_approval_requested", f"{len(tasks)} step(s)")
        db.commit()
        _wf_notify_step(db, r, tasks[0])
    else:
        r.stage = "offer_sent"
        r.next_follow_up = date.today() + timedelta(days=5)
    return _done(db, r, locale)


def _notify_owner_offer(db: Session, r: LeaseRenewal) -> None:
    b = db.get(Building, r.building_id) if r.building_id else None
    to = _owner_email(db, b.owner_id if b else None)
    _mail(
        to, "موافقة على تجديد عقد بإيجار أقل | Approve a lease renewal at lower rent",
        f"<p>المستأجر في <strong>{escape(_name(b, 'ar'))}</strong> مستعد للتجديد بإيجار سنوي "
        f"<strong>{(r.proposed_rent or 0):,.0f} ر.س</strong> بدلًا من {r.current_rent:,.0f} ر.س. نحتاج موافقتك.</p>",
        f"<p>The tenant at <strong>{escape(_name(b, 'en'))}</strong> is ready to renew at "
        f"<strong>SAR {(r.proposed_rent or 0):,.0f}</strong> a year instead of SAR {r.current_rent:,.0f}. We need your approval.</p>",
        f"{_base()}/ar/owner/renewals", "مراجعة العرض", "Review offer",
    )


def _wf_ctx(db: Session, r: LeaseRenewal, requester_id: Optional[int] = None) -> dict:
    b = db.get(Building, r.building_id) if r.building_id else None
    dec = max(0.0, float(r.current_rent or 0) - float(r.proposed_rent or 0))
    return {"amount": dec, "owner_id": b.owner_id if b else None, "building_id": r.building_id,
            "requester_id": requester_id if requester_id is not None else r.assignee_id}


def _wf_notify_step(db: Session, r: LeaseRenewal, t) -> None:
    if (t.approver or {}).get("type") == "owner":
        _notify_owner_offer(db, r)
        return
    wf.notify(db, t, "اعتماد عرض تجديد بإيجار أقل", "Approve a renewal offer below current rent",
              f"<p>عرض تجديد بإيجار سنوي <strong>{(r.proposed_rent or 0):,.0f} ر.س</strong> بدلًا من {(r.current_rent or 0):,.0f} ر.س بانتظار اعتمادك.</p>",
              f"<p>A renewal offer of <strong>SAR {(r.proposed_rent or 0):,.0f}</strong> a year (current SAR {(r.current_rent or 0):,.0f}) is waiting for your approval.</p>",
              f"{_base()}/ar/approvals")


def workflow_decide(db: Session, r: LeaseRenewal, user, approve: bool, note: Optional[str], by: str) -> str:
    _need(r, {"awaiting_owner"}, "decide")
    result, nxt = wf.decide(db, "renewal_offer", r.id, user, approve, note, ctx_fn=lambda: _wf_ctx(db, r), owner_ok=by.startswith("owner:"))
    if result == "pending":
        _log(db, r, by, "step_approved", note)
        db.commit()
        _wf_notify_step(db, r, nxt)
        return "pending"
    _decide(db, r, result == "approved", note, by)
    db.commit()
    return result


def _decide(db: Session, r: LeaseRenewal, approve: bool, note: Optional[str], by: str) -> None:
    _need(r, {"awaiting_owner"}, "decide")
    r.owner_decision_by, r.owner_decision_note = by, note
    r.stage = "agreed" if approve else "offer_sent"
    _log(db, r, by, "owner_approved" if approve else "owner_rejected", note)
    if r.assignee_id:
        a = db.get(User, r.assignee_id)
        if a and a.email:
            ok = "وافق المالك" if approve else "رفض المالك"
            _mail(a.email, f"{ok} على عرض التجديد | Owner {'approved' if approve else 'rejected'} the renewal offer",
                  f"<p>{ok} على عرض التجديد بإيجار {r.proposed_rent or 0:,.0f} ر.س.</p>" + (f"<p>{escape(note)}</p>" if note else ""),
                  f"<p>The owner {'approved' if approve else 'rejected'} the renewal offer of SAR {r.proposed_rent or 0:,.0f}.</p>" + (f"<p>{escape(note)}</p>" if note else ""),
                  f"{_base()}/ar/renewals?open={r.id}", "فتح الملف", "Open renewal")


@router.post("/{rid}/decision")
def staff_decision(rid: int, payload: DecisionIn, db: DbSession, user: CurrentUser, locale: str = "ar"):
    r = _get(db, rid)
    workflow_decide(db, r, user, payload.approve, payload.note, _actor(user))
    return _done(db, r, locale)


@router.post("/{rid}/agree")
def agree(rid: int, payload: AgreeIn, db: DbSession, user: Perm("contracts", "edit"), locale: str = "ar"):
    r = _get(db, rid)
    _need(r, {"contacted", "offer_sent"}, "mark agreed")
    if r.proposed_rent is None:
        r.proposed_rent = r.current_rent
    r.stage, r.tenant_intent = "agreed", "renew"
    _log(db, r, _actor(user), "agreed", payload.note)
    return _done(db, r, locale)


@router.post("/{rid}/renewed")
def renewed(rid: int, payload: RenewedIn, db: DbSession, user: Perm("contracts", "edit"), locale: str = "ar"):
    r = _get(db, rid)
    _need(r, {"agreed"}, "close as renewed")
    r.stage, r.new_contract_number, r.next_follow_up = "renewed", payload.new_contract_number, None
    _log(db, r, _actor(user), "renewed", payload.new_contract_number)
    return _done(db, r, locale)


@router.post("/{rid}/lost")
def lost(rid: int, payload: LostIn, db: DbSession, user: Perm("contracts", "edit"), locale: str = "ar"):
    r = _get(db, rid)
    _need(r, OPEN, "close as not renewing")
    r.stage, r.tenant_intent, r.lost_reason, r.next_follow_up = "lost", "leave", payload.reason, None
    _log(db, r, _actor(user), "lost", payload.note)
    if payload.create_listing and r.listing_id is None and has_permission(db, user, "website", "create"):
        r.listing_id = _create_listing(db, r)
        if r.listing_id:
            _log(db, r, "system", "listing_drafted", str(r.listing_id))
    return _done(db, r, locale)


@router.post("/{rid}/notes")
def add_note(rid: int, payload: NoteIn, db: DbSession, user: Perm("contracts", "edit"), locale: str = "ar"):
    r = _get(db, rid)
    if payload.next_follow_up:
        r.next_follow_up = payload.next_follow_up
    _log(db, r, _actor(user), "note", payload.note)
    return _done(db, r, locale)


# ───────────────────────── owner portal ─────────────────────────


@owner_router.get("")
def owner_renewals(db: DbSession, user: CurrentUser, as_owner: Optional[int] = Query(None, ge=1),
                   locale: str = Query("ar", pattern="^(ar|en)$")):
    oid = _owner_scope(db, user, as_owner)
    sync_cases(db)
    bids = [b.id for b in db.scalars(select(Building).where(Building.owner_id == oid)).all()]
    if not bids:
        return []
    rows = db.scalars(select(LeaseRenewal).where(LeaseRenewal.building_id.in_(bids)).order_by(LeaseRenewal.end_date.desc()).limit(200)).all()
    out = []
    for r in rows:
        d = _out(db, r, locale)
        for k in ("tenant_phone", "assignee_id", "next_follow_up", "follow_up_due"):
            d.pop(k, None)
        out.append(d)
    return out


@owner_router.post("/{rid}/decision")
def owner_decision(rid: int, payload: DecisionIn, db: DbSession, user: CurrentUser):
    if user.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can decide from the owner portal.")
    oid = _owner_scope(db, user, None)
    r = _get(db, rid)
    b = db.get(Building, r.building_id) if r.building_id else None
    if b is None or b.owner_id != oid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Renewal not found")
    workflow_decide(db, r, user, payload.approve, payload.note, f"owner: {_name(db.get(Owner, oid), 'ar')}")
    return {"ok": True, "stage": r.stage}
