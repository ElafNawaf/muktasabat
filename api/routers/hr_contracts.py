"""Employment-contract templates, contract documents and signed copies.

HR (hr.approve) maintains templates per company; contracts are generated from them,
sent to the employee, accepted with a typed name, then printed, signed and the signed
copy uploaded as evidence. HR verifies the copy (or sends it back).

Signed copies are personal data: stored under `private/…` (never served by /uploads)
and downloaded only by the employee or users with hr.view.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta
from html import escape
from typing import Literal, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api import storage
from api.config import get_settings
from api.deps import CurrentUser, DbSession
from api.hr_people_models import HrCompany, HrContract, HrContractTemplate
from api.models import User
from api.permissions import Perm, has_permission
from api.routers.hr import _approvers, _base, _cc, _profile, _send, _staff, _uname
from api.routers.hr_people import _cname, _contract_out, active_contract, needs_signed, seed_companies
from api.services.hr_contract_docs import PLACEHOLDERS, context, refresh_body, render, render_contract, seed_templates, unknown_tokens

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/hr", tags=["hr-contracts"])

MAX_SIGNED_BYTES = 15 * 1024 * 1024
SIGNED_TYPES = {"application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"}


# ───────────────────────── templates ─────────────────────────


class TemplateIn(BaseModel):
    company_id: Optional[int] = None
    name: str = Field(min_length=2, max_length=120)
    contract_type: Literal["fixed", "unlimited", "part_time", "temporary"] = "fixed"
    body_ar: str = Field(min_length=20, max_length=60000)
    body_en: Optional[str] = Field(default=None, max_length=60000)
    probation_days: int = Field(default=90, ge=0, le=180)
    duration_months: Optional[int] = Field(default=12, ge=1, le=120)
    working_hours_week: int = Field(default=48, ge=1, le=80)
    annual_leave_days: int = Field(default=21, ge=21, le=60)  # Saudi Labor Law minimum is 21
    notice_days: int = Field(default=60, ge=0, le=365)
    requires_signed_copy: bool = True
    is_default: bool = False
    active: bool = True


def _tpl_out(t: HrContractTemplate, db: Session, locale: str) -> dict:
    used = db.scalar(select(func.count(HrContract.id)).where(HrContract.template_id == t.id)) or 0
    return {
        "id": t.id, "company_id": t.company_id, "company": _cname(db.get(HrCompany, t.company_id), locale) if t.company_id else None,
        "name": t.name, "contract_type": t.contract_type, "body_ar": t.body_ar, "body_en": t.body_en,
        "probation_days": t.probation_days, "duration_months": t.duration_months, "working_hours_week": t.working_hours_week,
        "annual_leave_days": t.annual_leave_days, "notice_days": t.notice_days, "requires_signed_copy": t.requires_signed_copy,
        "is_default": t.is_default, "active": t.active, "updated_by": t.updated_by, "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "used": used, "unknown": unknown_tokens(t.body_ar) + [x for x in unknown_tokens(t.body_en or "") if x not in unknown_tokens(t.body_ar)],
    }


def _tpl_get(db: Session, tid: int) -> HrContractTemplate:
    t = db.get(HrContractTemplate, tid)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    return t


def _tpl_check(db: Session, p: TemplateIn) -> None:
    if p.company_id is not None and db.get(HrCompany, p.company_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    bad = unknown_tokens(p.body_ar) + unknown_tokens(p.body_en or "")
    if bad:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown placeholder: {', '.join(sorted(set(bad)))}")


def _one_default(db: Session, t: HrContractTemplate) -> None:
    """At most one default per company (or group-wide) and contract type."""
    if not t.is_default:
        return
    for o in db.scalars(select(HrContractTemplate).where(HrContractTemplate.id != t.id, HrContractTemplate.is_default.is_(True))).all():
        if o.company_id == t.company_id and o.contract_type == t.contract_type:
            o.is_default = False


@router.get("/contract-templates")
def list_templates(db: DbSession, user: Perm("hr", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    seed_companies(db)
    seed_templates(db)
    rows = db.scalars(select(HrContractTemplate).order_by(HrContractTemplate.active.desc(), HrContractTemplate.company_id, HrContractTemplate.name)).all()
    return {
        "templates": [_tpl_out(t, db, locale) for t in rows],
        "placeholders": [{"key": k, "label": v[0] if locale == "ar" else v[1], "sample": v[2]} for k, v in PLACEHOLDERS.items()],
    }


@router.post("/contract-templates", status_code=201)
def create_template(payload: TemplateIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    _tpl_check(db, payload)
    t = HrContractTemplate(**payload.model_dump(), updated_by=_uname(user, "ar"))
    db.add(t)
    db.flush()
    _one_default(db, t)
    db.commit()
    return _tpl_out(t, db, locale)


@router.put("/contract-templates/{tid}")
def edit_template(tid: int, payload: TemplateIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    _tpl_check(db, payload)
    t = _tpl_get(db, tid)
    for k, v in payload.model_dump().items():
        setattr(t, k, v)
    t.updated_by, t.updated_at = _uname(user, "ar"), datetime.utcnow()
    _one_default(db, t)
    # Drafts and contracts still waiting for the employee follow the new wording; accepted ones never change.
    for c in db.scalars(select(HrContract).where(HrContract.template_id == t.id, HrContract.status.in_(("draft", "pending_acceptance")))).all():
        refresh_body(db, c)
    db.commit()
    return _tpl_out(t, db, locale)


@router.post("/contract-templates/{tid}/duplicate", status_code=201)
def duplicate_template(tid: int, db: DbSession, user: Perm("hr", "approve"), company_id: Optional[int] = Query(None), locale: str = Query("ar", pattern="^(ar|en)$")):
    src = _tpl_get(db, tid)
    if company_id is not None and db.get(HrCompany, company_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    t = HrContractTemplate(
        company_id=company_id if company_id is not None else src.company_id, name=f"{src.name} (2)"[:120], contract_type=src.contract_type,
        body_ar=src.body_ar, body_en=src.body_en, probation_days=src.probation_days, duration_months=src.duration_months,
        working_hours_week=src.working_hours_week, annual_leave_days=src.annual_leave_days, notice_days=src.notice_days,
        requires_signed_copy=src.requires_signed_copy, is_default=False, active=True, updated_by=_uname(user, "ar"),
    )
    db.add(t)
    db.commit()
    return _tpl_out(t, db, locale)


@router.delete("/contract-templates/{tid}")
def delete_template(tid: int, db: DbSession, user: Perm("hr", "approve")):
    t = _tpl_get(db, tid)
    if db.scalar(select(func.count(HrContract.id)).where(HrContract.template_id == tid)):
        t.active, t.is_default = False, False  # keep history: contracts point at it
        db.commit()
        return {"ok": True, "archived": True}
    db.delete(t)
    db.commit()
    return {"ok": True, "archived": False}


class PreviewIn(BaseModel):
    body_ar: str = Field(max_length=60000)
    body_en: Optional[str] = Field(default=None, max_length=60000)
    user_id: Optional[int] = None
    company_id: Optional[int] = None
    contract: Optional[dict] = None  # figures from the contract form (not saved yet)


_FIG = {"contract_type": str, "job_title": str, "start_date": date.fromisoformat, "end_date": date.fromisoformat, "probation_end": date.fromisoformat,
        "basic_salary": float, "housing_allowance": float, "transport_allowance": float, "other_allowance": float, "other_allowance_label": str,
        "working_hours_week": int, "annual_leave_days": int, "notice_days": int, "number": str}


@router.post("/contract-templates/preview")
def preview_template(payload: PreviewIn, db: DbSession, user: Perm("hr", "view")):
    """Render with a real employee (their active contract figures) or with sample values."""
    if payload.user_id and payload.contract is not None:
        vals = {}
        for k, fn in _FIG.items():
            v = payload.contract.get(k)
            if v not in (None, ""):
                try:
                    vals[k] = fn(v)
                except (TypeError, ValueError):
                    pass
        vals.setdefault("start_date", date.today())
        vals.setdefault("contract_type", "fixed")
        vals.setdefault("number", "—")
        c = HrContract(user_id=payload.user_id, company_id=payload.company_id or _profile(db, payload.user_id).company_id, **vals)
        ctx = context(db, c)
    elif payload.user_id:
        c = active_contract(db, payload.user_id) or HrContract(
            number="—", user_id=payload.user_id, company_id=payload.company_id or _profile(db, payload.user_id).company_id,
            contract_type="fixed", start_date=date.today(), basic_salary=0)
        if payload.company_id:
            c = HrContract(**{k: getattr(c, k) for k in ("number", "user_id", "contract_type", "job_title", "start_date", "end_date", "probation_end",
                                                        "basic_salary", "housing_allowance", "transport_allowance", "other_allowance",
                                                        "other_allowance_label", "working_hours_week", "annual_leave_days", "notice_days")},
                           company_id=payload.company_id)
        ctx = context(db, c)
    else:
        ctx = {k: v[2] for k, v in PLACEHOLDERS.items()}
    out = render(payload.body_ar, ctx)
    if payload.body_en and payload.body_en.strip():
        out += "\n\n────────────────────────────\n\n" + render(payload.body_en, ctx)
    return {"text": out, "unknown": sorted(set(unknown_tokens(payload.body_ar) + unknown_tokens(payload.body_en or "")))}


@router.get("/contract-templates/match")
def match_template(db: DbSession, user: Perm("hr", "view"), company_id: Optional[int] = None, contract_type: str = "fixed"):
    from api.services.hr_contract_docs import template_for

    seed_templates(db)
    t = template_for(db, company_id, contract_type)
    return {"id": t.id if t else None}


# ───────────────────────── bulk issue ─────────────────────────


class BulkIn(BaseModel):
    template_id: int
    user_ids: list[int] = Field(min_length=1, max_length=300)
    start_date: date
    end_date: Optional[date] = None
    send: bool = False


@router.post("/contracts/bulk")
def bulk_issue(payload: BulkIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    """Issue the same template to many employees. Salary and job title carry over from each employee's
    active contract; employees without one get a draft for HR to complete (never sent with a zero salary)."""
    t = _tpl_get(db, payload.template_id)
    if not t.active:
        raise HTTPException(status.HTTP_409_CONFLICT, "This template is archived.")
    end = payload.end_date
    if end is None and t.contract_type == "fixed" and t.duration_months:
        y, m = divmod(payload.start_date.month - 1 + t.duration_months, 12)
        try:
            end = date(payload.start_date.year + y, m + 1, payload.start_date.day) - timedelta(days=1)
        except ValueError:
            end = date(payload.start_date.year + y, m + 1, 28)
    if end and end <= payload.start_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The end date must be after the start date.")
    staff = {u.id: u for u in _staff(db, working_only=False)}
    created, sent, incomplete, skipped = [], [], [], []
    for uid in dict.fromkeys(payload.user_ids):
        u = staff.get(uid)
        if u is None:
            skipped.append({"user_id": uid, "reason": "not_staff"})
            continue
        if db.scalar(select(HrContract.id).where(HrContract.user_id == uid, HrContract.status.in_(("draft", "pending_acceptance"))).limit(1)):
            skipped.append({"user_id": uid, "name": _uname(u, locale), "reason": "open_contract"})
            continue
        prof = _profile(db, uid)
        prev = active_contract(db, uid)
        comp_id = t.company_id or prof.company_id
        comp = db.get(HrCompany, comp_id) if comp_id else None
        c = HrContract(
            number=f"tmp-{uuid.uuid4().hex[:10]}", user_id=uid, company_id=comp_id, contract_type=t.contract_type,
            job_title=(prev.job_title if prev else None) or prof.job_title, start_date=payload.start_date,
            end_date=end if t.contract_type in ("fixed", "temporary", "part_time") else None,
            probation_end=(payload.start_date + timedelta(days=t.probation_days)) if t.probation_days and not prev else None,
            basic_salary=prev.basic_salary if prev else 0, housing_allowance=prev.housing_allowance if prev else 0,
            transport_allowance=prev.transport_allowance if prev else 0, other_allowance=prev.other_allowance if prev else 0,
            other_allowance_label=prev.other_allowance_label if prev else None, working_hours_week=t.working_hours_week,
            annual_leave_days=max(t.annual_leave_days, prev.annual_leave_days or 0) if prev else t.annual_leave_days,
            notice_days=t.notice_days, template_id=t.id, created_by_id=user.id,
        )
        db.add(c)
        db.flush()
        c.number = f"{(comp.short_code if comp and comp.short_code else 'HR')}-EC-{c.id:04d}"
        refresh_body(db, c)
        item = {"user_id": uid, "name": _uname(u, locale), "contract_id": c.id, "number": c.number}
        created.append(item)
        if not c.basic_salary:
            incomplete.append(item)
        elif payload.send:
            c.status, c.sent_at = "pending_acceptance", datetime.utcnow()
            sent.append((c, u))
    db.commit()
    for c, u in sent:
        _notify_sent(c, u)
    return {"created": created, "sent": [{"contract_id": c.id, "number": c.number} for c, _ in sent], "incomplete": incomplete, "skipped": skipped}


def _notify_sent(c: HrContract, u: User) -> None:
    _send(u.email, [], f"عقد عمل بانتظار موافقتك {c.number} | Employment contract to review {c.number}",
          f"<p>أُرسل إليك عقد العمل {c.number}. راجع البنود والراتب ثم وافق أو اطلب تعديلًا، وبعد الموافقة اطبع العقد ووقّعه وارفع النسخة الموقعة.</p>",
          f"<p>Your employment contract {c.number} is ready. Review the terms and salary, then accept or ask for changes. After accepting, print it, sign it and upload the signed copy.</p>",
          f"{_base()}/ar/my-hr/file?tab=contracts", "مراجعة العقد", "Review contract")


# ───────────────────────── contract document ─────────────────────────


def _visible(db: Session, user: User, c: HrContract) -> bool:
    return c.user_id == user.id or has_permission(db, user, "hr", "view")


@router.get("/contracts/{cid}/document")
def contract_document(cid: int, db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    """Printable contract: the stored (or freshly rendered) text plus the facts around it."""
    c = db.get(HrContract, cid)
    if c is None or not _visible(db, user, c):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    show = c.user_id == user.id or has_permission(db, user, "hr", "approve")
    if c.status == "draft" and c.user_id == user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")  # employees never see drafts
    body = c.body or render_contract(db, c)
    emp = db.get(User, c.user_id)
    comp = db.get(HrCompany, c.company_id) if c.company_id else None
    d = _contract_out(c, db, locale, show)
    d.update({
        "body": body if show else None,  # salary lives in the text; hidden from view-only HR
        "employee": _uname(emp, locale), "company_name_ar": comp.name_ar if comp else None, "company_name_en": (comp.name_en if comp else None),
        "company_cr": comp.cr_number if comp else None, "company_color": comp.color if comp else None,
        "is_self": c.user_id == user.id, "can_review": has_permission(db, user, "hr", "approve") and c.user_id != user.id,
        "can_upload_hr": has_permission(db, user, "hr", "edit"),
    })
    return d


# ───────────────────────── signed copy ─────────────────────────


async def _store_signed(c: HrContract, file: UploadFile) -> tuple[str, str]:
    ctype = (file.content_type or "").lower()
    if ctype not in SIGNED_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Upload a PDF or a photo (JPG, PNG, WebP) of the signed contract.")
    data = await file.read(MAX_SIGNED_BYTES + 1)
    if len(data) > MAX_SIGNED_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "The file is larger than 15 MB.")
    if len(data) < 200:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The file looks empty.")
    import io

    try:
        stored = storage.upload_document(io.BytesIO(data), content_type="image/jpeg" if ctype == "image/jpg" else ctype,
                                         prefix=f"private/hr-contracts/{c.user_id}", original_filename=None)
    except storage.StorageNotConfigured as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))
    name = (file.filename or f"{c.number}-signed").replace("/", "_").replace("\\", "_")[:200]
    return stored.object_key, name


def _replace_signed(c: HrContract, key: str, name: str, by: str, st: str) -> None:
    old = c.signed_key
    c.signed_key, c.signed_filename, c.signed_status = key, name, st
    c.signed_uploaded_at, c.signed_uploaded_by = datetime.utcnow(), by
    c.signed_reviewed_at = datetime.utcnow() if st == "verified" else None
    c.signed_reviewed_by = by if st == "verified" else None
    c.signed_note = None
    if old and old != key:
        storage.delete_object(old)


@router.post("/me/contracts/{cid}/signed")
async def upload_my_signed(cid: int, db: DbSession, user: CurrentUser, file: UploadFile = File(...), locale: str = Query("ar", pattern="^(ar|en)$")):
    c = db.get(HrContract, cid)
    if c is None or c.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    if c.status != "accepted":
        raise HTTPException(status.HTTP_409_CONFLICT, "Accept the contract first, then upload the signed copy.")
    if c.signed_status == "verified":
        raise HTTPException(status.HTTP_409_CONFLICT, "HR already verified the signed copy of this contract.")
    key, name = await _store_signed(c, file)
    _replace_signed(c, key, name, _uname(user, "ar"), "uploaded")
    db.commit()
    for a in _approvers(db, exclude_user_id=user.id):
        _send(a.email, [], f"نسخة موقعة من العقد {c.number} بانتظار التحقق | Signed contract {c.number} to verify",
              f"<p>رفع {escape(_uname(user, 'ar'))} النسخة الموقعة من عقد العمل {c.number}. تحقق منها واعتمدها أو أعدها للتصحيح.</p>",
              f"<p>{escape(_uname(user, 'en'))} uploaded the signed copy of employment contract {c.number}. Check it, then verify it or send it back.</p>",
              f"{_base()}/ar/hr?tab=contracts", "مراجعة النسخة", "Review signed copy")
    return _contract_out(c, db, locale, True)


@router.post("/contracts/{cid}/signed")
async def upload_signed_for(cid: int, db: DbSession, user: Perm("hr", "edit"), file: UploadFile = File(...), locale: str = Query("ar", pattern="^(ar|en)$")):
    """HR files the signed paper copy on the employee's behalf (counts as verified when the uploader can approve)."""
    c = db.get(HrContract, cid)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    if c.status not in ("accepted", "terminated"):
        raise HTTPException(status.HTTP_409_CONFLICT, "The employee must accept the contract before a signed copy is filed.")
    key, name = await _store_signed(c, file)
    can_verify = has_permission(db, user, "hr", "approve") and c.user_id != user.id
    _replace_signed(c, key, name, _uname(user, "ar"), "verified" if can_verify else "uploaded")
    db.commit()
    return _contract_out(c, db, locale, has_permission(db, user, "hr", "approve"))


class ReviewIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=300)


@router.post("/contracts/{cid}/signed/review")
def review_signed(cid: int, payload: ReviewIn, db: DbSession, user: Perm("hr", "approve"), locale: str = Query("ar", pattern="^(ar|en)$")):
    c = db.get(HrContract, cid)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    if c.user_id == user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't verify your own contract.")
    if c.signed_status != "uploaded":
        raise HTTPException(status.HTTP_409_CONFLICT, "There's no signed copy waiting for review.")
    if not payload.approve and not (payload.note or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tell the employee what to fix.")
    c.signed_status = "verified" if payload.approve else "rejected"
    c.signed_reviewed_at, c.signed_reviewed_by = datetime.utcnow(), _uname(user, "ar")
    c.signed_note = (payload.note or "").strip() or None
    db.commit()
    emp = db.get(User, c.user_id)
    if emp:
        if payload.approve:
            _send(emp.email, [], f"تم اعتماد النسخة الموقعة من عقدك {c.number} | Signed contract {c.number} verified",
                  f"<p>اعتمدت الموارد البشرية النسخة الموقعة من عقد العمل {c.number}. تجدها في ملفك الوظيفي.</p>",
                  f"<p>HR verified the signed copy of your employment contract {c.number}. It's kept in your employee file.</p>",
                  f"{_base()}/ar/my-hr/file?tab=contracts", "ملفي الوظيفي", "My employee file")
        else:
            _send(emp.email, [], f"أعد رفع النسخة الموقعة من عقدك {c.number} | Please re-upload signed contract {c.number}",
                  f"<p>أعادت الموارد البشرية النسخة الموقعة من العقد {c.number} للتصحيح: {escape(c.signed_note or '')}</p>",
                  f"<p>HR sent back the signed copy of contract {c.number}: {escape(c.signed_note or '')}</p>",
                  f"{_base()}/ar/my-hr/file?tab=contracts", "رفع النسخة", "Upload signed copy")
    return _contract_out(c, db, locale, True)


@router.get("/contracts/{cid}/signed")
def download_signed(cid: int, db: DbSession, user: CurrentUser):
    c = db.get(HrContract, cid)
    if c is None or not c.signed_key or not _visible(db, user, c):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No signed copy")
    local = storage.local_upload_root() / c.signed_key
    if local.is_file():
        return FileResponse(local, filename=c.signed_filename or f"{c.number}-signed")
    try:
        url = storage._client().generate_presigned_url(
            "get_object",
            Params={"Bucket": get_settings().s3_bucket, "Key": c.signed_key,
                    "ResponseContentDisposition": f'inline; filename="{(c.signed_filename or c.number).replace(chr(34), "")}"'},
            ExpiresIn=300,
        )
    except Exception:  # noqa: BLE001
        logger.exception("Could not presign signed contract %s", c.id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "File storage unavailable")
    return {"url": url}


@router.get("/contracts-desk")
def contracts_desk(db: DbSession, user: Perm("hr", "view"), locale: str = Query("ar", pattern="^(ar|en)$")):
    """Every contract in the group with its signature state, for the HR contracts tab."""
    seed_companies(db)
    seed_templates(db)
    show = has_permission(db, user, "hr", "approve")
    out = []
    for c in db.scalars(select(HrContract).order_by(HrContract.created_at.desc())).all():
        d = _contract_out(c, db, locale, show)
        d["employee"] = _uname(db.get(User, c.user_id), locale)
        out.append(d)
    staff_ids = {u.id for u in _staff(db, working_only=True)}
    with_active = {c["user_id"] for c in out if c["state"] in ("active", "upcoming")}
    return {
        "contracts": out,
        "counts": {
            "waiting_employee": sum(1 for c in out if c["status"] == "pending_acceptance"),
            "signed_to_verify": sum(1 for c in out if c.get("signed_status") == "uploaded"),
            "missing_signed": sum(1 for c in out if c.get("needs_signed")),
            "drafts": sum(1 for c in out if c["status"] == "draft"),
            "no_contract": len(staff_ids - with_active),
        },
        "no_contract": [{"user_id": u.id, "name": _uname(u, locale)} for u in _staff(db, working_only=True) if u.id not in with_active],
    }
