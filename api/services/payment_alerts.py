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
from api.email import EmailMessage, _branded_one, last_send_error, send_email
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


# kind → (accent, soft background, Arabic headline, English headline)
_HEAD = {
    "tenant_due": ("#B26B00", "#FFF6E5", "دفعة إيجار مستحقة على المستأجر", "Rent payment due from tenant"),
    "tenant_overdue": ("#B42318", "#FDECEC", "دفعة إيجار متأخرة على المستأجر", "Rent payment overdue"),
    "tenant_paid": ("#1E7B4F", "#E8F5EE", "تم استلام دفعة الإيجار", "Rent payment received"),
    "owner_due": ("#7B1A1A", "#F8EDED", "موعد تحويل حصة المالك", "Owner payout due"),
    "owner_overdue": ("#B42318", "#FDECEC", "تأخر تحويل حصة المالك", "Owner payout overdue"),
    "owner_paid": ("#1E7B4F", "#E8F5EE", "تم تحويل حصة المالك", "Owner payout completed"),
}

_FONT = "Tahoma,'Segoe UI',Arial,sans-serif"
_MUTED = "#6B7280"
_LINE = "#EFE9DE"


def _when(kind: str, offset: int) -> tuple[str, str]:
    """Short 'when' phrase in both languages."""
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


def _bi(ar: str, en: str, *, align: str = "center", ar_size: int = 14, en_size: int = 12, color: str = "#1F2328",
        en_color: str = _MUTED, bold: bool = False) -> str:
    """Arabic line over its English twin."""
    w = "bold" if bold else "normal"
    return (
        f"<div dir='rtl' style='text-align:{align};font-size:{ar_size}px;color:{color};font-weight:{w};line-height:1.5'>{ar}</div>"
        f"<div dir='ltr' style='text-align:{align};font-size:{en_size}px;color:{en_color};line-height:1.4'>{en}</div>"
    )


def _pill(ar: str, en: str, fg: str, bg: str) -> str:
    """Status chip: Arabic over English, so it never forces the table wider."""
    return (
        f"<span style='display:inline-block;background:{bg};color:{fg};border-radius:8px;padding:3px 9px;"
        f"font-weight:bold;line-height:1.35;text-align:center'><span dir='rtl' style='display:block;font-size:12px'>{ar}</span>"
        f"<span dir='ltr' style='display:block;font-size:10.5px;font-weight:normal'>{en}</span></span>"
    )


def _count(n: int) -> str:
    """Big day number with its unit in both languages, for a key-fact tile."""
    ar = "يوم" if n == 1 else "يومان" if n == 2 else "أيام" if 3 <= n <= 10 else "يومًا"
    en = "day" if n == 1 else "days"
    return f"{n} <span style='font-size:13px;font-weight:normal'><span dir='rtl'>{ar}</span> · {en}</span>"


def _tiles(tiles: list[tuple[str, str, str, str]]) -> str:
    """Key facts: (ar label, en label, value html, value colour)."""
    w = int(100 / len(tiles))
    cells = "".join(
        f"<td width='{w}%' style='padding:6px' valign='top'>"
        f"<div style='background:#FAF7F1;border:1px solid #E3DDD2;border-radius:10px;padding:12px 8px;text-align:center'>"
        f"<div dir='rtl' style='font-size:12px;color:{_MUTED}'>{ar}</div>"
        f"<div dir='ltr' style='font-size:11px;color:#9CA3AF;margin-bottom:6px'>{en}</div>"
        f"<div dir='ltr' class='mk-tile-v' style='font-size:19px;font-weight:bold;color:{color};line-height:1.3'>{val}</div>"
        "</div></td>"
        for ar, en, val, color in tiles
    )
    return f"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:4px 0 8px'><tr>{cells}</tr></table>"


def _details(rows: list[tuple[str, str, str]]) -> str:
    """Bilingual form: Arabic label (right) · value · English label (left)."""
    body = "".join(
        "<tr>"
        f"<td dir='rtl' width='28%' style='padding:9px 12px;border-top:1px solid {_LINE};text-align:right;color:{_MUTED};font-size:13px;vertical-align:top'>{ar}</td>"
        f"<td style='padding:9px 8px;border-top:1px solid {_LINE};text-align:center;font-weight:bold;font-size:14px;color:#1F2328;vertical-align:top'>{val}</td>"
        f"<td dir='ltr' width='28%' style='padding:9px 12px;border-top:1px solid {_LINE};text-align:left;color:{_MUTED};font-size:12.5px;vertical-align:top'>{en}</td>"
        "</tr>"
        for ar, val, en in rows
    )
    return (
        "<table role='presentation' dir='rtl' width='100%' cellpadding='0' cellspacing='0' "
        f"style='border:1px solid #E3DDD2;border-radius:10px;border-collapse:separate;margin:8px 0 4px'>"
        f"{body.replace('border-top:1px solid ' + _LINE, 'border-top:0', 3) if body else ''}</table>"
    )


def _section(ar: str, en: str) -> str:
    return (
        "<table role='presentation' dir='rtl' width='100%' cellpadding='0' cellspacing='0' style='margin:22px 0 6px;border-bottom:2px solid #E9DCC6'><tr>"
        f"<td dir='rtl' style='text-align:right;font-weight:bold;color:#7B1A1A;font-size:15px;padding-bottom:6px'>{ar}</td>"
        f"<td dir='ltr' style='text-align:left;font-weight:bold;color:#7B1A1A;font-size:13.5px;padding-bottom:6px'>{en}</td>"
        "</tr></table>"
    )


def _collection_pill(p: Payment, today: date) -> str:
    if p.status == "paid":
        return _pill("مدفوعة", "Paid", "#1E7B4F", "#E8F5EE") + f"<div dir='ltr' style='font-size:11px;color:{_MUTED};margin-top:3px'>{_d(p.paid_date)}</div>"
    if p.due_date < today:
        late = (today - p.due_date).days
        return _pill("متأخرة", "Overdue", "#B42318", "#FDECEC") + f"<div dir='rtl' style='font-size:11px;color:#B42318;margin-top:3px'>{_ar_days(late)}</div>"
    if p.due_date == today:
        return _pill("اليوم", "Today", "#B26B00", "#FFF6E5")
    return _pill("قادمة", "Upcoming", "#4B5563", "#F3F4F6")


def _owner_cell(p: Payment, today: date) -> str:
    if p.owner_transferred_date:
        return _pill("حُوِّلت", "Sent", "#1E7B4F", "#E8F5EE") + f"<div dir='ltr' style='font-size:11px;color:{_MUTED};margin-top:3px'>{_d(p.owner_transferred_date)}</div>"
    if p.owner_transfer_due_date:
        late = p.owner_transfer_due_date < today
        return (
            _pill("متأخر" if late else "مستحق", "Overdue" if late else "Due", "#B42318" if late else "#B26B00", "#FDECEC" if late else "#FFF6E5")
            + f"<div dir='ltr' style='font-size:11px;color:{_MUTED};margin-top:3px'>{_d(p.owner_transfer_due_date)}</div>"
        )
    n = get_settings().owner_transfer_days
    return f"<div dir='rtl' style='font-size:11.5px;color:{_MUTED}'>بعد السداد بـ{_ar_days(n)}</div><div dir='ltr' style='font-size:11px;color:#9CA3AF'>{_en_days(n)} after payment</div>"


def _timeline(payments: list[Payment], current_id: int, today: date) -> str:
    th = (
        "padding:8px 6px;background:#F5EFE4;color:#7B1A1A;text-align:center;vertical-align:bottom"
    )
    heads = [("#", "#"), ("الاستحقاق", "Due date"), ("المبلغ", "Amount"), ("التحصيل", "Collection"), ("تحويل المالك", "Owner payout")]
    head = "".join(
        f"<th style='{th}'><div dir='rtl' style='font-size:12.5px'>{a}</div><div dir='ltr' style='font-size:10.5px;color:#9A6B6B;font-weight:normal'>{e}</div></th>"
        for a, e in heads
    )
    body = ""
    for i, p in enumerate(payments, 1):
        cur = p.id == current_id
        bg = "background:#FFF6E5;" if cur else ""
        td = f"padding:9px 6px;border-top:1px solid {_LINE};text-align:center;font-size:13px;vertical-align:middle;{bg}"
        num = (
            f"<span style='display:inline-block;min-width:22px;height:22px;line-height:22px;border-radius:11px;"
            f"background:{'#7B1A1A' if cur else '#E3DDD2'};color:{'#fff' if cur else '#4B5563'};font-weight:bold;font-size:12px'>{i}</span>"
        )
        body += (
            f"<tr><td style='{td}'>{num}</td>"
            f"<td style='{td}' dir='ltr'>{_d(p.due_date)}</td>"
            f"<td style='{td}' dir='ltr'>{_sar(p.amount)}</td>"
            f"<td style='{td}'>{_collection_pill(p, today)}</td>"
            f"<td style='{td}'>{_owner_cell(p, today)}</td></tr>"
        )
    return (
        "<table role='presentation' dir='rtl' width='100%' cellpadding='0' cellspacing='0' "
        f"style='border:1px solid #E3DDD2;border-radius:10px;border-collapse:separate;overflow:hidden'>"
        f"<tr>{head}</tr>{body}</table>"
    )


def _balance(payments: list[Payment], today: date) -> str:
    paid = [p for p in payments if p.status == "paid"]
    late = [p for p in payments if p.status != "paid" and p.due_date < today]
    coming = [p for p in payments if p.status != "paid" and p.due_date >= today]

    def cell(ar, en, items, color):
        total = sum(float(p.amount or 0) for p in items)
        return (
            f"<td width='33%' style='padding:10px 6px;text-align:center;border-left:1px solid {_LINE}'>"
            f"<div dir='rtl' style='font-size:12px;color:{_MUTED}'>{ar} <span dir='ltr'>({len(items)})</span></div>"
            f"<div dir='ltr' style='font-size:11px;color:#9CA3AF'>{en}</div>"
            f"<div dir='ltr' style='font-size:16px;font-weight:bold;color:{color};margin-top:3px'>{_sar(total)}</div></td>"
        )

    return (
        "<table role='presentation' dir='rtl' width='100%' cellpadding='0' cellspacing='0' "
        "style='border:1px solid #E3DDD2;border-radius:10px;border-collapse:separate;margin:10px 0 0;background:#FFFFFF'><tr>"
        + cell("المحصَّل", "Collected", paid, "#1E7B4F")
        + cell("المتأخر", "Overdue", late, "#B42318" if late else "#1F2328")
        + cell("القادم", "Upcoming", coming, "#1F2328")
        + "</tr></table>"
    )


def _button_bi(url: str) -> str:
    return (
        "<table role='presentation' align='center' cellpadding='0' cellspacing='0' style='margin:26px auto 6px'><tr>"
        "<td class='mk-maroon' bgcolor='#7B1A1A' style='border-radius:10px;background:#7B1A1A;background-image:linear-gradient(#7B1A1A,#7B1A1A)'>"
        f"<a href='{url}' style='display:inline-block;color:#FFFFFF;text-decoration:none;padding:13px 34px;border-radius:10px;"
        "font-weight:bold;font-size:15px;text-align:center'><span dir='rtl'>فتح صفحة الدفعات</span> &nbsp;·&nbsp; <span dir='ltr'>Open payments</span></a>"
        "</td></tr></table>"
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
    accent, soft, head_ar, head_en = _HEAD[kind]
    when_ar, when_en = _when(kind, offset)
    owner_side = kind.startswith("owner")
    base = get_settings().web_base_url.rstrip("/")
    url = f"{base}/ar/payments"

    def unit_label(name: Optional[str]) -> str:
        name = (name or "").strip()
        num = (unit.number or "").strip()
        return num if not name or name == num else f"{name} ({num})"

    prop_ar = escape(f"{building.name_ar or building.name} — {unit_label(unit.name_ar or unit.name)}")
    prop_en = escape(f"{building.name_en or building.name} — {unit_label(unit.name_en or unit.name)}")
    tenant_name = escape((tenant.name_ar or tenant.name) if tenant else "—")
    tenant_phone = escape(tenant.phone or "") if tenant else ""
    owner_name = escape((owner.name_ar or owner.name) if owner else "—")
    iban = (owner.iban or "") if owner else ""
    bank = escape(f"{owner.bank_name or ''} ···{iban[-4:]}".strip() if iban else ((owner.bank_name or "—") if owner else "—"))
    ejar = escape(contract.ejar_contract_number or "—")
    responsible = escape(rcpt.responsible_name or "—")

    # ── Banner ──
    banner = (
        f"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:{soft};border-radius:12px;"
        f"border:1px solid {accent}33;margin:0 0 14px'><tr><td style='padding:18px 16px;text-align:center'>"
        f"<div dir='rtl' style='font-size:20px;font-weight:bold;color:{accent};line-height:1.4'>{head_ar} {when_ar}</div>"
        f"<div dir='ltr' style='font-size:15px;color:{accent};opacity:.85;margin-top:2px'>{head_en} {when_en}</div>"
        f"<div style='margin-top:10px;font-size:13px;color:#4B5563'><span dir='rtl'>عقد</span> <strong dir='ltr'>{escape(contract.contract_number)}</strong>"
        f" &nbsp;·&nbsp; <span dir='rtl'>الدفعة {idx} من {len(payments)}</span> &nbsp;·&nbsp; <span dir='ltr'>Instalment {idx} of {len(payments)}</span></div>"
        "</td></tr></table>"
    )

    # ── Key facts ──
    if kind in ("tenant_due", "tenant_overdue"):
        n = abs(offset)
        third = (
            ("المتبقي", "Time left", _count(n), accent)
            if offset < 0 else
            (("الاستحقاق", "Due", "<span dir='rtl'>اليوم</span> · Today", accent) if offset == 0 else
             ("التأخير", "Overdue by", _count(n), accent))
        )
        tiles = [("مبلغ الدفعة", "Amount (SAR)", _sar(payment.amount), "#1F2328"),
                 ("تاريخ الاستحقاق", "Due date", _d(payment.due_date), "#1F2328"), third]
    elif kind == "tenant_paid":
        tiles = [("المبلغ المحصَّل", "Collected (SAR)", _sar(payment.amount), "#1E7B4F"),
                 ("صافي حصة المالك", "Owner share (SAR)", _sar(share), "#1F2328"),
                 ("موعد التحويل للمالك", "Owner payout by", _d(payment.owner_transfer_due_date), "#7B1A1A")]
    else:
        n = abs(offset)
        third_val = (_d(payment.owner_transferred_date) if kind == "owner_paid" else
                     ("<span dir='rtl'>اليوم</span> · Today" if offset == 0 else
                      _count(n)))
        third_lbl = (("تاريخ التحويل", "Sent on") if kind == "owner_paid" else
                     (("المتبقي", "Time left") if offset < 0 else (("الموعد", "Due") if offset == 0 else ("التأخير", "Overdue by"))))
        tiles = [("صافي حصة المالك", "Owner share (SAR)", _sar(share), "#1F2328"),
                 ("موعد التحويل", "Payout due", _d(payment.owner_transfer_due_date), "#1F2328"),
                 (third_lbl[0], third_lbl[1], third_val, accent)]

    # ── Action ──
    action_ar = {
        "tenant_due": "يرجى التواصل مع المستأجر لتذكيره بموعد السداد.",
        "tenant_overdue": "يرجى متابعة المستأجر لتحصيل الدفعة المتأخرة وتسجيلها في النظام فور استلامها.",
        "tenant_paid": f"يجب تحويل حصة المالك قبل <span dir='ltr'>{_d(payment.owner_transfer_due_date)}</span>.",
        "owner_due": "يرجى تحويل حصة المالك إلى حسابه وتسجيل التحويل في صفحة الدفعات.",
        "owner_overdue": "تجاوز تحويل حصة المالك موعده — يرجى التحويل فورًا وتسجيله في النظام.",
        "owner_paid": "اكتملت دورة هذه الدفعة. لا يلزم أي إجراء.",
    }[kind]
    action_en = {
        "tenant_due": "Please contact the tenant to remind them of the due date.",
        "tenant_overdue": "Please follow up with the tenant and record the payment as soon as it is received.",
        "tenant_paid": f"The owner's share must be transferred by {_d(payment.owner_transfer_due_date)}.",
        "owner_due": "Please transfer the owner's share and record it on the Payments page.",
        "owner_overdue": "The owner payout is past due — please transfer it now and record it.",
        "owner_paid": "This instalment's cycle is complete. No action needed.",
    }[kind]
    action = (
        f"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:6px 0 4px'><tr>"
        f"<td style='border-right:4px solid {accent};background:#FAF7F1;border-radius:8px;padding:12px 14px'>"
        f"<div dir='rtl' style='text-align:right;font-size:14.5px;font-weight:bold;color:#1F2328'>{action_ar}</div>"
        f"<div dir='ltr' style='text-align:left;font-size:13px;color:{_MUTED};margin-top:4px'>{action_en}</div>"
        "</td></tr></table>"
    )

    warn = ""
    if rcpt.unassigned:
        warn = (
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:0 0 12px'><tr>"
            "<td style='background:#FDECEC;color:#B42318;border-radius:8px;padding:10px 14px;font-size:13px'>"
            "<div dir='rtl' style='text-align:right'>لا يوجد موظف مسؤول عن هذا العقار — يرجى تعيين موظف من صفحة العقار.</div>"
            "<div dir='ltr' style='text-align:left'>No employee is responsible for this property — please assign one on the property page.</div>"
            "</td></tr></table>"
        )

    # ── Details ──
    rows = [
        ("رقم العقد", f"<span dir='ltr'>{escape(contract.contract_number)}</span>", "Contract no."),
        ("رقم عقد إيجار", f"<span dir='ltr'>{ejar}</span>", "Ejar contract no."),
        ("العقار / الوحدة", f"<div dir='rtl'>{prop_ar}</div>" + (f"<div dir='ltr' style='font-weight:normal;color:{_MUTED};font-size:12.5px'>{prop_en}</div>" if prop_en != prop_ar else ""), "Property / unit"),
        ("المستأجر", f"<div dir='rtl'>{tenant_name}</div>" + (f"<div dir='ltr' style='font-weight:normal;color:{_MUTED};font-size:12.5px'>{tenant_phone}</div>" if tenant_phone else ""), "Tenant"),
        ("المالك", f"<span dir='rtl'>{owner_name}</span>", "Owner"),
    ]
    if payment.status == "paid":
        rows.append(("تاريخ السداد", f"<span dir='ltr'>{_d(payment.paid_date)}</span>", "Paid on"))
    if owner_side or kind == "tenant_paid":
        rows += [
            ("مبلغ الدفعة", f"<span dir='ltr'>{_sar(payment.amount)}</span>", "Instalment amount"),
            ("أتعاب الإدارة", f"<span dir='ltr'>− {_sar(split.management_fee)}</span>", f"Management fee ({split.management_pct:g}%)"),
        ]
        if split.agent_fee:
            rows.append(("عمولة الوسيط", f"<span dir='ltr'>− {_sar(split.agent_fee)}</span>", f"Agent fee ({split.agent_pct:g}%)"))
        if split.ejar_fee:
            rows.append(("رسوم إيجار", f"<span dir='ltr'>− {_sar(split.ejar_fee)}</span>", "Ejar fee"))
        rows += [
            ("صافي حصة المالك", f"<span dir='ltr' style='color:#1E7B4F'>{_sar(share)} SAR</span>", "Net owner share"),
            ("حساب المالك", f"<span dir='rtl'>{bank}</span>", "Owner account"),
        ]
    if kind == "owner_paid":
        rows.append(("مرجع الحوالة", f"<span dir='ltr'>{escape(payment.owner_transfer_reference or '—')}</span>", "Transfer reference"))
    rows.append(("الموظف المسؤول", f"<span dir='rtl'>{responsible}</span>", "Responsible employee"))

    note = (
        f"<div style='margin-top:14px;font-size:11.5px;color:#9CA3AF;text-align:center;line-height:1.7'>"
        "<div dir='rtl'>وصلتك هذه الرسالة لأنك الموظف المسؤول عن العقار، مع نسخة للرئيس التنفيذي.</div>"
        "<div dir='ltr'>You receive this as the employee responsible for the property; the CEO is copied.</div></div>"
    )

    inner = (
        banner + warn + _tiles(tiles) + action
        + _section("تفاصيل الدفعة", "Payment details") + _details(rows)
        + _section("الجدول الزمني لدفعات العقد", "Contract payment timeline")
        + _timeline(payments, payment.id, today)
        + _balance(payments, today)
        + _button_bi(url) + note
    )
    html = _branded_one(inner, preheader=f"{head_ar} {when_ar} · {head_en} {when_en} — {contract.contract_number} — SAR {_sar(payment.amount)}")

    def plain(r):
        import re

        return "\n".join(f"- {a} / {e}: {re.sub('<[^>]+>', ' ', v).strip()}" for a, v, e in r)

    timeline = "\n".join(
        f"  {i}. {_d(p.due_date)}  SAR {_sar(p.amount)}  "
        f"{'paid ' + _d(p.paid_date) if p.status == 'paid' else ('OVERDUE' if p.due_date < today else 'upcoming')}"
        f"  owner: {'sent ' + _d(p.owner_transferred_date) if p.owner_transferred_date else ('due ' + _d(p.owner_transfer_due_date) if p.owner_transfer_due_date else '—')}"
        for i, p in enumerate(payments, 1)
    )
    import re as _re

    text = (
        f"{head_ar} {when_ar}\n{head_en} {when_en}\n\n"
        f"{_re.sub('<[^>]+>', '', action_ar)}\n{action_en}\n\n{plain(rows)}\n\n"
        f"الجدول الزمني / Payment timeline:\n{timeline}\n\n{url}\n"
    )
    return EmailMessage(
        to=rcpt.to or "",
        cc=rcpt.cc or None,
        subject=_subject(kind, offset, contract.contract_number),
        text_body=text,
        html_body=html,
        category="payment_alert",
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
