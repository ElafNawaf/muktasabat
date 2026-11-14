"""Attendance zones (مواقع الحضور) and who may check in where.

HR managers (hr.approve) define zones per group company — a point and a radius — and set,
per employee: work mode (office / hybrid / remote), which zones count for office attendance
(their company's zones, specific zones, or any zone) and the check-out rule.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.deps import DbSession
from api.hr_models import Attendance, HrProfile, HrWorkSite
from api.hr_people_models import HrCompany
from api.permissions import Perm
from api.routers.hr import _profile, _settings, _staff, _uname, local_now, seed_sites, site_ids, sites_for

router = APIRouter(prefix="/hr", tags=["hr-sites"])


class SiteIn(BaseModel):
    company_id: Optional[int] = None
    name_ar: str = Field(min_length=2, max_length=120)
    name_en: Optional[str] = Field(default=None, max_length=120)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    radius_m: int = Field(default=15, ge=5, le=2000)
    address: Optional[str] = Field(default=None, max_length=300)
    active: bool = True


class AssignIn(BaseModel):
    work_mode: Literal["office", "hybrid", "remote"] = "office"
    remote_days: list[int] = Field(default_factory=list)
    site_policy: Literal["company", "custom", "any"] = "company"
    site_ids: list[int] = Field(default_factory=list)
    checkout_rule: Literal["site", "anywhere"] = "site"


class BulkAssignIn(AssignIn):
    user_ids: list[int] = Field(min_length=1, max_length=500)


def _site_out(db: Session, st: HrWorkSite, locale: str, today_in: dict[int, int]) -> dict:
    c = db.get(HrCompany, st.company_id) if st.company_id else None
    return {
        "id": st.id, "company_id": st.company_id, "company": (c.name_ar if locale == "ar" else (c.name_en or c.name_ar)) if c else None,
        "company_color": c.color if c else None, "name_ar": st.name_ar, "name_en": st.name_en,
        "name": st.name_ar if locale == "ar" else (st.name_en or st.name_ar), "lat": st.lat, "lng": st.lng, "radius_m": st.radius_m,
        "address": st.address, "active": st.active, "updated_by": st.updated_by, "checked_in_today": today_in.get(st.id, 0),
    }


@router.get("/sites")
def list_sites(db: DbSession, user: Perm("hr", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    s = _settings(db)
    seed_sites(db, s)
    today = local_now().date()
    today_in: dict[int, int] = {}
    for a in db.scalars(select(Attendance).where(Attendance.day == today, Attendance.in_site_id.is_not(None))).all():
        today_in[a.in_site_id] = today_in.get(a.in_site_id, 0) + 1
    sites = db.scalars(select(HrWorkSite).order_by(HrWorkSite.active.desc(), HrWorkSite.company_id, HrWorkSite.id)).all()
    comps = {c.id: c for c in db.scalars(select(HrCompany)).all()}
    people = []
    for u in _staff(db, working_only=True):
        p = _profile(db, u.id)
        allowed = sites_for(db, s, p)
        c = comps.get(p.company_id) if p.company_id else None
        people.append({
            "user_id": u.id, "name": _uname(u, locale), "job_title": p.job_title or u.job_title,
            "company_id": p.company_id, "company": (c.name_ar if locale == "ar" else (c.name_en or c.name_ar)) if c else None,
            "company_code": c.short_code if c else None, "work_mode": p.work_mode or "office",
            "remote_days": site_ids(p.remote_days), "site_policy": p.site_policy or "company", "site_ids": site_ids(p.site_ids),
            "checkout_rule": p.checkout_rule or "site", "allowed": [x.id for x in allowed],
        })
    db.commit()
    return {
        "sites": [_site_out(db, x, locale, today_in) for x in sites], "people": people,
        "defaults": {"radius": s.geofence_radius_m, "enforce": s.enforce_location, "max_accuracy": s.max_accuracy_m},
    }


def _check_company(db: Session, cid: Optional[int]) -> None:
    if cid is not None and db.get(HrCompany, cid) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")


@router.post("/sites", status_code=201)
def create_site(payload: SiteIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    _check_company(db, payload.company_id)
    st = HrWorkSite(**payload.model_dump(), updated_by=_uname(user, "ar"))
    db.add(st)
    db.commit()
    return _site_out(db, st, locale, {})


@router.put("/sites/{sid}")
def edit_site(sid: int, payload: SiteIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    st = db.get(HrWorkSite, sid)
    if st is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Location not found")
    _check_company(db, payload.company_id)
    if not payload.active and st.active:
        _guard_last(db, st)
    for k, v in payload.model_dump().items():
        setattr(st, k, v)
    st.updated_by = _uname(user, "ar")
    db.commit()
    return _site_out(db, st, locale, {})


def _guard_last(db: Session, st: HrWorkSite) -> None:
    others = db.scalar(select(func.count(HrWorkSite.id)).where(HrWorkSite.active.is_(True), HrWorkSite.id != st.id)) or 0
    if others == 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Keep at least one active check-in location.")


@router.delete("/sites/{sid}")
def delete_site(sid: int, db: DbSession, user: Perm("hr", "approve")):
    st = db.get(HrWorkSite, sid)
    if st is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Location not found")
    _guard_last(db, st)
    used = db.scalar(select(func.count(Attendance.id)).where((Attendance.in_site_id == sid) | (Attendance.out_site_id == sid))) or 0
    # Employees limited to this zone only would be left with nowhere: drop it from their list.
    for p in db.scalars(select(HrProfile).where(HrProfile.site_ids.is_not(None))).all():
        ids = [i for i in site_ids(p.site_ids) if i != sid]
        p.site_ids = ",".join(map(str, ids)) or None
        if p.site_policy == "custom" and not ids:
            p.site_policy = "company"
    if used:
        st.active = False  # attendance history points at it
    else:
        db.delete(st)
    db.commit()
    return {"ok": True, "archived": bool(used)}


def _apply(db: Session, p: HrProfile, a: AssignIn) -> None:
    valid = {x.id for x in db.scalars(select(HrWorkSite).where(HrWorkSite.active.is_(True))).all()}
    ids = [i for i in dict.fromkeys(a.site_ids) if i in valid]
    if a.site_policy == "custom" and not ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick at least one location for this employee.")
    if a.work_mode == "hybrid" and not a.remote_days:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick the remote days for a hybrid schedule.")
    p.work_mode = a.work_mode
    p.remote_days = ",".join(str(d) for d in sorted(set(a.remote_days)) if 0 <= d <= 6) if a.work_mode == "hybrid" else None
    p.site_policy = a.site_policy
    p.site_ids = ",".join(map(str, ids)) if a.site_policy == "custom" else None
    p.checkout_rule = a.checkout_rule


@router.put("/sites-assign/{user_id}")
def assign(user_id: int, payload: AssignIn, db: DbSession, user: Perm("hr", "approve")):
    if user_id not in {u.id for u in _staff(db, working_only=False)}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    _apply(db, _profile(db, user_id), payload)
    db.commit()
    return {"ok": True}


@router.put("/sites-assign")
def assign_bulk(payload: BulkAssignIn, db: DbSession, user: Perm("hr", "approve")):
    staff = {u.id for u in _staff(db, working_only=False)}
    n = 0
    for uid in dict.fromkeys(payload.user_ids):
        if uid in staff:
            _apply(db, _profile(db, uid), payload)
            n += 1
    db.commit()
    return {"ok": True, "updated": n, "at": datetime.utcnow().isoformat()}
