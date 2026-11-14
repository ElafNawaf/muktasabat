"""Tenant portal — what a tenant sees about their own leases and instalments.

Security model (mirrors the owner portal)
-----------------------------------------
* Tenant logins are users with role ``tenant`` linked to one ``Tenant`` through
  ``tenant_users``. Every query is scoped to that tenant id; nothing is looked
  up by an id the tenant supplies without checking it belongs to them.
* ``api.deps.get_current_user`` blocks tenant accounts from every other route.
* Staff with ``tenants.view`` may preview with ``?as_tenant=<id>``; staff can
  read but never act (report a payment, change preferences) in a preview.

A tenant can *report* a payment ("I've paid"). That never changes the payment:
staff confirm it (→ the normal mark-paid flow, receipts, owner payout timer)
or reject it with a reason the tenant sees.
"""
from __future__ import annotations

import hashlib
import io
import logging
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from html import escape
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from api.config import get_settings
from api.deps import CurrentUser, DbSession
from api.email import EmailMessage, _branded, _button, send_email
from api.i18n import Locale, get_locale, localized_value
from api.models import AuditLog, Building, Contract, Payment, Tenant, Unit, User
from api.permissions import has_permission
from api.tenant_portal_models import PaymentReport, TenantUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tenant-portal", tags=["tenant-portal"])
LocaleDep = Annotated[Locale, Depends(get_locale)]

ENDED = {"terminated", "cancelled", "canceled", "expired"}
METHODS = ("bank_transfer", "cash", "cheque")
DUE_SOON_DAYS = 14


# ═══════════════════════════ scope ═══════════════════════════


class Scope:
    def __init__(self, tenant: Tenant, link: Optional[TenantUser], preview: bool):
        self.tenant = tenant
        self.link = link
        self.preview = preview


def _scope(
    db: DbSession,
    user: CurrentUser,
    as_tenant: Annotated[Optional[int], Query(ge=1)] = None,
) -> Scope:
    if user.role == "tenant":
        link = db.scalar(select(TenantUser).where(TenantUser.user_id == user.id))
        if link is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is not linked to a tenant yet.")
        tenant = db.get(Tenant, link.tenant_id)
        if tenant is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is not linked to a tenant yet.")
        return Scope(tenant, link, False)
    if as_tenant is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "as_tenant is required for staff preview")
    if not has_permission(db, user, "tenants", "view"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Permission denied: tenants.view")
    tenant = db.get(Tenant, as_tenant)
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    return Scope(tenant, None, True)


ScopeDep = Annotated[Scope, Depends(_scope)]


def _contracts(db: Session, tenant_id: int) -> list[Contract]:
    return list(
        db.scalars(
            select(Contract)
            .where(Contract.tenant_id == tenant_id, func.lower(func.coalesce(Contract.status, "active")) != "draft")
            .options(
                selectinload(Contract.payments),
                selectinload(Contract.attachments),
                selectinload(Contract.unit).selectinload(Unit.building),
            )
            .order_by(Contract.end_date.desc())
        ).all()
    )


def _reports(db: Session, tenant_id: int) -> dict[int, PaymentReport]:
    """Latest report per payment."""
    out: dict[int, PaymentReport] = {}
    for r in db.scalars(
        select(PaymentReport).where(PaymentReport.tenant_id == tenant_id).order_by(PaymentReport.created_at)
    ):
        out[r.payment_id] = r
    return out


def r2(x) -> float:
    return round(float(x or 0), 2)


def _iso(d) -> Optional[str]:
    return d.isoformat() if d else None


def _contract_state(c: Contract, today: date) -> str:
    s = (c.status or "active").lower()
    if s in ENDED or c.end_date < today:
        return "ended"
    if c.start_date > today:
        return "upcoming"
    return "active"


def _pay_state(p: Payment, rep: Optional[PaymentReport], today: date) -> str:
    """paid · reported · overdue · due_soon · upcoming"""
    if (p.status or "") == "paid":
        return "paid"
    if rep is not None and rep.status == "pending":
        return "reported"
    if p.due_date < today:
        return "overdue"
    if p.due_date <= today + timedelta(days=DUE_SOON_DAYS):
        return "due_soon"
    return "upcoming"


def _payment_json(p: Payment, c: Contract, rep: Optional[PaymentReport], today: date, idx: int, n: int, locale: Locale) -> dict:
    state = _pay_state(p, rep, today)
    return {
        "id": p.id,
        "contract_id": c.id,
        "contract_number": c.contract_number,
        "property": localized_value(c.unit.building, "name", locale) if c.unit and c.unit.building else None,
        "unit": c.unit.number if c.unit else None,
        "seq": idx,
        "of": n,
        "amount": r2(p.amount),
        "due_date": p.due_date.isoformat(),
        "days": (p.due_date - today).days,
        "state": state,
        "paid_date": _iso(p.paid_date),
        "method": p.payment_method,
        "receipt_number": p.receipt_number,
        "report": None
        if rep is None
        else {
            "id": rep.id,
            "status": rep.status,
            "paid_on": rep.paid_on.isoformat(),
            "amount": r2(rep.amount),
            "method": rep.method,
            "reference": rep.reference,
            "sent_at": rep.created_at.isoformat(),
            "review_note": rep.review_note,
            "receipt_url": rep.receipt_url,
            "receipt_name": rep.receipt_name,
        },
    }


def _contract_json(c: Contract, reports: dict[int, PaymentReport], today: date, locale: Locale, full: bool = False) -> dict:
    b = c.unit.building if c.unit else None
    pays = sorted(c.payments, key=lambda p: (p.due_date, p.id))
    paid = sum(float(p.amount or 0) for p in pays if p.status == "paid")
    total = sum(float(p.amount or 0) for p in pays)
    nxt = next((p for p in pays if p.status != "paid"), None)
    out = {
        "id": c.id,
        "contract_number": c.contract_number,
        "ejar_contract_number": c.ejar_contract_number,
        "ejar_status": c.ejar_status,
        "type": c.contract_type,
        "state": _contract_state(c, today),
        "status": c.status,
        "property": localized_value(b, "name", locale) if b else None,
        "address": (localized_value(b, "address", locale) or b.national_address) if b else None,
        "district": localized_value(b, "district", locale) if b else None,
        "city": localized_value(b, "city", locale) if b else None,
        "unit": c.unit.number if c.unit else None,
        "unit_type": c.unit.unit_type if c.unit else None,
        "start_date": c.start_date.isoformat(),
        "end_date": c.end_date.isoformat(),
        "days_left": (c.end_date - today).days,
        "total_amount": r2(c.total_amount or total),
        "annual_rent": r2(c.rent_amount),
        "payment_type": c.payment_type,
        "payment_count": c.payment_count or len(pays),
        "paid_amount": r2(paid),
        "scheduled_amount": r2(total),
        "remaining_amount": r2(total - paid),
        "payments_paid": sum(1 for p in pays if p.status == "paid"),
        "payments_total": len(pays),
        "next_payment": _payment_json(nxt, c, reports.get(nxt.id), today, pays.index(nxt) + 1, len(pays), locale) if nxt else None,
    }
    if full:
        out.update(
            {
                "rent_amount": r2(c.rent_amount),
                "services_amount": r2(c.services_amount),
                "insurance_amount": r2(getattr(c, "insurance_amount", 0)),
                "vat_amount": r2(getattr(c, "vat_amount", 0)),
                "electricity_on_tenant": c.electricity_on_tenant,
                "water_on_tenant": c.water_on_tenant,
                "electricity_meter_number": c.electricity_meter_number,
                "water_meter_number": c.water_meter_number,
                "electricity_amount": r2(c.electricity_amount),
                "water_amount": r2(c.water_amount),
                "lat": b.latitude if b else None,
                "lng": b.longitude if b else None,
                "attachments": [
                    {"name": a.filename, "url": a.url, "type": a.file_type}
                    for a in sorted(c.attachments, key=lambda a: a.sort_order)
                ],
                "payments": [
                    _payment_json(p, c, reports.get(p.id), today, i + 1, len(pays), locale) for i, p in enumerate(pays)
                ],
            }
        )
    return out


# ═══════════════════════════ tenant endpoints ═══════════════════════════


@router.get("/me")
def me(scope: ScopeDep, locale: LocaleDep, db: DbSession, user: CurrentUser):
    t = scope.tenant
    link = scope.link or db.scalar(select(TenantUser).where(TenantUser.tenant_id == t.id))
    return {
        # Staff preview: the tenant's portal account (support tickets are filed under it) and what staff may do for them.
        "user_id": link.user_id if link else None,
        "staff_can": {
            "maintenance": scope.preview and has_permission(db, user, "maintenance", "create"),
            "support": scope.preview and link is not None,
        },
        "tenant_id": t.id,
        "name": localized_value(t, "name", locale),
        "phone": t.phone,
        "email": t.email,
        "email_reminders": scope.link.email_reminders if scope.link else True,
        "preview": scope.preview,
    }


@router.get("/overview")
def overview(scope: ScopeDep, db: DbSession, locale: LocaleDep):
    today = date.today()
    contracts = _contracts(db, scope.tenant.id)
    reports = _reports(db, scope.tenant.id)
    rows = []
    for c in contracts:
        pays = sorted(c.payments, key=lambda p: (p.due_date, p.id))
        for i, p in enumerate(pays):
            rows.append(_payment_json(p, c, reports.get(p.id), today, i + 1, len(pays), locale))
    unpaid = [r for r in rows if r["state"] != "paid"]
    unpaid.sort(key=lambda r: r["due_date"])
    overdue = [r for r in unpaid if r["state"] == "overdue"]
    paid = sorted((r for r in rows if r["state"] == "paid"), key=lambda r: r["paid_date"] or r["due_date"], reverse=True)
    active = [c for c in contracts if _contract_state(c, today) != "ended"]
    return {
        "as_of": today.isoformat(),
        "next": next((r for r in unpaid if r["state"] != "reported"), None),
        "kpis": {
            "active_contracts": len(active),
            "overdue_amount": r2(sum(r["amount"] for r in overdue)),
            "overdue_count": len(overdue),
            "remaining_amount": r2(sum(r["amount"] for r in unpaid)),
            "paid_amount": r2(sum(r["amount"] for r in paid)),
            "reported_count": sum(1 for r in unpaid if r["state"] == "reported"),
        },
        "upcoming": unpaid[:6],
        "recent_paid": paid[:5],
        "contracts": [_contract_json(c, reports, today, locale) for c in active] or [
            _contract_json(c, reports, today, locale) for c in contracts[:1]
        ],
    }


@router.get("/contracts")
def contracts(scope: ScopeDep, db: DbSession, locale: LocaleDep):
    today = date.today()
    reports = _reports(db, scope.tenant.id)
    return [_contract_json(c, reports, today, locale) for c in _contracts(db, scope.tenant.id)]


@router.get("/contracts/{contract_id}")
def contract_detail(contract_id: int, scope: ScopeDep, db: DbSession, locale: LocaleDep):
    c = next((c for c in _contracts(db, scope.tenant.id) if c.id == contract_id), None)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    return _contract_json(c, _reports(db, scope.tenant.id), date.today(), locale, full=True)


@router.get("/payments")
def payments(scope: ScopeDep, db: DbSession, locale: LocaleDep):
    today = date.today()
    reports = _reports(db, scope.tenant.id)
    out = []
    for c in _contracts(db, scope.tenant.id):
        pays = sorted(c.payments, key=lambda p: (p.due_date, p.id))
        out += [_payment_json(p, c, reports.get(p.id), today, i + 1, len(pays), locale) for i, p in enumerate(pays)]
    out.sort(key=lambda r: r["due_date"])
    return out


class ReportIn(BaseModel):
    paid_on: date
    amount: float = Field(gt=0, le=10_000_000)
    method: Literal["bank_transfer", "cash", "cheque"] = "bank_transfer"
    reference: Optional[str] = Field(default=None, max_length=80)
    note: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("paid_on")
    @classmethod
    def _not_future(cls, v: date) -> date:
        if v > date.today() + timedelta(days=1):
            raise ValueError("The payment date can't be in the future")
        return v


def _own_payment(db: Session, tenant_id: int, payment_id: int) -> Payment:
    p = db.scalar(
        select(Payment)
        .join(Payment.contract)
        .where(Payment.id == payment_id, Contract.tenant_id == tenant_id)
        .options(selectinload(Payment.contract).selectinload(Contract.unit).selectinload(Unit.building))
    )
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    return p


RECEIPT_MAX_BYTES = 10 * 1024 * 1024
RECEIPT_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp"}


@router.post("/payments/{payment_id}/report")
async def report_payment(
    payment_id: int,
    scope: ScopeDep,
    db: DbSession,
    user: CurrentUser,
    locale: LocaleDep,
    paid_on: Annotated[date, Form()],
    amount: Annotated[float, Form(gt=0, le=10_000_000)],
    reference: Annotated[str, Form(min_length=1, max_length=80)],
    receipt: Annotated[UploadFile, File()],
    method: Annotated[Literal["bank_transfer", "cash", "cheque"], Form()] = "bank_transfer",
    note: Annotated[Optional[str], Form(max_length=1000)] = None,
):
    """Tenant reports an instalment as paid: date, amount, receipt / transfer number and the proof (required)."""
    if scope.preview:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff preview is read-only")
    try:
        paid_on = ReportIn(paid_on=paid_on, amount=amount).paid_on
    except Exception:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The payment date can't be in the future")
    ref = reference.strip()
    if not ref:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Enter the receipt or transfer number.")
    p = _own_payment(db, scope.tenant.id, payment_id)
    if p.status == "paid":
        raise HTTPException(status.HTTP_409_CONFLICT, "This instalment is already recorded as paid.")
    if db.scalar(select(PaymentReport).where(PaymentReport.payment_id == p.id, PaymentReport.status == "pending")):
        raise HTTPException(status.HTTP_409_CONFLICT, "You've already reported this payment. We're checking it.")
    if receipt is None or not receipt.filename:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Attach the receipt or transfer slip.")
    ctype = (receipt.content_type or "").lower()
    if ctype not in RECEIPT_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The receipt must be a PDF or an image (JPG, PNG, WebP).")
    content = await receipt.read(RECEIPT_MAX_BYTES + 1)
    if len(content) > RECEIPT_MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "The receipt must be 10 MB or smaller.")
    from api.storage import StorageNotConfigured, upload_document

    try:
        stored = upload_document(io.BytesIO(content), content_type=ctype, prefix=f"payment-reports/{p.id}", original_filename=receipt.filename)
    except StorageNotConfigured as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    rep = PaymentReport(
        payment_id=p.id,
        tenant_id=scope.tenant.id,
        user_id=user.id,
        paid_on=paid_on,
        amount=amount,
        method=method,
        reference=ref,
        note=(note or "").strip() or None,
        receipt_key=stored.object_key,
        receipt_url=stored.public_url,
        receipt_name=(receipt.filename or "receipt")[:255],
    )
    db.add(rep)
    db.add(AuditLog(user_id=user.id, username=user.username, action="tenant_payment_report", entity_type="payment", entity_id=str(p.id)))
    db.commit()
    _notify_staff_report(db, rep, p)
    return {"ok": True, "id": rep.id}


class PrefsIn(BaseModel):
    email_reminders: bool


@router.put("/preferences")
def preferences(payload: PrefsIn, scope: ScopeDep, db: DbSession):
    if scope.preview or scope.link is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff preview is read-only")
    scope.link.email_reminders = payload.email_reminders
    db.commit()
    return {"email_reminders": scope.link.email_reminders}


def _ics_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@router.get("/calendar.ics")
def calendar(scope: ScopeDep, db: DbSession, locale: LocaleDep):
    """Unpaid due dates as calendar events with reminders 3 days and 1 day before."""
    today = date.today()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Muktasabat//Tenant portal//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
             "X-WR-CALNAME:" + ("دفعات الإيجار — مكتسبات" if locale == "ar" else "Rent payments — Muktasabat")]
    for c in _contracts(db, scope.tenant.id):
        pays = sorted(c.payments, key=lambda p: (p.due_date, p.id))
        for i, p in enumerate(pays):
            if p.status == "paid" or p.due_date < today - timedelta(days=1):
                continue
            amount = f"{float(p.amount or 0):,.0f}"
            title = (
                f"دفعة الإيجار {i + 1}/{len(pays)} — {amount} ر.س" if locale == "ar"
                else f"Rent instalment {i + 1}/{len(pays)} — SAR {amount}"
            )
            desc = (f"عقد {c.contract_number}" if locale == "ar" else f"Contract {c.contract_number}")
            d0, d1 = p.due_date.strftime("%Y%m%d"), (p.due_date + timedelta(days=1)).strftime("%Y%m%d")
            lines += [
                "BEGIN:VEVENT", f"UID:mk-payment-{p.id}@muktasabat.com", f"DTSTAMP:{stamp}",
                f"DTSTART;VALUE=DATE:{d0}", f"DTEND;VALUE=DATE:{d1}",
                "SUMMARY:" + _ics_escape(title), "DESCRIPTION:" + _ics_escape(desc),
                "BEGIN:VALARM", "TRIGGER:-P3D", "ACTION:DISPLAY", "DESCRIPTION:" + _ics_escape(title), "END:VALARM",
                "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:" + _ics_escape(title), "END:VALARM",
                "END:VEVENT",
            ]
    lines.append("END:VCALENDAR")
    return Response(
        "\r\n".join(lines) + "\r\n",
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="muktasabat-payments.ics"'},
    )


# ═══════════════════════════ e-mails ═══════════════════════════


def _portal_url(locale: str, path: str = "") -> str:
    return f"{get_settings().web_base_url.rstrip('/')}/{locale}/tenant{path}"


def _notify_staff_report(db: Session, rep: PaymentReport, p: Payment) -> None:
    """Tell the property's responsible employee (same routing as payment alerts)."""
    try:
        from api.services.payment_alerts import recipients_for

        rcpt = recipients_for(p)
        if not rcpt.to:
            return
        c = p.contract
        tenant = escape(rep.tenant.name if rep.tenant else "")
        prop = escape(c.unit.building.name if c.unit and c.unit.building else "")
        unit = escape(c.unit.number if c.unit else "")
        amount = f"{rep.amount:,.2f}"
        url = f"{get_settings().web_base_url.rstrip('/')}/ar/payments?reports=1"
        html = _branded(
            f"<p>أبلغ المستأجر <strong>{tenant}</strong> عن سداد دفعة في {prop} – وحدة {unit}.</p>"
            f"<p>المبلغ: <strong>{amount} ر.س</strong> · التاريخ: {rep.paid_on.isoformat()} · المرجع: {escape(rep.reference or '—')}</p>"
            "<p>راجِع الحوالة ثم أكّد الدفعة أو ارفضها من صفحة الدفعات.</p>" + _button(url, "مراجعة البلاغ"),
            f"<p>Tenant <strong>{tenant}</strong> reported paying an instalment for {prop}, unit {unit}.</p>"
            f"<p>Amount: <strong>SAR {amount}</strong> · Date: {rep.paid_on.isoformat()} · Reference: {escape(rep.reference or '—')}</p>"
            "<p>Check the transfer, then confirm or reject it on the Payments page.</p>",
            preheader="بلاغ سداد من مستأجر · Tenant payment report",
        )
        send_email(EmailMessage(
            to=rcpt.to, cc=rcpt.cc or None,
            subject=f"بلاغ سداد — عقد {c.contract_number} | Tenant payment report",
            text_body=f"Tenant payment report: contract {c.contract_number}, SAR {amount}, {rep.paid_on}. Review: {url}",
            html_body=html, category="tenant_portal",
        ))
    except Exception:
        logger.exception("tenant payment report notification failed (report %s)", rep.id)


def _tenant_email(db: Session, tenant_id: int) -> Optional[str]:
    link = db.scalar(select(TenantUser).where(TenantUser.tenant_id == tenant_id).options(selectinload(TenantUser.user)))
    if link and link.user and link.user.is_active_user and link.user.email:
        return link.user.email
    return None


def _notify_tenant_review(db: Session, rep: PaymentReport) -> None:
    try:
        to = _tenant_email(db, rep.tenant_id)
        if not to:
            return
        ok = rep.status == "confirmed"
        amount = f"{rep.amount:,.2f}"
        note = escape(rep.review_note or "")
        html = _branded(
            (f"<p>تم تأكيد استلام دفعتك بمبلغ <strong>{amount} ر.س</strong>. شكراً لك.</p>" if ok
             else f"<p>لم نتمكن من تأكيد الدفعة التي أبلغت عنها ({amount} ر.س).</p><p>السبب: {note or '—'}</p>")
            + _button(_portal_url("ar", "/payments"), "عرض دفعاتي"),
            (f"<p>We've confirmed your payment of <strong>SAR {amount}</strong>. Thank you.</p>" if ok
             else f"<p>We couldn't confirm the payment you reported (SAR {amount}).</p><p>Reason: {note or '—'}</p>"),
            preheader="تحديث على دفعتك · Payment update",
        )
        send_email(EmailMessage(
            to=to,
            subject=("تم تأكيد دفعتك | Payment confirmed" if ok else "لم نتمكن من تأكيد دفعتك | Payment not confirmed"),
            text_body=f"Payment {'confirmed' if ok else 'not confirmed'}: SAR {amount}. {rep.review_note or ''}",
            html_body=html, category="tenant_portal",
        ))
    except Exception:
        logger.exception("tenant review notification failed (report %s)", rep.id)


# ── Reminders (called from the hourly payment-alert job) ─────────────────────

REMINDER_STAGES = (-7, -1, 0, 3, 10)  # days relative to the due date (negative = before)


def run_tenant_reminders(db: Session, today: Optional[date] = None) -> int:
    from sqlalchemy.exc import IntegrityError

    from api.models import PaymentAlertLog

    if not get_settings().payment_alerts_enabled:
        return 0
    today = today or date.today()
    links = db.scalars(
        select(TenantUser).where(TenantUser.email_reminders.is_(True)).options(selectinload(TenantUser.user))
    ).all()
    sent = 0
    for link in links:
        u = link.user
        if not (u and u.is_active_user and u.email):
            continue
        pending_reported = {
            r.payment_id for r in db.scalars(
                select(PaymentReport).where(PaymentReport.tenant_id == link.tenant_id, PaymentReport.status == "pending")
            )
        }
        for c in _contracts(db, link.tenant_id):
            for p in c.payments:
                if p.status == "paid" or p.id in pending_reported:
                    continue
                offset = (today - p.due_date).days
                if offset not in REMINDER_STAGES:
                    continue
                stage = f"t{offset:+d}"
                row = PaymentAlertLog(payment_id=p.id, kind="tenant_self", stage=stage, to_email=u.email)
                db.add(row)
                try:
                    db.commit()
                except IntegrityError:
                    db.rollback()
                    continue
                row.delivered = send_email(_reminder_email(u.email, p, c, offset))
                db.commit()
                sent += 1
    return sent


def _reminder_email(to: str, p: Payment, c: Contract, offset: int) -> EmailMessage:
    amount = f"{float(p.amount or 0):,.2f}"
    due = p.due_date.isoformat()
    if offset < 0:
        ar = f"تذكير: دفعة الإيجار بمبلغ <strong>{amount} ر.س</strong> تستحق بعد {-offset} {'يوم' if offset == -1 else 'أيام'} ({due})."
        en = f"Reminder: your rent instalment of <strong>SAR {amount}</strong> is due in {-offset} day{'s' if offset != -1 else ''} ({due})."
        subj = "تذكير بموعد دفعة الإيجار | Rent due soon"
    elif offset == 0:
        ar = f"دفعة الإيجار بمبلغ <strong>{amount} ر.س</strong> مستحقة اليوم ({due})."
        en = f"Your rent instalment of <strong>SAR {amount}</strong> is due today ({due})."
        subj = "دفعة الإيجار مستحقة اليوم | Rent due today"
    else:
        ar = f"دفعة الإيجار بمبلغ <strong>{amount} ر.س</strong> متأخرة منذ {offset} أيام (تاريخ الاستحقاق {due})."
        en = f"Your rent instalment of <strong>SAR {amount}</strong> is {offset} days overdue (due {due})."
        subj = "دفعة إيجار متأخرة | Rent overdue"
    tail_ar = "<p>إن كنت قد سددت، أبلغنا من البوابة لنؤكد الاستلام.</p>"
    tail_en = "<p>Already paid? Tell us in the portal and we'll confirm it.</p>"
    html = _branded(
        f"<p>{ar}</p><p>عقد رقم {escape(c.contract_number)}</p>{tail_ar}" + _button(_portal_url("ar", "/payments"), "عرض دفعاتي"),
        f"<p>{en}</p><p>Contract {escape(c.contract_number)}</p>{tail_en}",
        preheader=subj,
    )
    return EmailMessage(
        to=to, subject=subj,
        text_body=re.sub(r"<[^>]+>", "", f"{ar}\n{en}\n{_portal_url('ar', '/payments')}"),
        html_body=html, category="tenant_portal",
    )


# ═══════════════════════════ staff ═══════════════════════════


def _require(db: Session, user: User, module: str, action: str) -> None:
    if user.role in ("owner", "tenant") or not has_permission(db, user, module, action):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Permission denied: {module}.{action}")


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
    _require(db, user, "tenants", "view")
    links = {l.tenant_id: l for l in db.scalars(select(TenantUser).options(selectinload(TenantUser.user))).all()}
    last_login = dict(
        db.execute(
            select(AuditLog.user_id, func.max(AuditLog.timestamp)).where(AuditLog.action == "login").group_by(AuditLog.user_id)
        ).all()
    )
    today = date.today()
    active_tenants = {
        tid for (tid,) in db.execute(
            select(Contract.tenant_id).where(Contract.tenant_id.is_not(None), Contract.end_date >= today)
        ).all()
    }
    out = []
    for t in db.scalars(select(Tenant).order_by(Tenant.name)).all():
        link = links.get(t.id)
        u = link.user if link else None
        out.append(
            {
                "id": t.id,
                "name": localized_value(t, "name", locale),
                "email": t.email,
                "phone": t.phone,
                "has_lease": t.id in active_tenants,
                "has_account": u is not None,
                "active": bool(u and u.is_active_user),
                "username": u.username if u else None,
                "invite_pending": bool(u and u.password_reset_token and not last_login.get(u.id)),
                "last_login": last_login[u.id].isoformat() if u and last_login.get(u.id) else None,
            }
        )
    return out


@router.post("/admin/tenants/{tenant_id}/invite")
def invite_tenant(tenant_id: int, payload: InviteIn, db: DbSession, user: CurrentUser):
    _require(db, user, "tenants", "edit")
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    link = db.scalar(select(TenantUser).where(TenantUser.tenant_id == tenant_id))
    acct = db.get(User, link.user_id) if link else None
    clash = db.scalar(select(User).where((User.email == payload.email) | (User.username == payload.email)))
    if acct is None:
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This email already belongs to another account.")
        acct = User(username=payload.email, email=payload.email, role="tenant", is_active_user=True, email_verified=True)
        acct.set_password(secrets.token_urlsafe(24))
        db.add(acct)
        db.flush()
        db.add(TenantUser(tenant_id=tenant_id, user_id=acct.id))
    else:
        if clash is not None and clash.id != acct.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "This email already belongs to another account.")
        acct.email = payload.email
        acct.is_active_user = True
    raw = secrets.token_urlsafe(32)
    acct.password_reset_token = hashlib.sha256(raw.encode()).hexdigest()
    acct.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=72)
    db.add(AuditLog(user_id=user.id, username=user.username, action="tenant_portal_invite", entity_type="tenant", entity_id=str(tenant_id)))
    db.commit()

    url = f"{get_settings().web_base_url.rstrip('/')}/{payload.locale}/reset-password?token={raw}"
    name = escape(localized_value(tenant, "name", payload.locale))
    to = escape(payload.email)
    html = _branded(
        f"<p>مرحباً {name}،</p><p>تمت دعوتك إلى <strong>بوابة المستأجرين</strong> في شركة مكتسبات العقارية: "
        "اطّلع على عقدك ومواعيد دفعاتك، وأبلغنا عن السداد، واستلم تذكيرات قبل كل موعد.</p>"
        f"<p>اسم المستخدم: <strong dir='ltr'>{to}</strong></p>" + _button(url, "تفعيل الحساب")
        + "<p style='color:#5D636B;font-size:13px'>الرابط صالح لمدة 72 ساعة.</p>",
        f"<p>Hello {name},</p><p>You've been invited to the Muktasabat <strong>tenant portal</strong>: see your lease and "
        "payment dates, tell us when you've paid, and get reminders before each due date.</p>"
        f"<p>Username: <strong>{to}</strong></p>" + _button(url, "Activate account")
        + "<p style='color:#5D636B;font-size:13px'>The link is valid for 72 hours.</p>",
        preheader="دعوة إلى بوابة المستأجرين · Your tenant portal invitation",
    )
    send_email(EmailMessage(
        to=payload.email, subject="دعوة إلى بوابة المستأجرين — مكتسبات | Your Muktasabat tenant portal",
        text_body=f"Set your password (valid 72 hours): {url}\nUsername: {payload.email}",
        html_body=html, category="tenant_portal",
    ))
    return {"username": acct.username, "invite_url": url, "expires_hours": 72}


@router.post("/admin/tenants/{tenant_id}/revoke")
def revoke_tenant(tenant_id: int, db: DbSession, user: CurrentUser):
    _require(db, user, "tenants", "edit")
    link = db.scalar(select(TenantUser).where(TenantUser.tenant_id == tenant_id))
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No portal account")
    acct = db.get(User, link.user_id)
    acct.is_active_user = False
    acct.password_reset_token = None
    db.add(AuditLog(user_id=user.id, username=user.username, action="tenant_portal_revoke", entity_type="tenant", entity_id=str(tenant_id)))
    db.commit()
    return {"ok": True}


@router.get("/admin/reports")
def list_reports(
    db: DbSession,
    user: CurrentUser,
    locale: LocaleDep,
    status_filter: Annotated[Literal["pending", "confirmed", "rejected", "all"], Query(alias="status")] = "pending",
):
    _require(db, user, "payments", "view")
    q = select(PaymentReport).options(
        selectinload(PaymentReport.tenant),
        selectinload(PaymentReport.payment).selectinload(Payment.contract).selectinload(Contract.unit).selectinload(Unit.building),
    ).order_by(PaymentReport.created_at.desc())
    if status_filter != "all":
        q = q.where(PaymentReport.status == status_filter)
    out = []
    for r in db.scalars(q.limit(200)).all():
        p = r.payment
        c = p.contract if p else None
        out.append(
            {
                "id": r.id,
                "payment_id": r.payment_id,
                "status": r.status,
                "tenant": localized_value(r.tenant, "name", locale) if r.tenant else None,
                "contract_number": c.contract_number if c else None,
                "property": localized_value(c.unit.building, "name", locale) if c and c.unit and c.unit.building else None,
                "unit": c.unit.number if c and c.unit else None,
                "due_date": _iso(p.due_date) if p else None,
                "due_amount": r2(p.amount) if p else None,
                "paid_on": r.paid_on.isoformat(),
                "amount": r2(r.amount),
                "method": r.method,
                "reference": r.reference,
                "note": r.note,
                "receipt_url": r.receipt_url,
                "receipt_name": r.receipt_name,
                "sent_at": r.created_at.isoformat(),
                "review_note": r.review_note,
            }
        )
    return out


class ReviewIn(BaseModel):
    note: Optional[str] = Field(default=None, max_length=500)
    receipt_number: Optional[str] = Field(default=None, max_length=50)


@router.post("/admin/reports/{report_id}/confirm")
def confirm_report(report_id: int, payload: ReviewIn, db: DbSession, user: CurrentUser):
    _require(db, user, "payments", "edit")
    rep = db.get(PaymentReport, report_id)
    if rep is None or rep.status != "pending":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found or already reviewed")
    p = db.get(Payment, rep.payment_id)
    if p.status != "paid":
        from api.routers.payments import _create_payment_splits
        from api.services import payment_alerts

        p.status = "paid"
        p.paid_date = rep.paid_on
        p.payment_method = rep.method
        p.receipt_number = payload.receipt_number or rep.reference
        if rep.receipt_url and not p.receipt_url:
            p.receipt_key, p.receipt_url, p.receipt_name = rep.receipt_key, rep.receipt_url, rep.receipt_name
        p.notes = ((p.notes or "") + f"\n[tenant report #{rep.id}] {rep.note or ''}").strip()
        p.owner_transfer_due_date = p.paid_date + timedelta(days=get_settings().owner_transfer_days)
        _create_payment_splits(db, p)
    rep.status = "confirmed"
    rep.reviewed_by_id = user.id
    rep.reviewed_at = datetime.utcnow()
    rep.review_note = payload.note
    db.add(AuditLog(user_id=user.id, username=user.username, action="tenant_payment_confirm", entity_type="payment", entity_id=str(p.id)))
    db.commit()
    try:
        from api.services import payment_alerts

        payment_alerts.notify_payment_received(db, p.id)
    except Exception:
        logger.exception("payment received alert failed")
    _notify_tenant_review(db, rep)
    return {"ok": True}


@router.post("/admin/reports/{report_id}/reject")
def reject_report(report_id: int, payload: ReviewIn, db: DbSession, user: CurrentUser):
    _require(db, user, "payments", "edit")
    rep = db.get(PaymentReport, report_id)
    if rep is None or rep.status != "pending":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found or already reviewed")
    if not (payload.note or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tell the tenant why (it's shown to them).")
    rep.status = "rejected"
    rep.reviewed_by_id = user.id
    rep.reviewed_at = datetime.utcnow()
    rep.review_note = payload.note.strip()
    db.add(AuditLog(user_id=user.id, username=user.username, action="tenant_payment_reject", entity_type="payment", entity_id=str(rep.payment_id)))
    db.commit()
    _notify_tenant_review(db, rep)
    return {"ok": True}


@router.get("/export/{kind}.csv")
def export(kind: str, scope: ScopeDep, db: DbSession, locale: LocaleDep):
    import csv
    import io

    ar = locale == "ar"
    H = lambda a, e: a if ar else e  # noqa: E731
    today = date.today()
    reports = _reports(db, scope.tenant.id)
    buf = io.StringIO()
    w = csv.writer(buf)
    ST = {"paid": H("مدفوعة", "Paid"), "reported": H("قيد التأكيد", "Being confirmed"), "overdue": H("متأخرة", "Overdue"),
          "due_soon": H("مستحقة قريباً", "Due soon"), "upcoming": H("قادمة", "Upcoming")}
    MT = {"bank_transfer": H("تحويل بنكي", "Bank transfer"), "cash": H("نقداً", "Cash"), "cheque": H("شيك", "Cheque")}
    if kind == "payments":
        w.writerow([H("رقم العقد", "Lease"), H("العقار", "Property"), H("الوحدة", "Unit"), H("الدفعة", "Instalment"), H("تاريخ الاستحقاق", "Due date"),
                    H("المبلغ", "Amount"), H("الحالة", "Status"), H("تاريخ السداد", "Paid on"), H("طريقة الدفع", "Method"), H("رقم الإيصال", "Receipt")])
        for c in _contracts(db, scope.tenant.id):
            pays = sorted(c.payments, key=lambda p: (p.due_date, p.id))
            for i, p in enumerate(pays):
                j = _payment_json(p, c, reports.get(p.id), today, i + 1, len(pays), locale)
                w.writerow([c.contract_number, j["property"] or "", j["unit"] or "", f"{i + 1}/{len(pays)}", j["due_date"], j["amount"], ST[j["state"]],
                            j["paid_date"] or "", MT.get(j["method"] or "", j["method"] or ""), j["receipt_number"] or ""])
    elif kind == "leases":
        w.writerow([H("رقم العقد", "Lease"), H("رقم عقد إيجار", "Ejar no."), H("العقار", "Property"), H("الوحدة", "Unit"), H("البداية", "Start"), H("النهاية", "End"),
                    H("الإيجار السنوي", "Annual rent"), H("إجمالي العقد", "Lease total"), H("المدفوع", "Paid"), H("المتبقي", "Left to pay")])
        for c in _contracts(db, scope.tenant.id):
            j = _contract_json(c, reports, today, locale)
            w.writerow([j["contract_number"], j["ejar_contract_number"] or "", j["property"] or "", j["unit"] or "", j["start_date"], j["end_date"],
                        j["annual_rent"], j["total_amount"], j["paid_amount"], j["remaining_amount"]])
    else:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown export")
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{kind}.csv"'})
