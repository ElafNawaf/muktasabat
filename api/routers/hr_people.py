"""Employee files across the group (see api/hr_people_models.py).

Self-service: /hr/me/file…   HR: /hr/people/…, /hr/contracts…, /hr/assets…, /hr/companies…, /hr/org…
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import date, datetime, timedelta
from html import escape
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.deps import CurrentUser, DbSession
from api.hr_models import HrProfile
from api.hr_people_models import (
    HrAsset, HrAssetEvent, HrCompany, HrContract, HrContractTemplate, HrDepartment, HrFamilyMember, HrPersonal,
)
from api.services.hr_contract_docs import refresh_body
from api.models import User
from api.permissions import Perm, has_permission
from api.services import workflows as wf
from api.routers.hr import NON_STAFF, _approvers, _base, _cc, _profile, _require_staff, _send, _staff, _uname, today_riyadh

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/hr", tags=["hr-people"])

PERSONAL_FIELDS = (
    "first_name_ar", "father_name_ar", "family_name_ar", "first_name_en", "family_name_en", "date_of_birth", "gender",
    "marital_status", "religion", "id_type", "id_number", "id_expiry", "passport_number", "passport_country", "passport_issue",
    "passport_expiry", "personal_email", "personal_phone", "address", "city", "emergency_name", "emergency_relation",
    "emergency_phone", "gosi_number",
)
ASSET_KINDS = ("laptop", "desktop", "phone", "tablet", "car", "sim", "cash", "card", "keys", "uniform", "tools", "other")


# ───────────────────────── seeding / helpers ─────────────────────────


def seed_companies(db: Session) -> None:
    """First run: the holding company and the elevator subsidiary; existing staff join the holding."""
    if db.scalar(select(HrCompany.id).limit(1)):
        return
    hold = HrCompany(name_ar="شركة مكتسبات العقارية", name_en="Muktasabat Real Estate", short_code="MK", is_holding=True, color="#7B1A1A")
    db.add(hold)
    db.flush()
    db.add(HrCompany(name_ar="شركة إيلو للمصاعد", name_en="Eloo Elevators", short_code="EL", parent_id=hold.id, color="#1F4B99"))
    for p in db.scalars(select(HrProfile).where(HrProfile.company_id.is_(None))).all():
        p.company_id = hold.id
    db.commit()


def _personal(db: Session, user_id: int) -> HrPersonal:
    p = db.scalar(select(HrPersonal).where(HrPersonal.user_id == user_id))
    if p is None:
        p = HrPersonal(user_id=user_id)
        db.add(p)
        db.flush()
    return p


def _mask(v: Optional[str], keep: int = 4) -> Optional[str]:
    if not v:
        return v
    return "•" * max(0, len(v) - keep) + v[-keep:]


def _iso(v) -> Optional[str]:
    return v.isoformat() if v else None


def _cname(c: Optional[HrCompany], locale: str) -> Optional[str]:
    if not c:
        return None
    return c.name_ar if locale == "ar" else (c.name_en or c.name_ar)


def _dname(d: Optional[HrDepartment], locale: str) -> Optional[str]:
    if not d:
        return None
    return d.name_ar if locale == "ar" else (d.name_en or d.name_ar)


def contract_state(c: HrContract, today: date) -> str:
    """draft · pending_acceptance · upcoming · active · expired · terminated"""
    if c.status in ("draft", "pending_acceptance", "terminated"):
        return c.status
    if c.start_date > today:
        return "upcoming"
    if c.end_date and c.end_date < today:
        return "expired"
    return "active"


def active_contract(db: Session, user_id: int) -> Optional[HrContract]:
    today = today_riyadh()
    for c in db.scalars(select(HrContract).where(HrContract.user_id == user_id, HrContract.status == "accepted").order_by(HrContract.start_date.desc())).all():
        if contract_state(c, today) == "active":
            return c
    return None


def valid_signature(data: Optional[str]) -> Optional[str]:
    """A drawn signature: PNG data URL, decodes to a real PNG, at most ~300 KB."""
    import base64
    import binascii

    if not data:
        return None
    if not data.startswith("data:image/png;base64,"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The signature must be a PNG image.")
    try:
        raw = base64.b64decode(data.split(",", 1)[1], validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The signature image is damaged.")
    if not raw.startswith(b"\x89PNG\r\n\x1a\n") or len(raw) > 300_000 or len(raw) < 200:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The signature image is empty or too large.")
    return data


def stamp_company(db: Session, c: HrContract) -> None:
    """When a contract goes out, the company's authorised signatory signs it (if HR set one up)."""
    comp = db.get(HrCompany, c.company_id) if c.company_id else None
    if comp and comp.signature_data:
        c.company_signature = comp.signature_data
        c.company_signatory = " — ".join(x for x in (comp.signatory_name, comp.signatory_title) if x) or None
        c.company_signed_at = datetime.utcnow()
    else:
        c.company_signature = c.company_signatory = None
        c.company_signed_at = None


def needs_signed(db: Session, c: HrContract) -> bool:
    """Accepted contract with no signature yet: neither signed on screen nor a signed copy uploaded (or it was sent back)."""
    if c.status != "accepted" or c.employee_signature or c.signed_status in ("uploaded", "verified"):
        return False
    t = db.get(HrContractTemplate, c.template_id) if c.template_id else None
    return t.requires_signed_copy if t else bool(c.body)


def _contract_out(c: HrContract, db: Session, locale: str, show_salary: bool) -> dict:
    today = today_riyadh()
    total = (c.basic_salary or 0) + (c.housing_allowance or 0) + (c.transport_allowance or 0) + (c.other_allowance or 0)
    d = {
        "id": c.id, "number": c.number, "user_id": c.user_id, "company_id": c.company_id, "company": _cname(db.get(HrCompany, c.company_id), locale) if c.company_id else None,
        "contract_type": c.contract_type, "job_title": c.job_title, "start_date": _iso(c.start_date), "end_date": _iso(c.end_date),
        "probation_end": _iso(c.probation_end), "working_hours_week": c.working_hours_week, "annual_leave_days": c.annual_leave_days,
        "notice_days": c.notice_days, "terms": c.terms, "status": c.status, "state": contract_state(c, today),
        "sent_at": _iso(c.sent_at), "accepted_at": _iso(c.accepted_at), "accepted_name": c.accepted_name, "declined_note": c.declined_note,
        "terminated_at": _iso(c.terminated_at), "termination_reason": c.termination_reason,
        "days_left": (c.end_date - today).days if c.end_date else None,
        "template_id": c.template_id, "has_body": bool(c.body), "body_custom": c.body_custom,
        "signed_status": c.signed_status, "signed_filename": c.signed_filename, "signed_uploaded_at": _iso(c.signed_uploaded_at),
        "signed_uploaded_by": c.signed_uploaded_by, "signed_reviewed_at": _iso(c.signed_reviewed_at), "signed_reviewed_by": c.signed_reviewed_by,
        "signed_note": c.signed_note, "needs_signed": needs_signed(db, c),
        "signed_digitally": bool(c.employee_signature), "company_signed": bool(c.company_signature), "doc_hash": c.doc_hash,
    }
    if show_salary:
        d.update({"basic_salary": c.basic_salary, "housing_allowance": c.housing_allowance, "transport_allowance": c.transport_allowance,
                  "other_allowance": c.other_allowance, "other_allowance_label": c.other_allowance_label, "total_salary": total})
    return d


def _asset_out(a: HrAsset, db: Session, locale: str) -> dict:
    u = db.get(User, a.assigned_user_id) if a.assigned_user_id else None
    return {
        "id": a.id, "tag": a.tag, "company_id": a.company_id, "company": _cname(db.get(HrCompany, a.company_id), locale) if a.company_id else None,
        "kind": a.kind, "name": a.name, "brand_model": a.brand_model, "serial": a.serial, "value": a.value,
        "purchase_date": _iso(a.purchase_date), "warranty_end": _iso(a.warranty_end), "status": a.status,
        "assigned_user_id": a.assigned_user_id, "assigned_to": _uname(u, locale) if u else None, "assigned_at": _iso(a.assigned_at),
        "acknowledged_at": _iso(a.acknowledged_at), "condition": a.condition, "notes": a.notes,
    }


def employee_file(db: Session, user_id: int, locale: str, show_salary: bool, mask: bool = False) -> dict:
    u = db.get(User, user_id)
    if u is None or u.role in NON_STAFF:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    prof = _profile(db, user_id)
    per = _personal(db, user_id)
    db.commit()
    comp = db.get(HrCompany, prof.company_id) if prof.company_id else None
    dept = db.get(HrDepartment, prof.department_id) if prof.department_id else None
    mgr = db.get(User, prof.manager_user_id) if prof.manager_user_id else None
    personal = {k: (_iso(getattr(per, k)) if isinstance(getattr(per, k), date) else getattr(per, k)) for k in PERSONAL_FIELDS}
    bank = {"bank_name": per.bank_name, "iban": _mask(per.iban) if mask else per.iban, "account_holder": per.account_holder,
            "verified_at": _iso(per.bank_verified_at),
            "pending": ({"bank_name": per.pending_bank_name, "iban": per.pending_iban, "account_holder": per.pending_account_holder,
                         "at": _iso(per.pending_bank_at)} if per.pending_iban else None)}
    if mask:
        personal["id_number"] = _mask(personal.get("id_number"))
        personal["passport_number"] = _mask(personal.get("passport_number"), 3)
    contracts = db.scalars(select(HrContract).where(HrContract.user_id == user_id).order_by(HrContract.start_date.desc())).all()
    act = active_contract(db, user_id)
    assets = db.scalars(select(HrAsset).where(HrAsset.assigned_user_id == user_id).order_by(HrAsset.assigned_at.desc())).all()
    history = []
    for ev in db.scalars(select(HrAssetEvent).where(HrAssetEvent.user_id == user_id, HrAssetEvent.action == "returned").order_by(HrAssetEvent.id.desc()).limit(20)).all():
        a = db.get(HrAsset, ev.asset_id)
        if a:
            history.append({"tag": a.tag, "name": a.name, "kind": a.kind, "returned_at": _iso(ev.at), "note": ev.note})
    family = db.scalars(select(HrFamilyMember).where(HrFamilyMember.user_id == user_id).order_by(HrFamilyMember.id)).all()
    return {
        "user": {"id": u.id, "name": _uname(u, locale), "name_ar": u.full_name_ar, "name_en": u.full_name, "email": u.email, "phone": u.phone,
                 "username": u.username, "role": u.role},
        "job": {"employee_no": prof.employee_no, "job_title": prof.job_title or u.job_title, "company_id": prof.company_id, "company": _cname(comp, locale),
                "company_color": comp.color if comp else None, "department_id": prof.department_id, "department": _dname(dept, locale) or prof.department,
                "manager_user_id": prof.manager_user_id, "manager": _uname(mgr, locale) if mgr else None, "hire_date": _iso(prof.hire_date),
                "employment_status": prof.employment_status, "contract_type": prof.contract_type, "work_mode": prof.work_mode,
                "nationality": prof.nationality},
        "personal": personal, "bank": bank,
        "family": [{"id": f.id, "name": f.name, "relation": f.relation, "date_of_birth": _iso(f.date_of_birth),
                    "id_number": _mask(f.id_number) if mask else f.id_number, "passport_number": _mask(f.passport_number, 3) if mask else f.passport_number,
                    "dependent": f.dependent, "phone": f.phone, "notes": f.notes} for f in family],
        "salary": (_contract_out(act, db, locale, True) if act and show_salary else None),
        "salary_visible": show_salary,
        "contracts": [_contract_out(c, db, locale, show_salary) for c in contracts if c.status != "draft" or show_salary],
        "assets": [_asset_out(a, db, locale) for a in assets], "returned_assets": history,
        "updated_at": _iso(per.updated_at), "updated_by": per.updated_by,
    }


# ───────────────────────── schemas ─────────────────────────


IBAN_RE = re.compile(r"^SA\d{22}$")


class PersonalIn(BaseModel):
    first_name_ar: Optional[str] = Field(default=None, max_length=60)
    father_name_ar: Optional[str] = Field(default=None, max_length=60)
    family_name_ar: Optional[str] = Field(default=None, max_length=60)
    first_name_en: Optional[str] = Field(default=None, max_length=60)
    family_name_en: Optional[str] = Field(default=None, max_length=60)
    date_of_birth: Optional[date] = None
    gender: Optional[Literal["male", "female"]] = None
    marital_status: Optional[Literal["single", "married", "divorced", "widowed"]] = None
    religion: Optional[str] = Field(default=None, max_length=30)
    id_type: Optional[Literal["national_id", "iqama"]] = None
    id_number: Optional[str] = Field(default=None, max_length=20)
    id_expiry: Optional[date] = None
    passport_number: Optional[str] = Field(default=None, max_length=20)
    passport_country: Optional[str] = Field(default=None, max_length=60)
    passport_issue: Optional[date] = None
    passport_expiry: Optional[date] = None
    personal_email: Optional[str] = Field(default=None, max_length=120)
    personal_phone: Optional[str] = Field(default=None, max_length=20)
    address: Optional[str] = Field(default=None, max_length=300)
    city: Optional[str] = Field(default=None, max_length=60)
    emergency_name: Optional[str] = Field(default=None, max_length=120)
    emergency_relation: Optional[str] = Field(default=None, max_length=40)
    emergency_phone: Optional[str] = Field(default=None, max_length=20)
    gosi_number: Optional[str] = Field(default=None, max_length=20)

    @field_validator("id_number")
    @classmethod
    def _idn(cls, v):
        if v and not re.fullmatch(r"[12]\d{9}", v.strip()):
            raise ValueError("Saudi ID / Iqama numbers are 10 digits starting with 1 or 2.")
        return v.strip() if v else v


class BankIn(BaseModel):
    bank_name: str = Field(min_length=2, max_length=80)
    iban: str = Field(min_length=10, max_length=40)
    account_holder: str = Field(min_length=2, max_length=120)

    @field_validator("iban")
    @classmethod
    def _iban(cls, v):
        v = re.sub(r"\s+", "", v).upper()
        if not IBAN_RE.fullmatch(v):
            raise ValueError("A Saudi IBAN is SA followed by 22 digits.")
        # ISO 13616 mod-97 check
        n = int("".join(str(int(ch, 36)) for ch in (v[4:] + v[:4])))
        if n % 97 != 1:
            raise ValueError("This IBAN's check digits don't match. Please re-check it.")
        return v


class FamilyIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    relation: Literal["spouse", "son", "daughter", "father", "mother", "brother", "sister", "other"]
    date_of_birth: Optional[date] = None
    id_number: Optional[str] = Field(default=None, max_length=20)
    passport_number: Optional[str] = Field(default=None, max_length=20)
    dependent: bool = True
    phone: Optional[str] = Field(default=None, max_length=20)
    notes: Optional[str] = Field(default=None, max_length=200)


class ContractIn(BaseModel):
    user_id: int
    company_id: Optional[int] = None
    contract_type: Literal["fixed", "unlimited", "part_time", "temporary"] = "fixed"
    job_title: Optional[str] = Field(default=None, max_length=120)
    start_date: date
    end_date: Optional[date] = None
    probation_end: Optional[date] = None
    basic_salary: float = Field(ge=0, le=10_000_000)
    housing_allowance: float = Field(default=0, ge=0, le=10_000_000)
    transport_allowance: float = Field(default=0, ge=0, le=10_000_000)
    other_allowance: float = Field(default=0, ge=0, le=10_000_000)
    other_allowance_label: Optional[str] = Field(default=None, max_length=80)
    working_hours_week: Optional[int] = Field(default=48, ge=1, le=80)
    annual_leave_days: Optional[int] = Field(default=21, ge=0, le=60)
    notice_days: Optional[int] = Field(default=60, ge=0, le=365)
    terms: Optional[str] = Field(default=None, max_length=20000)
    template_id: Optional[int] = None
    # Text written by HR for this employee only; empty → generated from the template.
    body: Optional[str] = Field(default=None, max_length=60000)


class AcceptIn(BaseModel):
    accept: bool = True
    full_name: str = Field(min_length=3, max_length=160)  # typed name as e-signature
    note: Optional[str] = Field(default=None, max_length=500)
    signature: Optional[str] = Field(default=None, max_length=400_000)  # drawn signature, PNG data URL


class TerminateIn(BaseModel):
    end_on: date
    reason: str = Field(min_length=2, max_length=300)


class AssetIn(BaseModel):
    company_id: Optional[int] = None
    kind: Literal["laptop", "desktop", "phone", "tablet", "car", "sim", "cash", "card", "keys", "uniform", "tools", "other"]
    name: str = Field(min_length=2, max_length=160)
    brand_model: Optional[str] = Field(default=None, max_length=120)
    serial: Optional[str] = Field(default=None, max_length=80)
    value: Optional[float] = Field(default=None, ge=0, le=100_000_000)
    purchase_date: Optional[date] = None
    warranty_end: Optional[date] = None
    condition: Optional[Literal["new", "good", "fair", "damaged"]] = "good"
    notes: Optional[str] = Field(default=None, max_length=2000)
    status: Optional[Literal["in_stock", "maintenance", "lost", "retired"]] = None


class AssignIn(BaseModel):
    user_id: int
    on: Optional[date] = None
    note: Optional[str] = Field(default=None, max_length=300)


class ReturnIn(BaseModel):
    condition: Literal["new", "good", "fair", "damaged"] = "good"
    note: Optional[str] = Field(default=None, max_length=300)


class CompanyIn(BaseModel):
    name_ar: str = Field(min_length=2, max_length=160)
    name_en: Optional[str] = Field(default=None, max_length=160)
    short_code: Optional[str] = Field(default=None, max_length=10)
    parent_id: Optional[int] = None
    cr_number: Optional[str] = Field(default=None, max_length=30)
    color: Optional[str] = Field(default=None, max_length=9)
    office_lat: Optional[float] = Field(default=None, ge=-90, le=90)
    office_lng: Optional[float] = Field(default=None, ge=-180, le=180)
    geofence_radius_m: Optional[int] = Field(default=None, ge=5, le=2000)
    active: bool = True


class DepartmentIn(BaseModel):
    company_id: int
    parent_id: Optional[int] = None
    name_ar: str = Field(min_length=2, max_length=120)
    name_en: Optional[str] = Field(default=None, max_length=120)
    head_user_id: Optional[int] = None
    active: bool = True


class OrgIn(BaseModel):
    manager_user_id: Optional[int] = None
    company_id: Optional[int] = None
    department_id: Optional[int] = None
    job_title: Optional[str] = Field(default=None, max_length=120)


# ───────────────────────── self-service ─────────────────────────


@router.get("/me/file")
def my_file(db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    _require_staff(user)
    seed_companies(db)
    return employee_file(db, user.id, locale, show_salary=True)


def _apply_personal(db: Session, user_id: int, payload: PersonalIn, actor: str) -> None:
    per = _personal(db, user_id)
    for k, v in payload.model_dump().items():
        if isinstance(v, str):
            v = v.strip() or None
        setattr(per, k, v)
    per.updated_by = actor
    db.commit()


@router.put("/me/personal")
def update_my_personal(payload: PersonalIn, db: DbSession, user: CurrentUser):
    _require_staff(user)
    _apply_personal(db, user.id, payload, _uname(user, "ar"))
    return {"ok": True}


@router.put("/me/bank")
def request_bank_change(payload: BankIn, db: DbSession, user: CurrentUser):
    """Employees can't change where salary goes on their own: the new IBAN waits for HR approval."""
    _require_staff(user)
    per = _personal(db, user.id)
    per.pending_bank_name, per.pending_iban, per.pending_account_holder = payload.bank_name.strip(), payload.iban, payload.account_holder.strip()
    per.pending_bank_at = datetime.utcnow()
    tasks = wf.start(db, "bank_change", user.id, {"requester_id": user.id})
    db.commit()
    if not tasks:  # workflow switched off → applies straight away
        _apply_bank(db, user.id, True, None)
        return {"ok": True, "pending": False}
    wf.notify(db, tasks[0], f"طلب تغيير الحساب البنكي — {_uname(user, 'ar')}", f"Bank account change — {_uname(user, 'en')}",
              f"<p>طلب <strong>{escape(_uname(user, 'ar'))}</strong> تغيير حساب الراتب إلى {escape(payload.bank_name)} — {escape(_mask(payload.iban))}. "
              "يرجى التحقق من شهادة الآيبان قبل الاعتماد.</p>",
              f"<p><strong>{escape(_uname(user, 'en'))}</strong> asked to change their salary account to {escape(payload.bank_name)} — {escape(_mask(payload.iban))}. "
              "Please check the IBAN certificate before approving.</p>",
              f"{_base()}/ar/approvals")
    return {"ok": True, "pending": True}


@router.delete("/me/bank/pending")
def cancel_bank_change(db: DbSession, user: CurrentUser):
    per = _personal(db, user.id)
    per.pending_bank_name = per.pending_iban = per.pending_account_holder = None
    per.pending_bank_at = None
    db.commit()
    return {"ok": True}


def _family_owned(db: Session, fid: int, user_id: int) -> HrFamilyMember:
    f = db.get(HrFamilyMember, fid)
    if f is None or f.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Family member not found")
    return f


@router.post("/me/family", status_code=201)
def add_my_family(payload: FamilyIn, db: DbSession, user: CurrentUser):
    _require_staff(user)
    db.add(HrFamilyMember(user_id=user.id, **payload.model_dump()))
    db.commit()
    return {"ok": True}


@router.put("/me/family/{fid}")
def edit_my_family(fid: int, payload: FamilyIn, db: DbSession, user: CurrentUser):
    f = _family_owned(db, fid, user.id)
    for k, v in payload.model_dump().items():
        setattr(f, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/me/family/{fid}")
def delete_my_family(fid: int, db: DbSession, user: CurrentUser):
    db.delete(_family_owned(db, fid, user.id))
    db.commit()
    return {"ok": True}


@router.post("/me/contracts/{cid}/respond")
def respond_contract(cid: int, payload: AcceptIn, request: Request, db: DbSession, user: CurrentUser):
    c = db.get(HrContract, cid)
    if c is None or c.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    if c.status != "pending_acceptance":
        raise HTTPException(status.HTTP_409_CONFLICT, "This contract isn't waiting for your response.")
    if payload.accept:
        sig = valid_signature(payload.signature)
        if sig is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Sign in the box to accept the contract.")
        refresh_body(db, c)
        c.status, c.accepted_at, c.accepted_name = "accepted", datetime.utcnow(), payload.full_name.strip()
        c.employee_signature = sig
        import hashlib

        c.doc_hash = hashlib.sha256(f"{c.number}|{c.body or ''}|{c.basic_salary}|{c.housing_allowance}|{c.transport_allowance}|{c.other_allowance}|{c.start_date}|{c.end_date}".encode()).hexdigest()
        c.accepted_ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "") or "").split(",")[0][:64]
        prof = _profile(db, user.id)
        if c.job_title:
            prof.job_title = c.job_title
        if c.company_id:
            prof.company_id = c.company_id
        if c.annual_leave_days is not None:
            prof.annual_leave_days = float(c.annual_leave_days)
        if not prof.hire_date:
            prof.hire_date = c.start_date
        prof.contract_type = "part_time" if c.contract_type == "part_time" else "full_time"
    else:
        c.status, c.declined_note = "draft", (payload.note or "").strip() or "—"
    db.commit()
    ok_ar, ok_en = ("وافق على", "accepted") if payload.accept else ("طلب تعديل", "asked for changes to")
    for a in _approvers(db, exclude_user_id=user.id):
        _send(a.email, _cc(db) if payload.accept else [], f"{_uname(user, 'ar')} {ok_ar} العقد {c.number} | {_uname(user, 'en')} {ok_en} contract {c.number}",
              f"<p>{escape(_uname(user, 'ar'))} {ok_ar} عقد العمل {c.number}.</p>" + (f"<p>{escape(payload.note)}</p>" if payload.note else ""),
              f"<p>{escape(_uname(user, 'en'))} {ok_en} employment contract {c.number}.</p>" + (f"<p>{escape(payload.note)}</p>" if payload.note else ""),
              f"{_base()}/ar/hr/people/{user.id}", "ملف الموظف", "Employee file")
    return {"ok": True, "status": c.status}


@router.post("/me/assets/{aid}/acknowledge")
def acknowledge_asset(aid: int, db: DbSession, user: CurrentUser):
    a = db.get(HrAsset, aid)
    if a is None or a.assigned_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
    if not a.acknowledged_at:
        a.acknowledged_at = datetime.utcnow()
        db.add(HrAssetEvent(asset_id=a.id, actor=_uname(user, "ar"), action="acknowledged", user_id=user.id))
        db.commit()
    return {"ok": True}


# ───────────────────────── HR: employee files ─────────────────────────


@router.get("/people/{user_id}")
def person_file(user_id: int, db: DbSession, user: Perm("hr", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    seed_companies(db)
    show = has_permission(db, user, "hr", "approve") or user_id == user.id
    out = employee_file(db, user_id, locale, show_salary=show, mask=not has_permission(db, user, "hr", "edit"))
    out["can"] = {"edit": has_permission(db, user, "hr", "edit"), "approve": has_permission(db, user, "hr", "approve")}
    return out


@router.put("/people/{user_id}/personal")
def update_personal(user_id: int, payload: PersonalIn, db: DbSession, user: Perm("hr", "edit")):
    _apply_personal(db, user_id, payload, _uname(user, "ar"))
    return {"ok": True}


@router.put("/people/{user_id}/bank")
def set_bank(user_id: int, payload: BankIn, db: DbSession, user: Perm("hr", "approve")):
    per = _personal(db, user_id)
    per.bank_name, per.iban, per.account_holder = payload.bank_name.strip(), payload.iban, payload.account_holder.strip()
    per.bank_verified_at = datetime.utcnow()
    per.pending_bank_name = per.pending_iban = per.pending_account_holder = None
    per.pending_bank_at = None
    db.commit()
    return {"ok": True}


def _apply_bank(db: Session, user_id: int, approve: bool, by: Optional[User]) -> None:
    per = _personal(db, user_id)
    if approve:
        per.bank_name, per.iban, per.account_holder = per.pending_bank_name, per.pending_iban, per.pending_account_holder
        per.bank_verified_at = datetime.utcnow()
    per.pending_bank_name = per.pending_iban = per.pending_account_holder = None
    per.pending_bank_at = None
    db.commit()
    emp = db.get(User, user_id)
    ok_ar, ok_en = ("اعتُمد", "approved") if approve else ("رُفض", "declined")
    who_ar, who_en = (_uname(by, "ar"), _uname(by, "en")) if by else ("اعتماد تلقائي", "automatic approval")
    _send(emp.email if emp else None, [], f"{ok_ar} تغيير الحساب البنكي | Bank account change {ok_en}",
          f"<p>{ok_ar} طلب تغيير حساب الراتب من قِبل {escape(who_ar)}.</p>",
          f"<p>Your salary account change was {ok_en} by {escape(who_en)}.</p>", f"{_base()}/ar/my-hr/file", "ملفي الوظيفي", "My file")


def workflow_decide_bank(db: Session, user_id: int, user: User, approve: bool, note: Optional[str] = None) -> str:
    if user_id == user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't approve your own bank change.")
    per = _personal(db, user_id)
    if not per.pending_iban:
        raise HTTPException(status.HTTP_409_CONFLICT, "No bank change is waiting.")
    result, nxt = wf.decide(db, "bank_change", user_id, user, approve, note, ctx_fn=lambda: {"requester_id": user_id})
    if result == "pending":
        db.commit()
        emp = db.get(User, user_id)
        wf.notify(db, nxt, f"تغيير حساب بنكي — {_uname(emp, 'ar')}", f"Bank account change — {_uname(emp, 'en')}",
                  "<p>طلب تغيير حساب الراتب بانتظار اعتمادك.</p>", "<p>A salary account change is waiting for your approval.</p>", f"{_base()}/ar/approvals")
        return "pending"
    _apply_bank(db, user_id, result == "approved", user)
    return result


@router.post("/people/{user_id}/bank/decision")
def decide_bank(user_id: int, db: DbSession, user: CurrentUser, approve: bool = Query(...)):
    return {"ok": True, "result": workflow_decide_bank(db, user_id, user, approve)}


@router.post("/people/{user_id}/family", status_code=201)
def hr_add_family(user_id: int, payload: FamilyIn, db: DbSession, user: Perm("hr", "edit")):
    db.add(HrFamilyMember(user_id=user_id, **payload.model_dump()))
    db.commit()
    return {"ok": True}


@router.put("/people/{user_id}/family/{fid}")
def hr_edit_family(user_id: int, fid: int, payload: FamilyIn, db: DbSession, user: Perm("hr", "edit")):
    f = _family_owned(db, fid, user_id)
    for k, v in payload.model_dump().items():
        setattr(f, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/people/{user_id}/family/{fid}")
def hr_delete_family(user_id: int, fid: int, db: DbSession, user: Perm("hr", "edit")):
    db.delete(_family_owned(db, fid, user_id))
    db.commit()
    return {"ok": True}


# ───────────────────────── HR: contracts ─────────────────────────


def _contract_get(db: Session, cid: int) -> HrContract:
    c = db.get(HrContract, cid)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    return c


def _contract_validate(db: Session, payload: ContractIn) -> None:
    u = db.get(User, payload.user_id)
    if u is None or u.role in NON_STAFF:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    if payload.end_date and payload.end_date <= payload.start_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The end date must be after the start date.")
    if payload.contract_type == "fixed" and not payload.end_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A fixed-term contract needs an end date.")
    if payload.template_id is not None and db.get(HrContractTemplate, payload.template_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    if payload.probation_end and payload.probation_end > payload.start_date + timedelta(days=180):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Probation can't exceed 180 days (Saudi Labor Law).")


@router.post("/contracts", status_code=201)
def create_contract(payload: ContractIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    _contract_validate(db, payload)
    seed_companies(db)
    comp_id = payload.company_id or _profile(db, payload.user_id).company_id
    comp = db.get(HrCompany, comp_id) if comp_id else None
    data = payload.model_dump()
    body = (data.pop("body") or "").strip() or None
    c = HrContract(number=f"tmp-{uuid.uuid4().hex[:10]}", created_by_id=user.id, **dict(data, company_id=comp_id))
    c.body, c.body_custom = body, bool(body)
    db.add(c)
    db.flush()
    c.number = f"{(comp.short_code if comp and comp.short_code else 'HR')}-EC-{c.id:04d}"
    refresh_body(db, c)
    db.commit()
    return _contract_out(c, db, locale, True)


@router.put("/contracts/{cid}")
def edit_contract(cid: int, payload: ContractIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    c = _contract_get(db, cid)
    if c.status not in ("draft", "pending_acceptance"):
        raise HTTPException(status.HTTP_409_CONFLICT, "An accepted contract can't be edited. Create a new contract (amendment) instead.")
    _contract_validate(db, payload)
    data = payload.model_dump()
    body = (data.pop("body") or "").strip() or None
    for k, v in data.items():
        setattr(c, k, v)
    c.body_custom = bool(body)
    if body:
        c.body = body
    c.status, c.sent_at = "draft", None
    refresh_body(db, c)
    db.commit()
    return _contract_out(c, db, locale, True)


@router.post("/contracts/{cid}/send")
def send_contract(cid: int, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    c = _contract_get(db, cid)
    if c.status != "draft":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a draft can be sent for acceptance.")
    refresh_body(db, c)
    stamp_company(db, c)
    c.status, c.sent_at, c.declined_note = "pending_acceptance", datetime.utcnow(), None
    db.commit()
    emp = db.get(User, c.user_id)
    _send(emp.email if emp else None, [], f"عقد عمل بانتظار موافقتك {c.number} | Employment contract to review {c.number}",
          f"<p>أُرسل إليك عقد العمل {c.number} ({c.start_date}{f' → {c.end_date}' if c.end_date else ''}). راجع البنود والراتب ثم وافق أو اطلب تعديلًا.</p>",
          f"<p>Your employment contract {c.number} ({c.start_date}{f' → {c.end_date}' if c.end_date else ''}) is ready. Review the terms and salary, then accept or ask for changes.</p>",
          f"{_base()}/ar/my-hr/file?tab=contracts", "مراجعة العقد", "Review contract")
    return _contract_out(c, db, locale, True)


@router.post("/contracts/{cid}/terminate")
def terminate_contract(cid: int, payload: TerminateIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    c = _contract_get(db, cid)
    if c.status != "accepted":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only an accepted contract can be ended.")
    c.status, c.terminated_at, c.termination_reason = "terminated", payload.end_on, payload.reason
    db.commit()
    return _contract_out(c, db, locale, True)


@router.delete("/contracts/{cid}")
def delete_contract(cid: int, db: DbSession, user: Perm("hr", "approve")):
    c = _contract_get(db, cid)
    if c.status != "draft":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only drafts can be deleted.")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.get("/contracts")
def list_contracts(db: DbSession, user: Perm("hr", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    show = has_permission(db, user, "hr", "approve")
    rows = db.scalars(select(HrContract).order_by(HrContract.start_date.desc())).all()
    out = []
    for c in rows:
        d = _contract_out(c, db, locale, show)
        d["employee"] = _uname(db.get(User, c.user_id), locale)
        out.append(d)
    return out


# ───────────────────────── HR: assets ─────────────────────────


def _asset_get(db: Session, aid: int) -> HrAsset:
    a = db.get(HrAsset, aid)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
    return a


@router.get("/assets")
def list_assets(db: DbSession, user: Perm("hr", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    seed_companies(db)
    return [_asset_out(a, db, locale) for a in db.scalars(select(HrAsset).order_by(HrAsset.id.desc())).all()]


@router.get("/assets/{aid}")
def get_asset(aid: int, db: DbSession, user: Perm("hr", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    a = _asset_get(db, aid)
    out = _asset_out(a, db, locale)
    out["events"] = [{"at": e.at.isoformat(), "actor": e.actor, "action": e.action, "note": e.note,
                      "user": _uname(db.get(User, e.user_id), locale) if e.user_id else None}
                     for e in db.scalars(select(HrAssetEvent).where(HrAssetEvent.asset_id == a.id).order_by(HrAssetEvent.id.desc())).all()]
    return out


@router.post("/assets", status_code=201)
def create_asset(payload: AssetIn, db: DbSession, user: Perm("hr", "edit"), locale: str = Query("ar", pattern="^(ar|en)$")):
    seed_companies(db)
    data = payload.model_dump()
    data.pop("status", None)
    comp = db.get(HrCompany, payload.company_id) if payload.company_id else db.scalar(select(HrCompany).where(HrCompany.is_holding.is_(True)))
    a = HrAsset(tag=f"tmp-{uuid.uuid4().hex[:10]}", status="in_stock", **dict(data, company_id=comp.id if comp else None))
    db.add(a)
    db.flush()
    a.tag = f"{(comp.short_code if comp and comp.short_code else 'AS')}-{payload.kind[:3].upper()}-{a.id:04d}"
    db.add(HrAssetEvent(asset_id=a.id, actor=_uname(user, "ar"), action="created"))
    db.commit()
    return _asset_out(a, db, locale)


@router.put("/assets/{aid}")
def edit_asset(aid: int, payload: AssetIn, db: DbSession, user: Perm("hr", "edit"), locale: str = Query("ar", pattern="^(ar|en)$")):
    a = _asset_get(db, aid)
    data = payload.model_dump()
    new_status = data.pop("status", None)
    for k, v in data.items():
        setattr(a, k, v)
    if new_status and new_status != a.status:
        if a.assigned_user_id and new_status != "lost":
            raise HTTPException(status.HTTP_409_CONFLICT, "Record the return first; an assigned asset can only be marked lost.")
        a.status = new_status
        db.add(HrAssetEvent(asset_id=a.id, actor=_uname(user, "ar"), action="status", note=new_status, user_id=a.assigned_user_id))
    else:
        db.add(HrAssetEvent(asset_id=a.id, actor=_uname(user, "ar"), action="edited"))
    db.commit()
    return _asset_out(a, db, locale)


@router.post("/assets/{aid}/assign")
def assign_asset(aid: int, payload: AssignIn, db: DbSession, user: Perm("hr", "edit"), locale: str = Query("ar", pattern="^(ar|en)$")):
    a = _asset_get(db, aid)
    if a.assigned_user_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "This asset is already with someone. Record its return first.")
    if a.status in ("lost", "retired"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {a.status} asset can't be assigned.")
    emp = db.get(User, payload.user_id)
    if emp is None or emp.role in NON_STAFF:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    a.assigned_user_id, a.assigned_at, a.acknowledged_at, a.status = emp.id, payload.on or today_riyadh(), None, "assigned"
    db.add(HrAssetEvent(asset_id=a.id, actor=_uname(user, "ar"), action="assigned", user_id=emp.id, note=payload.note))
    db.commit()
    _send(emp.email, [], f"عهدة جديدة باسمك {a.tag} | New asset in your custody {a.tag}",
          f"<p>سُلّمت إليك العهدة: <strong>{escape(a.name)}</strong> ({escape(a.tag)}). أكّد الاستلام من ملفك الوظيفي.</p>",
          f"<p>You've been given: <strong>{escape(a.name)}</strong> ({escape(a.tag)}). Please confirm receipt in your employee file.</p>",
          f"{_base()}/ar/my-hr/file?tab=assets", "تأكيد الاستلام", "Confirm receipt")
    return _asset_out(a, db, locale)


@router.post("/assets/{aid}/return")
def return_asset(aid: int, payload: ReturnIn, db: DbSession, user: Perm("hr", "edit"), locale: str = Query("ar", pattern="^(ar|en)$")):
    a = _asset_get(db, aid)
    if not a.assigned_user_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "This asset isn't assigned to anyone.")
    db.add(HrAssetEvent(asset_id=a.id, actor=_uname(user, "ar"), action="returned", user_id=a.assigned_user_id,
                        note=f"{payload.condition}" + (f" — {payload.note}" if payload.note else "")))
    a.assigned_user_id, a.assigned_at, a.acknowledged_at = None, None, None
    a.status, a.condition = ("maintenance" if payload.condition == "damaged" else "in_stock"), payload.condition
    db.commit()
    return _asset_out(a, db, locale)


# ───────────────────────── HR: companies, departments, org chart ─────────────────────────


@router.get("/companies")
def companies(db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    _require_staff(user)
    seed_companies(db)
    profs = db.scalars(select(HrProfile)).all()
    staff_ids = {u.id for u in _staff(db, working_only=True)}
    out = []
    for c in db.scalars(select(HrCompany).order_by(HrCompany.is_holding.desc(), HrCompany.id)).all():
        depts = db.scalars(select(HrDepartment).where(HrDepartment.company_id == c.id).order_by(HrDepartment.id)).all()
        out.append({
            "id": c.id, "name_ar": c.name_ar, "name_en": c.name_en, "name": _cname(c, locale), "short_code": c.short_code, "is_holding": c.is_holding,
            "parent_id": c.parent_id, "cr_number": c.cr_number, "color": c.color, "office_lat": c.office_lat, "office_lng": c.office_lng,
            "geofence_radius_m": c.geofence_radius_m, "active": c.active,
            "logo_url": c.logo_url, "signatory_name": c.signatory_name, "signatory_title": c.signatory_title, "has_signature": bool(c.signature_data),
            "headcount": sum(1 for p in profs if p.company_id == c.id and p.user_id in staff_ids),
            "departments": [{"id": d.id, "name_ar": d.name_ar, "name_en": d.name_en, "name": _dname(d, locale), "parent_id": d.parent_id,
                             "head_user_id": d.head_user_id, "head": _uname(db.get(User, d.head_user_id), locale) if d.head_user_id else None,
                             "active": d.active, "headcount": sum(1 for p in profs if p.department_id == d.id and p.user_id in staff_ids)} for d in depts],
        })
    return out


@router.post("/companies", status_code=201)
def create_company(payload: CompanyIn, db: DbSession, user: Perm("hr", "approve")):
    c = HrCompany(**payload.model_dump())
    db.add(c)
    db.commit()
    return {"ok": True, "id": c.id}


@router.put("/companies/{cid}")
def edit_company(cid: int, payload: CompanyIn, db: DbSession, user: Perm("hr", "approve")):
    c = db.get(HrCompany, cid)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    if payload.parent_id == cid:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A company can't be its own parent.")
    for k, v in payload.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return {"ok": True}


@router.post("/departments", status_code=201)
def create_department(payload: DepartmentIn, db: DbSession, user: Perm("hr", "edit")):
    if db.get(HrCompany, payload.company_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    d = HrDepartment(**payload.model_dump())
    db.add(d)
    db.commit()
    return {"ok": True, "id": d.id}


@router.put("/departments/{did}")
def edit_department(did: int, payload: DepartmentIn, db: DbSession, user: Perm("hr", "edit")):
    d = db.get(HrDepartment, did)
    if d is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Department not found")
    if payload.parent_id == did:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A department can't be its own parent.")
    for k, v in payload.model_dump().items():
        setattr(d, k, v)
    db.commit()
    return {"ok": True}


@router.get("/org")
def org_chart(db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    """Everyone may see the org chart (names, titles, reporting lines); no personal data."""
    _require_staff(user)
    seed_companies(db)
    comps = {c.id: c for c in db.scalars(select(HrCompany)).all()}
    depts = {d.id: d for d in db.scalars(select(HrDepartment)).all()}
    nodes = []
    for u in _staff(db, working_only=True):
        p = _profile(db, u.id)
        c = comps.get(p.company_id) if p.company_id else None
        d = depts.get(p.department_id) if p.department_id else None
        nodes.append({"user_id": u.id, "name": _uname(u, locale), "job_title": p.job_title or u.job_title, "manager_user_id": p.manager_user_id,
                      "company_id": p.company_id, "company": _cname(c, locale), "company_color": c.color if c else None,
                      "department_id": p.department_id, "department": _dname(d, locale) or p.department, "avatar_url": u.avatar_url})
    db.commit()
    ids = {n["user_id"] for n in nodes}
    for n in nodes:  # managers who left / are excluded → treat as top level
        if n["manager_user_id"] not in ids:
            n["manager_user_id"] = None
    return {"nodes": nodes, "can_edit": has_permission(db, user, "hr", "edit")}


@router.put("/org/{user_id}")
def set_reporting(user_id: int, payload: OrgIn, db: DbSession, user: Perm("hr", "edit")):
    if payload.manager_user_id == user_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Someone can't report to themselves.")
    # cycle check: walk up from the new manager
    seen, cur = set(), payload.manager_user_id
    while cur:
        if cur == user_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That would create a loop: the new manager already reports to this person.")
        if cur in seen:
            break
        seen.add(cur)
        cur = _profile(db, cur).manager_user_id
    p = _profile(db, user_id)
    p.manager_user_id = payload.manager_user_id
    if payload.company_id is not None:
        p.company_id = payload.company_id
    if payload.department_id is not None:
        d = db.get(HrDepartment, payload.department_id) if payload.department_id else None
        p.department_id = d.id if d else None
        if d:
            p.department = d.name_ar
            p.company_id = d.company_id
    if payload.job_title is not None:
        p.job_title = payload.job_title or None
    db.commit()
    return {"ok": True}


# ───────────────────────── alerts used by the HR dashboard ─────────────────────────


def expiring(db: Session, locale: str, days: int = 60) -> list[dict]:
    today = today_riyadh()
    lim = today + timedelta(days=days)
    staff = {u.id: u for u in _staff(db, working_only=True)}
    out = []
    for per in db.scalars(select(HrPersonal)).all():
        u = staff.get(per.user_id)
        if not u:
            continue
        for kind, dt in (("id", per.id_expiry), ("passport", per.passport_expiry)):
            if dt and dt <= lim:
                out.append({"user_id": u.id, "name": _uname(u, locale), "kind": kind, "date": dt.isoformat(), "days": (dt - today).days})
        if per.pending_iban:
            out.append({"user_id": u.id, "name": _uname(u, locale), "kind": "bank_change", "date": _iso(per.pending_bank_at)[:10] if per.pending_bank_at else None, "days": 0})
    for c in db.scalars(select(HrContract).where(HrContract.status == "accepted", HrContract.end_date.is_not(None))).all():
        u = staff.get(c.user_id)
        if u and today <= c.end_date <= lim:
            out.append({"user_id": u.id, "name": _uname(u, locale), "kind": "contract", "date": c.end_date.isoformat(), "days": (c.end_date - today).days, "ref": c.number})
    for c in db.scalars(select(HrContract).where(HrContract.status == "accepted", HrContract.probation_end.is_not(None))).all():
        u = staff.get(c.user_id)
        if u and today <= c.probation_end <= today + timedelta(days=14):
            out.append({"user_id": u.id, "name": _uname(u, locale), "kind": "probation", "date": c.probation_end.isoformat(), "days": (c.probation_end - today).days, "ref": c.number})
    out.sort(key=lambda x: x["days"])
    return out


@router.get("/expiring")
def expiring_items(db: DbSession, user: Perm("hr", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    return expiring(db, locale)
