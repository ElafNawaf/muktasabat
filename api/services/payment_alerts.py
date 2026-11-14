"""Payment-timeline alerts (تنبيهات الجدول الزمني للدفعات).

Every instalment of a lease has two money movements, and staff are alerted
along both, by e-mail **To** the employee responsible for the property
(``Building.assignee``) with the CEO in **Cc** (``PAYMENT_ALERTS_CC``):

1. Tenant → company (تحصيل الإيجار)
   * ``tenant_due``     early alerts before the due date (PAYMENT_ALERT_LEAD_DAYS,
                        default 7, 3 and 1 days) and on the due date itself.
   * ``tenant_overdue`` reminders after a missed due date
                        (PAYMENT_ALERT_OVERDUE_DAYS, default +1, +3, +7, +14, +30).
   * ``tenant_paid``    sent the moment the payment is marked as received.

2. Company → owner (تحويل حصة المالك)
   When the tenant pays, the owner's share becomes due OWNER_TRANSFER_DAYS
   later (``Payment.owner_transfer_due_date``).
   * ``owner_due``      early alerts and on the transfer due date.
   * ``owner_overdue``  reminders after a missed transfer date.
   * ``owner_paid``     confirmation when staff record the transfer.

Every e-mail carries the instalment details and the contract's full payment
timeline (each instalment's tenant due date and owner transfer date).

Delivery guarantees
-------------------
* A stage is *claimed* by inserting a :class:`PaymentAlertLog` row (unique on
  payment + kind + stage) before the mail is sent — never sent twice, even if
  two API processes run the job at once.
* Only the most recent stage that has come due is sent, and only within
  PAYMENT_ALERTS_CATCHUP_DAYS, so downtime or old data never floods inboxes.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from html import escape
from typing import Optional

from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from api.config import get_settings
from api.email import EmailMessage, _branded, _button, last_send_error, send_email
from api.models import Building, Contract, Payment, PaymentAlertLog, Unit

logger = logging.getLogger(__name__)

RIYADH = timezone(timedelta(hours=3))  # Saudi Arabia: UTC+3, no DST

UNPAID = ("pending", "overdue")


def riyadh_now() -> datetime:
    return datetime.now(RIYADH)


def riyadh_today() -> date:
    return riyadh_now().date()


def _days(raw: str) -> list[int]:
    out = set()
    for part in (raw or "").split(","):
        part = part.strip()
        if part.isdigit() and int(part) > 0:
            out.add(int(part))
    return sorted(out)


# ── Money ──────────────────────────────────────────────────────────────────────


@dataclass
class Split:
    amount: float
    management_fee: float
    agent_fee: float
    ejar_fee: float
    owner_share: float
    management_pct: float
    agent_pct: float


def compute_split(payment: Payment) -> Split:
    """Owner share of one instalment — same formula the payments router uses
    to write PaymentSplit rows, so the alert and the books agree."""
    contract, unit = payment.contract, payment.contract.unit
    amount = float(payment.amount or 0)
    mgmt_pct = contract.management_percentage or (unit.management_percentage or 0)
    agent_pct = contract.agent_percentage or (unit.agent_percentage or 0)
    mgmt = round(amount * mgmt_pct / 100, 2)
    agent = round(amount * agent_pct / 100, 2)
    ejar = round(unit.ejar_fee or 0, 2)
    return Split(amount, mgmt, agent, ejar, round(amount - mgmt - agent - ejar, 2), mgmt_pct, agent_pct)


def owner_share(payment: Payment) -> float:
    for s in payment.splits or []:
        if s.split_type == "owner_share":
            return float(s.amount)
    return compute_split(payment).owner_share


# ── Stages ─────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Stage:
    kind: str
    stage: str
    trigger: date
    offset: int  # days relative to the due date (negative = before)


def planned_stages(payment: Payment) -> list[Stage]:
    """Every scheduled alert for this payment in its current state."""
    s = get_settings()
    lead, overdue = _days(s.payment_alert_lead_days), _days(s.payment_alert_overdue_days)

    def ladder(prefix: str, due: date) -> list[Stage]:
        out = [Stage(f"{prefix}_due", f"d-{d}", due - timedelta(days=d), -d) for d in lead]
        out.append(Stage(f"{prefix}_due", "d0", due, 0))
        out += [Stage(f"{prefix}_overdue", f"d+{d}", due + timedelta(days=d), d) for d in overdue]
        return out

    if payment.status in UNPAID:
        if payment.contract.status == "terminated":
            return []
        return ladder("tenant", payment.due_date)
    if payment.status == "paid" and payment.owner_transfer_due_date and not payment.owner_transferred_date:
        return ladder("owner", payment.owner_transfer_due_date)
    return []


def current_stage(payment: Payment, today: date) -> Optional[Stage]:
    """The latest stage that has come due, if it's still within the catch-up window."""
    floor = today - timedelta(days=get_settings().payment_alerts_catchup_days)
    ready = [st for st in planned_stages(payment) if floor <= st.trigger <= today]
    return max(ready, key=lambda st: st.trigger) if ready else None


# ── Recipients ─────────────────────────────────────────────────────────────────


@dataclass
class Recipients:
    to: Optional[str]
    cc: list[str] = field(default_factory=list)
    responsible_name: Optional[str] = None
    unassigned: bool = False  # no responsible employee on the property


def ceo_cc() -> list[str]:
    return [e.strip().lower() for e in get_settings().payment_alerts_cc.split(",") if e.strip()]


def recipients_for(payment: Payment) -> Recipients:
    building: Building = payment.contract.unit.building
    cc = ceo_cc()
    user = building.assignee
    if user is not None and user.is_active_user and user.email:
        name = (user.employee.name if user.employee else None) or user.username
        return Recipients(to=user.email.lower(), cc=cc, responsible_name=name)
    # No assignee on the property: the employees who look after this owner.
    for emp in building.owner.employees if building.owner else []:
        if emp.user and emp.user.is_active_user and emp.user.email:
            return Recipients(to=emp.user.email.lower(), cc=cc, responsible_name=emp.name)
    # Nobody responsible: the CEO gets it directly, flagged in the e-mail.
    return Recipients(to=cc[0] if cc else None, cc=cc[1:], unassigned=True)


# ── E-mail ─────────────────────────────────────────────────────────────────────


def _sar(v: float) -> str:
    return f"{v:,.2f}"


def _d(v: Optional[date]) -> str:
    return v.isoformat() if v else "—"


def _ld(v: Optional[date]) -> str:
    """Date inside Arabic text: keep it left-to-right."""
    return f"<span dir='ltr'>{_d(v)}</span>"


def _ar_days(n: int) -> str:
    n = abs(n)
    if n == 1:
        return "يوم واحد"
    if n == 2:
        return "يومين"
    if 3 <= n <= 10:
        return f"{n} أيام"
    return f"{n} يومًا"


def _en_days(n: int) -> str:
    n = abs(n)
    return "1 day" if n == 1 else f"{n} days"


# kind → (accent colour, Arabic headline, English headline). {n} = day phrase.
_HEAD = {
    "tenant_due": ("#B26B00", "دفعة إيجار مستحقة على المستأجر", "Tenant rent payment due"),
    "tenant_overdue": ("#B42318", "دفعة إيجار متأخرة على المستأجر", "Tenant rent payment overdue"),
    "tenant_paid": ("#1E7B4F", "تم استلام دفعة الإيجار من المستأجر", "Rent payment received from tenant"),
    "owner_due": ("#7B1A1A", "موعد تحويل حصة المالك", "Owner payout due"),
    "owner_overdue": ("#B42318", "تأخر تحويل حصة المالك", "Owner payout overdue"),
    "owner_paid": ("#1E7B4F", "تم تحويل حصة المالك", "Owner payout completed"),
}


def _when(kind: str, offset: int) -> tuple[str, str]:
    """Short 'when' line in both languages."""
    if kind in ("tenant_paid", "owner_paid"):
        return "", ""
    if offset < 0:
        return f"بعد {_ar_days(offset)}", f"in {_en_days(offset)}"
    if offset == 0:
        return "اليوم", "today"
    return f"متأخرة {_ar_days(offset)}", f"{_en_days(offset)} overdue"


def _subject(kind: str, offset: int, contract_no: str) -> str:
    ar_when, en_when = _when(kind, offset)
    ar = {
        "tenant_due": f"تنبيه مبكر: دفعة إيجار مستحقة {ar_when}" if offset < 0 else "اليوم: استحقاق دفعة إيجار",
        "tenant_overdue": f"دفعة إيجار {ar_when}",
        "tenant_paid": "تم استلام دفعة إيجار",
        "owner_due": f"تنبيه مبكر: تحويل حصة المالك {ar_when}" if offset < 0 else "اليوم: تحويل حصة المالك",
        "owner_overdue": f"تحويل حصة المالك متأخر {_ar_days(offset)}",
        "owner_paid": "تم تحويل حصة المالك",
    }[kind]
    en = {
        "tenant_due": f"Rent due {en_when}",
        "tenant_overdue": f"Rent {en_when}",
        "tenant_paid": "Rent payment received",
        "owner_due": f"Owner payout due {en_when}",
        "owner_overdue": f"Owner payout {en_when}",
        "owner_paid": "Owner payout completed",
    }[kind]
    return f"{ar} — عقد {contract_no} | {en} — {contract_no}"


def _rows(pairs: list[tuple[str, str]], rtl: bool) -> str:
    align = "right" if rtl else "left"
    cells = "".join(
        "<tr>"
        f"<td style='padding:7px 10px;border-bottom:1px solid #EFE9DE;color:#5D636B;white-space:nowrap;text-align:{align};vertical-align:top'>{escape(k)}</td>"
        f"<td style='padding:7px 10px;border-bottom:1px solid #EFE9DE;font-weight:bold;text-align:{align}'>{v}</td>"
        "</tr>"
        for k, v in pairs
    )
    return (
        f"<table role='presentation' dir='{'rtl' if rtl else 'ltr'}' width='100%' cellpadding='0' cellspacing='0' "
        f"style='border:1px solid #E3DDD2;border-radius:8px;border-collapse:separate;font-size:14px;margin:14px 0'>{cells}</table>"
    )


def _status_label(p: Payment, today: date, rtl: bool) -> tuple[str, str]:
    if p.status == "paid":
        return ("#1E7B4F", f"مدفوعة {_ld(p.paid_date)}" if rtl else f"Paid {_d(p.paid_date)}")
    if p.due_date < today:
        return ("#B42318", "متأخرة" if rtl else "Overdue")
    return ("#5D636B", "قادمة" if rtl else "Upcoming")


def _owner_label(p: Payment, today: date, rtl: bool) -> tuple[str, str]:
    if p.owner_transferred_date:
        return ("#1E7B4F", f"حُوِّلت {_ld(p.owner_transferred_date)}" if rtl else f"Sent {_d(p.owner_transferred_date)}")
    if p.owner_transfer_due_date:
        late = p.owner_transfer_due_date < today
        return (
            "#B42318" if late else "#B26B00",
            (f"مستحق {_ld(p.owner_transfer_due_date)}" if rtl else f"Due {_d(p.owner_transfer_due_date)}"),
        )
    days = get_settings().owner_transfer_days
    return ("#5D636B", f"بعد السداد بـ {_ar_days(days)}" if rtl else f"{_en_days(days)} after collection")


def _timeline(contract: Contract, current_id: int, today: date, rtl: bool) -> str:
    align = "right" if rtl else "left"
    th = f"padding:7px 8px;background:#F5EFE4;color:#7B1A1A;font-size:12.5px;text-align:{align};white-space:nowrap"
    heads = (
        ["#", "تاريخ الاستحقاق", "المبلغ (ر.س)", "حالة التحصيل", "تحويل المالك"]
        if rtl
        else ["#", "Tenant due", "Amount (SAR)", "Collection", "Owner payout"]
    )
    body = ""
    payments = sorted(contract.payments, key=lambda x: (x.due_date, x.id))
    for i, p in enumerate(payments, 1):
        hl = "background:#FFF6E5;" if p.id == current_id else ""
        sc, st = _status_label(p, today, rtl)
        oc, ot = _owner_label(p, today, rtl)
        td = f"padding:7px 8px;border-top:1px solid #EFE9DE;font-size:13px;text-align:{align};white-space:nowrap;{hl}"
        body += (
            f"<tr><td style='{td}'>{i}{' ◀' if p.id == current_id else ''}</td>"
            f"<td style='{td}' dir='ltr'>{_d(p.due_date)}</td>"
            f"<td style='{td}' dir='ltr'>{_sar(p.amount)}</td>"
            f"<td style='{td}color:{sc};font-weight:bold'>{st}</td>"
            f"<td style='{td}color:{oc}'>{ot}</td></tr>"
        )
    return (
        f"<div style='font-weight:bold;color:#7B1A1A;margin:18px 0 6px'>"
        f"{'الجدول الزمني لدفعات العقد' if rtl else 'Contract payment timeline'}</div>"
        f"<table role='presentation' dir='{'rtl' if rtl else 'ltr'}' width='100%' cellpadding='0' cellspacing='0' "
        f"style='border:1px solid #E3DDD2;border-radius:8px;border-collapse:separate;overflow:hidden'>"
        f"<tr>{''.join(f'<th style={chr(39)}{th}{chr(39)}>{h}</th>' for h in heads)}</tr>{body}</table>"
    )


def build_email(payment: Payment, kind: str, offset: int, rcpt: Recipients, today: date) -> EmailMessage:
    contract: Contract = payment.contract
    unit: Unit = contract.unit
    building: Building = unit.building
    owner = building.owner
    tenant = contract.tenant
    payments = sorted(contract.payments, key=lambda x: (x.due_date, x.id))
    idx = next((i for i, p in enumerate(payments, 1) if p.id == payment.id), 1)
    split = compute_split(payment)
    share = owner_share(payment)
    color, head_ar, head_en = _HEAD[kind]
    when_ar, when_en = _when(kind, offset)
    owner_side = kind.startswith("owner")
    base = get_settings().web_base_url.rstrip("/")
    url = f"{base}/ar/payments"
    property_name = escape(f"{building.name_ar or building.name} — {unit.name_ar or unit.name} ({unit.number})")
    property_name_en = escape(f"{building.name_en or building.name} — {unit.name_en or unit.name} ({unit.number})")
    tenant_name = escape(tenant.name if tenant else "—")
    tenant_phone = escape(getattr(tenant, "phone", None) or "—") if tenant else "—"
    owner_name = escape(owner.name if owner else "—")
    iban = (owner.iban or "") if owner else ""
    bank = escape(f"{owner.bank_name or ''} ···{iban[-4:]}" if iban else (owner.bank_name or "—") if owner else "—")
    ejar = escape(contract.ejar_contract_number or "—")
    responsible = escape(rcpt.responsible_name or "—")

    def badge(text_: str) -> str:
        return (
            f"<div style='display:inline-block;background:{color};color:#fff;border-radius:6px;"
            f"padding:6px 12px;font-weight:bold;font-size:15px'>{text_}</div>"
        )

    # Arabic details
    ar_pairs = [
        ("رقم العقد", f"<span dir='ltr'>{escape(contract.contract_number)}</span>"),
        ("رقم عقد إيجار", f"<span dir='ltr'>{ejar}</span>"),
        ("العقار / الوحدة", property_name),
        ("المستأجر", f"{tenant_name} · <span dir='ltr'>{tenant_phone}</span>"),
        ("المالك", owner_name),
        ("الدفعة", f"{idx} من {len(payments)}"),
        ("مبلغ الدفعة", f"<span dir='ltr'>{_sar(payment.amount)}</span> ر.س"),
        ("تاريخ استحقاق الدفعة", f"<span dir='ltr'>{_d(payment.due_date)}</span>"),
    ]
    en_pairs = [
        ("Contract no.", escape(contract.contract_number)),
        ("Ejar contract no.", ejar),
        ("Property / unit", property_name_en),
        ("Tenant", f"{tenant_name} · {tenant_phone}"),
        ("Owner", owner_name),
        ("Instalment", f"{idx} of {len(payments)}"),
        ("Amount", f"SAR {_sar(payment.amount)}"),
        ("Tenant due date", _d(payment.due_date)),
    ]
    if payment.status == "paid":
        ar_pairs.append(("تاريخ السداد", f"<span dir='ltr'>{_d(payment.paid_date)}</span>"))
        en_pairs.append(("Paid on", _d(payment.paid_date)))
    if owner_side or kind == "tenant_paid":
        fees_ar = f"أتعاب الإدارة {_sar(split.management_fee)} · الوسيط {_sar(split.agent_fee)} · إيجار {_sar(split.ejar_fee)}"
        fees_en = f"Management {_sar(split.management_fee)} · Agent {_sar(split.agent_fee)} · Ejar {_sar(split.ejar_fee)}"
        ar_pairs += [
            ("الخصومات", fees_ar),
            ("صافي حصة المالك", f"<span dir='ltr'>{_sar(share)}</span> ر.س"),
            ("موعد التحويل للمالك", f"<span dir='ltr'>{_d(payment.owner_transfer_due_date)}</span>"),
            ("حساب المالك", bank),
        ]
        en_pairs += [
            ("Deductions", fees_en),
            ("Net owner share", f"SAR {_sar(share)}"),
            ("Owner payout due", _d(payment.owner_transfer_due_date)),
            ("Owner account", bank),
        ]
    if kind == "owner_paid":
        ref = escape(payment.owner_transfer_reference or "—")
        ar_pairs += [("تاريخ التحويل", f"<span dir='ltr'>{_d(payment.owner_transferred_date)}</span>"), ("مرجع الحوالة", f"<span dir='ltr'>{ref}</span>")]
        en_pairs += [("Transferred on", _d(payment.owner_transferred_date)), ("Transfer reference", ref)]
    ar_pairs.append(("الموظف المسؤول", responsible))
    en_pairs.append(("Responsible employee", responsible))

    action_ar = {
        "tenant_due": "يرجى التواصل مع المستأجر لتذكيره بموعد السداد.",
        "tenant_overdue": "يرجى متابعة المستأجر لتحصيل الدفعة المتأخرة وتسجيلها في النظام فور استلامها.",
        "tenant_paid": f"يجب تحويل حصة المالك قبل {_ld(payment.owner_transfer_due_date)}.",
        "owner_due": "يرجى تحويل حصة المالك إلى حسابه وتسجيل التحويل في النظام.",
        "owner_overdue": "تجاوز تحويل حصة المالك موعده — يرجى التحويل فورًا وتسجيله في النظام.",
        "owner_paid": "اكتملت دورة هذه الدفعة.",
    }[kind]
    action_en = {
        "tenant_due": "Please remind the tenant of the upcoming payment.",
        "tenant_overdue": "Please follow up with the tenant and record the payment as soon as it is received.",
        "tenant_paid": f"The owner's share must be transferred by {_d(payment.owner_transfer_due_date)}.",
        "owner_due": "Please transfer the owner's share and record the transfer in the system.",
        "owner_overdue": "The owner payout is past due — please transfer it now and record it.",
        "owner_paid": "This instalment's cycle is complete.",
    }[kind]
    warn_ar = warn_en = ""
    if rcpt.unassigned:
        warn_ar = "<p style='background:#FDECEC;color:#B42318;padding:8px 12px;border-radius:6px;font-size:13px'>لا يوجد موظف مسؤول عن هذا العقار — يرجى تعيين موظف من صفحة العقار.</p>"
        warn_en = "<p style='background:#FDECEC;color:#B42318;padding:8px 12px;border-radius:6px;font-size:13px'>No employee is responsible for this property — please assign one on the property page.</p>"

    html = _branded(
        badge(f"{head_ar} {when_ar}".strip())
        + warn_ar
        + f"<p style='margin:14px 0 0'>{action_ar}</p>"
        + _rows(ar_pairs, True)
        + _timeline(contract, payment.id, today, True)
        + _button(url, "فتح صفحة الدفعات"),
        badge(f"{head_en} {when_en}".strip())
        + warn_en
        + f"<p style='margin:14px 0 0'>{action_en}</p>"
        + _rows(en_pairs, False)
        + _timeline(contract, payment.id, today, False)
        + _button(url.replace("/ar/", "/en/"), "Open payments"),
        preheader=f"{head_en} {when_en} — {contract.contract_number} — SAR {_sar(payment.amount)}",
    )

    def plain(pairs):
        import re

        return "\n".join(f"- {k}: {re.sub('<[^>]+>', '', v)}" for k, v in pairs)

    timeline = "\n".join(
        f"  {i}. {_d(p.due_date)}  SAR {_sar(p.amount)}  "
        f"{'paid ' + _d(p.paid_date) if p.status == 'paid' else ('OVERDUE' if p.due_date < today else 'upcoming')}"
        f"  owner: {'sent ' + _d(p.owner_transferred_date) if p.owner_transferred_date else ('due ' + _d(p.owner_transfer_due_date) if p.owner_transfer_due_date else '—')}"
        for i, p in enumerate(payments, 1)
    )
    text = (
        f"{head_ar} {when_ar}\n{action_ar}\n{plain(ar_pairs)}\n\n"
        f"{head_en} {when_en}\n{action_en}\n{plain(en_pairs)}\n\n"
        f"Payment timeline / الجدول الزمني:\n{timeline}\n\n{url}\n"
    )
    return EmailMessage(
        to=rcpt.to or "",
        cc=rcpt.cc or None,
        subject=_subject(kind, offset, contract.contract_number),
        text_body=text,
        html_body=html,
    )


# ── Sending ────────────────────────────────────────────────────────────────────


def _load(db: Session, payment_id: int) -> Optional[Payment]:
    return db.scalar(
        select(Payment)
        .where(Payment.id == payment_id)
        .options(
            selectinload(Payment.splits),
            selectinload(Payment.contract).selectinload(Contract.payments),
            selectinload(Payment.contract).selectinload(Contract.tenant),
            selectinload(Payment.contract)
            .selectinload(Contract.unit)
            .selectinload(Unit.building)
            .selectinload(Building.assignee),
        )
    )


def _claim(db: Session, payment: Payment, kind: str, stage: str, rcpt: Recipients) -> Optional[PaymentAlertLog]:
    row = PaymentAlertLog(
        payment_id=payment.id,
        kind=kind,
        stage=stage,
        to_email=rcpt.to,
        cc_emails=",".join(rcpt.cc) or None,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    return row


def send_alert(db: Session, payment: Payment, kind: str, stage: str, offset: int, today: Optional[date] = None) -> bool:
    """Claim (payment, kind, stage) and send it. False if already sent or no recipient."""
    if not get_settings().payment_alerts_enabled:
        return False
    today = today or riyadh_today()
    rcpt = recipients_for(payment)
    if not rcpt.to:
        logger.warning("payment alert %s/%s for payment %s: no recipient (set PAYMENT_ALERTS_CC)", kind, stage, payment.id)
        return False
    row = _claim(db, payment, kind, stage, rcpt)
    if row is None:
        return False
    msg = build_email(payment, kind, offset, rcpt, today)
    ok = send_email(msg)
    row.delivered = ok
    row.error = None if ok else (last_send_error() or "send_failed")
    db.commit()
    return ok


def notify_payment_received(db: Session, payment_id: int) -> None:
    """Tenant paid → 'received' e-mail with the owner payout date. Never raises."""
    try:
        p = _load(db, payment_id)
        if p is not None and p.status == "paid":
            send_alert(db, p, "tenant_paid", f"paid-{_d(p.paid_date)}", 0)
    except Exception:
        db.rollback()
        logger.exception("payment-received alert failed for payment %s", payment_id)


def notify_owner_transferred(db: Session, payment_id: int) -> None:
    try:
        p = _load(db, payment_id)
        if p is not None and p.owner_transferred_date:
            send_alert(db, p, "owner_paid", f"sent-{_d(p.owner_transferred_date)}", 0)
    except Exception:
        db.rollback()
        logger.exception("owner-transfer alert failed for payment %s", payment_id)


def due_alerts(db: Session, today: Optional[date] = None) -> list[tuple[Payment, Stage]]:
    """(payment, stage) pairs that should go out today and haven't yet."""
    s = get_settings()
    today = today or riyadh_today()
    ahead = max(_days(s.payment_alert_lead_days) or [0])
    behind = max(_days(s.payment_alert_overdue_days) or [0]) + s.payment_alerts_catchup_days
    lo, hi = today - timedelta(days=behind), today + timedelta(days=ahead)
    stmt = (
        select(Payment)
        .join(Payment.contract)
        .where(Contract.tenant_id.is_not(None))
        .where(
            or_(
                and_(Payment.status.in_(UNPAID), Payment.due_date.between(lo, hi)),
                and_(
                    Payment.status == "paid",
                    Payment.owner_transferred_date.is_(None),
                    Payment.owner_transfer_due_date.between(lo, hi),
                ),
            )
        )
        .options(
            selectinload(Payment.splits),
            selectinload(Payment.contract).selectinload(Contract.payments),
            selectinload(Payment.contract).selectinload(Contract.tenant),
            selectinload(Payment.contract)
            .selectinload(Contract.unit)
            .selectinload(Unit.building)
            .selectinload(Building.assignee),
        )
    )
    payments = db.scalars(stmt).all()
    sent = {
        (r.payment_id, r.kind, r.stage)
        for r in db.scalars(
            select(PaymentAlertLog).where(PaymentAlertLog.payment_id.in_([p.id for p in payments] or [0]))
        )
    }
    out = []
    for p in payments:
        st = current_stage(p, today)
        if st and (p.id, st.kind, st.stage) not in sent:
            out.append((p, st))
    return out


def run_alerts(db: Session, today: Optional[date] = None, dry_run: bool = False) -> list[dict]:
    """Send every alert that is due today. Returns one summary row per alert."""
    today = today or riyadh_today()
    summary = []
    for p, st in due_alerts(db, today):
        rcpt = recipients_for(p)
        item = {
            "payment_id": p.id,
            "contract_number": p.contract.contract_number,
            "kind": st.kind,
            "stage": st.stage,
            "due_date": (p.owner_transfer_due_date if st.kind.startswith("owner") else p.due_date).isoformat(),
            "to": rcpt.to,
            "cc": rcpt.cc,
            "responsible_assigned": not rcpt.unassigned,
        }
        if not dry_run:
            try:
                item["sent"] = send_alert(db, p, st.kind, st.stage, st.offset, today)
            except Exception:
                db.rollback()
                logger.exception("payment alert failed for payment %s", p.id)
                item["sent"] = False
        summary.append(item)
    if summary and not dry_run:
        logger.info("payment alerts: %d processed", len(summary))
    return summary


# ── Scheduler ──────────────────────────────────────────────────────────────────


def _job() -> None:
    from api.database import SessionLocal

    with SessionLocal() as db:
        run_alerts(db)


async def alert_loop(interval_seconds: int = 3600, first_delay: int = 90) -> None:
    """Hourly in-process scheduler. The first run waits 90s so the deploy
    preflight container (killed after 60s) never sends anything; after that,
    each run from PAYMENT_ALERTS_HOUR (Riyadh) sends whatever is due. The
    claim log makes repeated runs within a day harmless."""
    await asyncio.sleep(first_delay)
    while True:
        s = get_settings()
        try:
            if s.payment_alerts_enabled and riyadh_now().hour >= s.payment_alerts_hour:
                await asyncio.to_thread(_job)
        except Exception:
            logger.exception("payment alert run failed")
        await asyncio.sleep(interval_seconds)
