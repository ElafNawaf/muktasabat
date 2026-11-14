"""Public-website CMS.

Two surfaces:

* `/api/v1/cms/public/...` — unauthenticated, read-only (published rows only)
  plus the rate-limited lead and job-application forms. This is what the
  marketing pages at muktasabat.com/{locale} render from.
* `/api/v1/cms/admin/...`  — portal staff with the `website` permission module
  (admins, or the seeded `content_editor` role).
"""
from __future__ import annotations

import csv
import io
import logging
import re
from datetime import date
from html import escape
from typing import Any, Literal, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from api.cms_models import (
    CmsJob,
    CmsJobApplication,
    CmsLead,
    CmsListing,
    CmsPartner,
    CmsPost,
    CmsProject,
    CmsService,
    CmsTestimonial,
    SiteSettings,
)
from api.config import get_settings
from api.deps import DbSession
from api.email import EmailMessage, send_email
from api.permissions import Perm
from api.schemas.cms import (
    ApplicationOut,
    ApplicationUpdate,
    InboxCounts,
    JobIn,
    JobOut,
    LeadIn,
    LeadOut,
    LeadUpdate,
    ListingIn,
    ListingOut,
    MediaOut,
    PartnerIn,
    PartnerOut,
    PostIn,
    PostOut,
    ProjectIn,
    ProjectOut,
    ServiceIn,
    ServiceOut,
    SiteData,
    SitePrivate,
    SiteSettingsAdmin,
    TestimonialIn,
    TestimonialOut,
)
from api.services.cms_guard import client_ip, ip_hash, rate_limit, verify_turnstile
from api.storage import StorageNotConfigured, delete_object, upload_document, upload_image

logger = logging.getLogger(__name__)

public = APIRouter(prefix="/cms/public", tags=["cms-public"])
admin = APIRouter(prefix="/cms/admin", tags=["cms-admin"])

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_CV_BYTES = 5 * 1024 * 1024
_CV_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

# kind → (model, input schema, output schema, has slug)
_KINDS: dict[str, tuple[Any, type[BaseModel], type[BaseModel], bool]] = {
    "services": (CmsService, ServiceIn, ServiceOut, True),
    "projects": (CmsProject, ProjectIn, ProjectOut, True),
    "listings": (CmsListing, ListingIn, ListingOut, True),
    "posts": (CmsPost, PostIn, PostOut, True),
    "jobs": (CmsJob, JobIn, JobOut, True),
    "testimonials": (CmsTestimonial, TestimonialIn, TestimonialOut, False),
    "partners": (CmsPartner, PartnerIn, PartnerOut, False),
}
Kind = Literal["services", "projects", "listings", "posts", "jobs", "testimonials", "partners"]


def _spec(kind: str):
    spec = _KINDS.get(kind)
    if spec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown content type")
    return spec


def _order(model):
    if model is CmsListing:
        # Available first, then featured, then manual order, newest first.
        return (
            (CmsListing.status != "available"),
            CmsListing.featured.desc(),
            CmsListing.sort_order.asc(),
            CmsListing.id.desc(),
        )
    if model is CmsPost:
        return (CmsPost.published_on.desc().nulls_last(), CmsPost.id.desc())
    return (model.sort_order.asc(), model.id.asc())


def _settings_row(db) -> SiteSettings:
    row = db.get(SiteSettings, 1)
    if row is None:
        row = SiteSettings(id=1, data={}, private={})
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _public_site(db) -> dict:
    # Re-validate on the way out so stale/legacy JSON can never leak fields
    # that aren't part of the public schema.
    try:
        return SiteData.model_validate(_settings_row(db).data or {}).model_dump()
    except ValidationError:
        logger.exception("cms_site_settings.data failed validation; serving defaults")
        return SiteData().model_dump()


def _dump(out_schema: type[BaseModel], rows) -> list[dict]:
    return [out_schema.model_validate(r).model_dump(mode="json") for r in rows]


# ═════════════════════════════ PUBLIC ═════════════════════════════


@public.get("/site")
def public_site(db: DbSession):
    return _public_site(db)


@public.get("/home")
def public_home(db: DbSession):
    """Everything the homepage needs in one round-trip."""

    def published(model, limit: int | None = None, *extra):
        q = select(model).where(model.published.is_(True), *extra).order_by(*_order(model))
        if limit:
            q = q.limit(limit)
        return db.scalars(q).all()

    projects = published(CmsProject, 6, CmsProject.featured.is_(True))
    if not projects:
        projects = published(CmsProject, 6)
    open_jobs = db.scalar(
        select(func.count())
        .select_from(CmsJob)
        .where(
            CmsJob.published.is_(True),
            (CmsJob.closes_on.is_(None)) | (CmsJob.closes_on >= date.today()),
        )
    )
    listings = published(CmsListing, 6, CmsListing.status == "available")
    return {
        "site": _public_site(db),
        "listings": _dump(ListingOut, listings),
        "services": _dump(ServiceOut, published(CmsService)),
        "projects": _dump(ProjectOut, projects),
        "testimonials": _dump(TestimonialOut, published(CmsTestimonial, 12)),
        "partners": _dump(PartnerOut, published(CmsPartner, 24)),
        "posts": _dump(PostOut, published(CmsPost, 3)),
        "open_jobs": open_jobs or 0,
    }


@public.get("/{kind}")
def public_list(
    kind: Kind,
    db: DbSession,
    category: Optional[str] = Query(default=None, max_length=30),
    limit: int = Query(default=100, ge=1, le=200),
):
    model, _in, out, _slug = _spec(kind)
    q = select(model).where(model.published.is_(True))
    if kind == "listings":
        # Closed deals stay visible for 30 days as social proof, then drop off.
        from datetime import datetime, timedelta

        recent = datetime.utcnow() - timedelta(days=30)
        q = q.where((CmsListing.status.in_(("available", "reserved"))) | (CmsListing.updated_at >= recent))
    if kind == "projects" and category:
        q = q.where(CmsProject.category == category)
    if kind == "jobs":
        q = q.where((CmsJob.closes_on.is_(None)) | (CmsJob.closes_on >= date.today()))
    return _dump(out, db.scalars(q.order_by(*_order(model)).limit(limit)).all())


@public.get("/{kind}/{slug}")
def public_detail(kind: Kind, slug: str, db: DbSession):
    model, _in, out, has_slug = _spec(kind)
    if not has_slug:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    row = db.scalar(select(model).where(model.slug == slug, model.published.is_(True)))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return out.model_validate(row).model_dump(mode="json")


_LABELS_AR = {
    "Type": "النوع", "Name": "الاسم", "Phone": "الجوال", "Email": "البريد", "City": "المدينة",
    "Message": "الرسالة", "Page": "الصفحة", "Open in portal": "فتح في النظام", "Position": "الوظيفة",
    "CV attached": "السيرة الذاتية مرفقة",
}


def _notify(recipients: list[str], subject: str, lines: list[tuple[str, str | None]], subject_ar: str = "") -> None:
    """Staff notification, bilingual (Arabic labels with English beside them)."""
    if not recipients:
        return
    text = "\n".join(f"{_LABELS_AR.get(k, k)} / {k}: {v or '-'}" for k, v in lines)
    title = f"{subject_ar} | {subject}" if subject_ar else subject
    from api.email import _branded

    def table(label, align: str) -> str:
        cell = "padding:7px 0 7px 12px" if align == "right" else "padding:7px 12px 7px 0"
        rows = "".join(
            f"<tr style='border-bottom:1px solid #F0EBE2'><td style='{cell};color:#5D636B;white-space:nowrap;vertical-align:top;text-align:{align}'>"
            f"{escape(label(k))}</td><td dir='auto' style='padding:7px 0;vertical-align:top;text-align:{align};word-break:break-word'>"
            f"{escape(v or '-').replace(chr(10), '<br>')}</td></tr>"
            for k, v in lines
        )
        return ("<table role='presentation' cellpadding='0' cellspacing='0' "
                f"style='width:100%;border-collapse:collapse;font-size:14px'>{rows}</table>")

    def en_label(k: str) -> str:
        return k

    ar_title, _, en_title = title.partition(" | ")
    html = _branded(
        f"<h2 style='margin:0 0 14px;font-size:18px;color:#7B1A1A'>{escape(ar_title)}</h2>{table(lambda k: _LABELS_AR.get(k, k), 'right')}",
        f"<h2 style='margin:0 0 14px;font-size:17px;color:#7B1A1A'>{escape(en_title or ar_title)}</h2>{table(en_label, 'left')}",
    )
    for to in recipients:
        send_email(EmailMessage(to=to, subject=title, text_body=text, html_body=html, category="website"))


@public.post("/leads", status_code=status.HTTP_201_CREATED)
def submit_lead(payload: LeadIn, request: Request, db: DbSession):
    rate_limit(request, "lead", limit=5, window_s=600)
    ip = client_ip(request)
    if payload.website:  # honeypot tripped — pretend success, store nothing
        logger.info("cms lead honeypot tripped ip_hash=%s", ip_hash(ip))
        return {"ok": True}
    if not payload.phone and not payload.email:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Phone or email is required")
    verify_turnstile(payload.turnstile_token, ip)

    lead = CmsLead(
        **payload.model_dump(exclude={"website", "turnstile_token"}),
        ip_hash=ip_hash(ip),
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    private = SitePrivate.model_validate(_settings_row(db).private or {})
    base = get_settings().web_base_url.rstrip("/")
    _notify(
        private.lead_notify_emails,
        f"استفسار جديد من الموقع رقم {lead.id} | New website enquiry #{lead.id} ({lead.kind})",
        [
            ("Type", lead.kind),
            ("Name", lead.name),
            ("Phone", lead.phone),
            ("Email", lead.email),
            ("City", lead.city),
            ("Message", lead.message),
            ("Page", lead.source_page),
            ("Open in portal", f"{base}/ar/website/leads"),
        ],
    )
    return {"ok": True}


@public.post("/jobs/{slug}/apply", status_code=status.HTTP_201_CREATED)
async def apply_job(
    slug: str,
    request: Request,
    db: DbSession,
    name: str = Form(..., min_length=2, max_length=120),
    email: str = Form(..., max_length=160),
    phone: Optional[str] = Form(default=None, max_length=30),
    linkedin: Optional[str] = Form(default=None, max_length=300),
    cover_letter: Optional[str] = Form(default=None, max_length=6000),
    website: Optional[str] = Form(default=None, max_length=200),
    turnstile_token: Optional[str] = Form(default=None, max_length=4096),
    cv: Optional[UploadFile] = File(default=None),
):
    rate_limit(request, "apply", limit=3, window_s=1800)
    ip = client_ip(request)
    if website:
        return {"ok": True}

    # Re-use LeadIn's email/phone validators rather than duplicating regexes.
    try:
        LeadIn(name=name, email=email, phone=phone)
    except ValidationError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, e.errors()[0]["msg"])
    if linkedin and not linkedin.lower().startswith("https://"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "LinkedIn must be an https:// URL")
    verify_turnstile(turnstile_token, ip)

    job = db.scalar(select(CmsJob).where(CmsJob.slug == slug, CmsJob.published.is_(True)))
    if job is None or (job.closes_on and job.closes_on < date.today()):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This position is no longer open")

    cv_key = cv_name = None
    if cv is not None and cv.filename:
        if cv.content_type not in _CV_TYPES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "CV must be a PDF or Word document")
        data = await cv.read(MAX_CV_BYTES + 1)
        if len(data) > MAX_CV_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "CV must be 5 MB or smaller")
        try:
            stored = upload_document(
                io.BytesIO(data),
                content_type=cv.content_type,
                prefix="private/careers",
                original_filename=cv.filename,
            )
        except StorageNotConfigured as e:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
        cv_key, cv_name = stored.object_key, (cv.filename or "cv")[:255]

    app_row = CmsJobApplication(
        job_id=job.id,
        name=name,
        email=email,
        phone=phone,
        linkedin=linkedin,
        cover_letter=cover_letter,
        cv_object_key=cv_key,
        cv_filename=cv_name,
        ip_hash=ip_hash(ip),
    )
    db.add(app_row)
    db.commit()

    private = SitePrivate.model_validate(_settings_row(db).private or {})
    base = get_settings().web_base_url.rstrip("/")
    _notify(
        private.careers_notify_emails,
        f"طلب توظيف جديد: {job.title_ar} | New application: {job.title_en}",
        [
            ("Position", job.title_en),
            ("Name", name),
            ("Email", email),
            ("Phone", phone),
            ("CV attached", "yes" if cv_key else "no"),
            ("Open in portal", f"{base}/ar/website/applications"),
        ],
    )
    return {"ok": True}


# ═════════════════════════════ ADMIN ═════════════════════════════


@admin.get("/settings", response_model=SiteSettingsAdmin)
def get_settings_admin(db: DbSession, _u: Perm("website", "view")):
    row = _settings_row(db)
    return SiteSettingsAdmin(
        data=SiteData.model_validate(row.data or {}),
        private=SitePrivate.model_validate(row.private or {}),
    )


@admin.put("/settings", response_model=SiteSettingsAdmin)
def put_settings_admin(payload: SiteSettingsAdmin, db: DbSession, _u: Perm("website", "edit")):
    row = _settings_row(db)
    row.data = payload.data.model_dump(mode="json")
    # Keep internal bookkeeping keys (e.g. "_migrations") that aren't part of
    # the editable schema, so one-off content migrations never re-run.
    internal = {k: v for k, v in (row.private or {}).items() if k.startswith("_")}
    row.private = {**payload.private.model_dump(mode="json"), **internal}
    db.commit()
    return payload


class _TextsIn(BaseModel):
    texts: dict[str, dict[str, Optional[str]]] = {}


@admin.put("/texts")
def put_texts(payload: _TextsIn, db: DbSession, _u: Perm("website", "edit")):
    """Save only the public-site text overrides (leaves every other setting untouched)."""
    row = _settings_row(db)
    data = dict(row.data or {})
    data["texts"] = payload.texts
    try:
        clean = SiteData.model_validate(data).model_dump(mode="json")
    except ValidationError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, e.errors(include_url=False, include_context=False))
    data["texts"] = clean["texts"]
    row.data = data
    db.commit()
    return {"texts": clean["texts"]}


@admin.get("/inbox", response_model=InboxCounts)
def inbox_counts(db: DbSession, _u: Perm("website", "view")):
    return InboxCounts(
        new_leads=db.scalar(select(func.count()).select_from(CmsLead).where(CmsLead.status == "new")) or 0,
        new_applications=db.scalar(
            select(func.count()).select_from(CmsJobApplication).where(CmsJobApplication.status == "new")
        )
        or 0,
    )


@admin.post("/media", response_model=MediaOut, status_code=status.HTTP_201_CREATED)
async def upload_media(_u: Perm("website", "edit"), file: UploadFile = File(...)):
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Image must be 8 MB or smaller")
    # SVG is deliberately not accepted: it can carry script.
    try:
        stored = upload_image(
            io.BytesIO(data),
            content_type=file.content_type or "application/octet-stream",
            prefix="site",
            original_filename=file.filename,
        )
    except StorageNotConfigured as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return MediaOut(url=stored.public_url, object_key=stored.object_key)


# ── Leads ──


@admin.get("/leads", response_model=list[LeadOut])
def list_leads(
    db: DbSession,
    _u: Perm("website", "view"),
    status_: Optional[str] = Query(default=None, alias="status", max_length=20),
    limit: int = Query(default=500, ge=1, le=2000),
):
    q = select(CmsLead)
    if status_:
        q = q.where(CmsLead.status == status_)
    return db.scalars(q.order_by(CmsLead.id.desc()).limit(limit)).all()


@admin.get("/leads.csv")
def export_leads(db: DbSession, _u: Perm("website", "view")):
    buf = io.StringIO()
    buf.write("﻿")  # BOM so Excel opens Arabic correctly
    w = csv.writer(buf)
    w.writerow(["id", "created_at", "kind", "status", "name", "phone", "email", "city", "message", "page", "notes"])

    def safe(v):  # neutralise spreadsheet formula injection
        s = "" if v is None else str(v)
        return "'" + s if s[:1] in ("=", "+", "-", "@") else s

    for r in db.scalars(select(CmsLead).order_by(CmsLead.id.desc())).all():
        w.writerow([safe(x) for x in (r.id, r.created_at.isoformat(), r.kind, r.status, r.name, r.phone, r.email, r.city, r.message, r.source_page, r.notes)])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=muktasabat-leads.csv"},
    )


@admin.put("/leads/{lead_id}", response_model=LeadOut)
def update_lead(lead_id: int, payload: LeadUpdate, db: DbSession, _u: Perm("website", "edit")):
    lead = db.get(CmsLead, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    lead.status = payload.status
    lead.notes = payload.notes
    db.commit()
    db.refresh(lead)
    return lead


@admin.delete("/leads/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(lead_id: int, db: DbSession, _u: Perm("website", "delete")):
    lead = db.get(CmsLead, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    db.delete(lead)
    db.commit()


# ── Job applications ──


def _app_out(a: CmsJobApplication) -> ApplicationOut:
    return ApplicationOut(
        id=a.id,
        job_id=a.job_id,
        job_title_en=a.job.title_en if a.job else None,
        job_title_ar=a.job.title_ar if a.job else None,
        name=a.name,
        email=a.email,
        phone=a.phone,
        linkedin=a.linkedin,
        cover_letter=a.cover_letter,
        cv_filename=a.cv_filename,
        has_cv=bool(a.cv_object_key),
        status=a.status,
        notes=a.notes,
        created_at=a.created_at,
    )


@admin.get("/applications", response_model=list[ApplicationOut])
def list_applications(db: DbSession, _u: Perm("website", "view")):
    rows = db.scalars(select(CmsJobApplication).order_by(CmsJobApplication.id.desc()).limit(1000)).all()
    return [_app_out(a) for a in rows]


@admin.put("/applications/{app_id}", response_model=ApplicationOut)
def update_application(app_id: int, payload: ApplicationUpdate, db: DbSession, _u: Perm("website", "edit")):
    a = db.get(CmsJobApplication, app_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    a.status = payload.status
    a.notes = payload.notes
    db.commit()
    db.refresh(a)
    return _app_out(a)


@admin.delete("/applications/{app_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(app_id: int, db: DbSession, _u: Perm("website", "delete")):
    a = db.get(CmsJobApplication, app_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    key = a.cv_object_key
    db.delete(a)
    db.commit()
    delete_object(key)


@admin.get("/applications/{app_id}/cv")
def download_cv(app_id: int, db: DbSession, _u: Perm("website", "view")):
    """CVs are personal data: never linked publicly. Local storage → stream
    the file; S3 → 5-minute presigned URL."""
    from api import storage

    a = db.get(CmsJobApplication, app_id)
    if a is None or not a.cv_object_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No CV")
    local_path = storage.local_upload_root() / a.cv_object_key
    if local_path.is_file():
        return FileResponse(local_path, filename=a.cv_filename or "cv")
    try:
        url = storage._client().generate_presigned_url(
            "get_object",
            Params={
                "Bucket": get_settings().s3_bucket,
                "Key": a.cv_object_key,
                "ResponseContentDisposition": f'attachment; filename="{(a.cv_filename or "cv").replace(chr(34), "")}"',
            },
            ExpiresIn=300,
        )
    except Exception:
        logger.exception("Could not presign CV %s", a.cv_object_key)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "File storage unavailable")
    return {"url": url}


# ── Delivery health (email + file storage), admin only ──


class _TestEmailIn(BaseModel):
    to: str


@admin.get("/health")
def delivery_health(_u: Perm("website", "edit")):
    """Live check of SES and S3 using the API's real credentials."""
    from api import storage

    s = get_settings()
    out: dict[str, Any] = {"email": {}, "storage": {}}
    out["email"] = {
        "configured": bool(s.ses_region and s.ses_from_email),
        "region": s.ses_region or None,
        "from": s.ses_from_email or None,
    }
    st: dict[str, Any] = {"bucket": s.s3_bucket or None, "fallback_local": s.storage_fallback_local}
    if not s.s3_bucket:
        st.update(mode="local", ok=True)
    else:
        try:
            storage._client().head_bucket(Bucket=s.s3_bucket)
            st.update(mode="s3", ok=True)
        except Exception as e:  # noqa: BLE001
            code = str(getattr(e, "response", {}).get("Error", {}).get("Code", type(e).__name__))
            st.update(mode="local" if s.storage_fallback_local else "s3", ok=False, error=code)
    out["storage"] = st
    return out


@admin.post("/health/test-email")
def delivery_test_email(payload: _TestEmailIn, _u: Perm("website", "edit")):
    """Send a real test message through SES and report AWS's answer verbatim."""
    from api.email import _send_via_ses

    to = payload.to.strip()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", to):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid email")
    s = get_settings()
    if not (s.ses_region and s.ses_from_email):
        return {"ok": False, "error": "SES is not configured (SES_REGION / SES_FROM_EMAIL)."}
    try:
        _send_via_ses(
            EmailMessage(
                to=to,
                subject="رسالة تجريبية | Muktasabat test email",
                text_body="تم إرسال هذه الرسالة بنجاح من نظام مكتسبات.\nEmail delivery from muktasabat.com is working.",
                html_body=__import__("api.email", fromlist=["_branded"])._branded(
                    "<p>تم إرسال هذه الرسالة بنجاح من نظام مكتسبات. هكذا ستظهر رسائلنا للعملاء والملاك والموظفين.</p>",
                    "<p>Email delivery from muktasabat.com is working. This is how our emails look to clients, owners and staff.</p>",
                ),
            )
        )
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        msg = str(getattr(e, "response", {}).get("Error", {}).get("Message", "")) or str(e)
        return {"ok": False, "error": msg[:400]}


# ── Generic content CRUD (services, projects, posts, jobs, testimonials, partners) ──


@admin.get("/{kind}")
def admin_list(kind: Kind, db: DbSession, _u: Perm("website", "view")):
    model, _in, out, _slug = _spec(kind)
    return _dump(out, db.scalars(select(model).order_by(*_order(model))).all())


def _save(db, row, kind: str):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That slug is already used — choose another.")
    db.refresh(row)
    return _KINDS[kind][2].model_validate(row).model_dump(mode="json")


@admin.post("/{kind}", status_code=status.HTTP_201_CREATED)
def admin_create(kind: Kind, payload: dict, db: DbSession, _u: Perm("website", "create")):
    model, in_schema, _out, _slug = _spec(kind)
    try:
        data = in_schema.model_validate(payload).model_dump(mode="python")
    except ValidationError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, e.errors(include_url=False, include_context=False))
    row = model(**data)
    db.add(row)
    return _save(db, row, kind)


@admin.put("/{kind}/{item_id}")
def admin_update(kind: Kind, item_id: int, payload: dict, db: DbSession, _u: Perm("website", "edit")):
    model, in_schema, _out, _slug = _spec(kind)
    row = db.get(model, item_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    try:
        data = in_schema.model_validate(payload).model_dump(mode="python")
    except ValidationError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, e.errors(include_url=False, include_context=False))
    for k, v in data.items():
        setattr(row, k, v)
    return _save(db, row, kind)


@admin.delete("/{kind}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete(kind: Kind, item_id: int, db: DbSession, _u: Perm("website", "delete")):
    model, *_ = _spec(kind)
    row = db.get(model, item_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    db.delete(row)
    db.commit()
