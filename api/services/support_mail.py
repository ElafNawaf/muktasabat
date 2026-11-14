"""Support-desk e-mails (رسائل الدعم الفني) — one bilingual layout for every
ticket notification, for both the customer and the technician.

Every message carries the full picture so nobody has to open the portal to
know where things stand:

* a banner saying what happened (Arabic + English),
* status / priority / category chips,
* "what changed" (from → to) when a ticket was updated,
* the message itself in full (not an excerpt) with its attachment,
* the resolution summary when a ticket is resolved,
* a details card (reference, requester, assignee, dates, service-level targets),
* the activity log (سجل التذكرة) — public events for the customer, everything
  (incl. internal notes) for support staff,
* one bilingual button to open the ticket.

Labels are bilingual side by side; user-written text is shown once with
``dir="auto"`` so Arabic and English content both read correctly.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from html import escape
from typing import Iterable, Optional

from api.email import EmailMessage, _branded_one, send_email

MUTED = "#6B7280"
LINE = "#EFE9DE"
MAROON = "#7B1A1A"

STATUS = {
    "open": ("مفتوحة", "Open", "#1D4ED8", "#E8EFFD"),
    "in_progress": ("قيد المعالجة", "In progress", MAROON, "#F6E9E9"),
    "waiting_user": ("بانتظار رد العميل", "Waiting for customer", "#B26B00", "#FFF6E5"),
    "resolved": ("تم الحل", "Resolved", "#1E7B4F", "#E8F5EE"),
    "closed": ("مغلقة", "Closed", "#4B5563", "#F3F4F6"),
}
# What the requester sees for "waiting_user".
STATUS_FOR_REQUESTER = {"waiting_user": ("بانتظار ردك", "Waiting for your reply")}
PRIORITY = {
    "low": ("منخفضة", "Low", "#4B5563", "#F3F4F6"),
    "normal": ("عادية", "Normal", "#1D4ED8", "#E8EFFD"),
    "high": ("عالية", "High", "#B26B00", "#FFF6E5"),
    "urgent": ("عاجلة", "Urgent", "#B42318", "#FDECEC"),
}
CATEGORY = {
    "technical": ("مشكلة تقنية", "Technical issue"),
    "account": ("الحساب والدخول", "Account & sign-in"),
    "data": ("البيانات", "Data"),
    "billing": ("الفواتير والمدفوعات", "Billing & payments"),
    "feature": ("طلب ميزة", "Feature request"),
    "other": ("أخرى", "Other"),
}
FIELD = {
    "status": ("الحالة", "Status"),
    "priority": ("الأولوية", "Priority"),
    "category": ("التصنيف", "Category"),
    "assignee": ("المسؤول", "Assignee"),
}

# Banner per notification kind: (accent, soft bg, Arabic, English)
HEAD = {
    "created_staff": (MAROON, "#F6E9E9", "تذكرة دعم جديدة", "New support ticket"),
    "created_requester": ("#1D4ED8", "#E8EFFD", "استلمنا طلبك", "We received your request"),
    "assigned": (MAROON, "#F6E9E9", "أُسندت إليك تذكرة دعم", "A ticket was assigned to you"),
    "reply_requester": ("#1D4ED8", "#E8EFFD", "رد جديد من فريق الدعم", "New reply from support"),
    "reply_staff": ("#B26B00", "#FFF6E5", "رد جديد من العميل", "The customer replied"),
    "note_staff": ("#B26B00", "#FFF6E5", "ملاحظة داخلية جديدة", "New internal note"),
    "updated": ("#1D4ED8", "#E8EFFD", "تم تحديث التذكرة", "Ticket updated"),
    "resolved": ("#1E7B4F", "#E8F5EE", "تم حل تذكرتك", "Your ticket is resolved"),
    "closed_staff": ("#4B5563", "#F3F4F6", "أغلق العميل التذكرة", "The customer closed the ticket"),
    "reopened_staff": ("#B42318", "#FDECEC", "أعاد العميل فتح التذكرة", "The customer reopened the ticket"),
    "rated_staff": ("#1E7B4F", "#E8F5EE", "تقييم جديد للخدمة", "New service rating"),
}

RIYADH = timedelta(hours=3)


def ref(ticket_id: int) -> str:
    return f"TCK-{ticket_id:05d}"


def _t(dt: Optional[datetime]) -> str:
    """Riyadh wall time, e.g. 2026-11-14 09:30."""
    if dt is None:
        return "—"
    if dt.tzinfo is not None:
        dt = dt.replace(tzinfo=None) - (dt.utcoffset() or timedelta(0))
    return (dt + RIYADH).strftime("%Y-%m-%d %H:%M")


def _name(u) -> str:
    if u is None:
        return "—"
    return (getattr(u, "full_name", None) or u.username or "—").strip()


def _pill(ar: str, en: str, fg: str, bg: str) -> str:
    return (
        f"<span style='display:inline-block;background:{bg};color:{fg};border-radius:8px;padding:4px 10px;margin:2px;"
        f"font-weight:bold;line-height:1.35;text-align:center;vertical-align:middle'>"
        f"<span dir='rtl' style='display:block;font-size:12.5px'>{ar}</span>"
        f"<span dir='ltr' style='display:block;font-size:10.5px;font-weight:normal'>{en}</span></span>"
    )


def status_labels(status: str, for_requester: bool = False) -> tuple[str, str]:
    ar, en, *_ = STATUS.get(status, (status, status, MUTED, "#F3F4F6"))
    if for_requester and status in STATUS_FOR_REQUESTER:
        ar, en = STATUS_FOR_REQUESTER[status]
    return ar, en


def _status_pill(status: str, for_requester: bool) -> str:
    _, _, fg, bg = STATUS.get(status, ("", "", MUTED, "#F3F4F6"))
    ar, en = status_labels(status, for_requester)
    return _pill(ar, en, fg, bg)


def _priority_pill(p: str) -> str:
    ar, en, fg, bg = PRIORITY.get(p, (p, p, MUTED, "#F3F4F6"))
    return _pill(ar, en, fg, bg)


def _category_pill(c: str) -> str:
    ar, en = CATEGORY.get(c, (c, c))
    return _pill(ar, en, "#374151", "#F3F4F6")


def _section(ar: str, en: str) -> str:
    return (
        "<table role='presentation' dir='rtl' width='100%' cellpadding='0' cellspacing='0' "
        "style='margin:22px 0 8px;border-bottom:2px solid #E9DCC6'><tr>"
        f"<td dir='rtl' style='text-align:right;font-weight:bold;color:{MAROON};font-size:15px;padding-bottom:6px'>{ar}</td>"
        f"<td dir='ltr' style='text-align:left;font-weight:bold;color:{MAROON};font-size:13.5px;padding-bottom:6px'>{en}</td>"
        "</tr></table>"
    )


def _details(rows: list[tuple[str, str, str]]) -> str:
    """Arabic label · value · English label — readable from both directions."""
    out = []
    for i, (ar, val, en) in enumerate(rows):
        top = "0" if i == 0 else f"1px solid {LINE}"
        out.append(
            "<tr>"
            f"<td dir='rtl' width='27%' style='padding:9px 10px;border-top:{top};text-align:right;color:{MUTED};font-size:12.5px;vertical-align:top'>{ar}</td>"
            f"<td style='padding:9px 6px;border-top:{top};text-align:center;font-weight:bold;font-size:13.5px;color:#1F2328;vertical-align:top;word-break:break-word'>{val}</td>"
            f"<td dir='ltr' width='27%' style='padding:9px 10px;border-top:{top};text-align:left;color:{MUTED};font-size:12px;vertical-align:top'>{en}</td>"
            "</tr>"
        )
    return (
        "<table role='presentation' dir='rtl' width='100%' cellpadding='0' cellspacing='0' "
        "style='border:1px solid #E3DDD2;border-radius:10px;border-collapse:separate;margin:6px 0'>"
        + "".join(out) + "</table>"
    )


def _text(body: str) -> str:
    """User-written text: escaped, one block per line, each line taking its own
    direction from its content (so mixed Arabic / English reads correctly)."""
    lines = (body or "").replace("\r\n", "\n").split("\n")
    if not (body or "").strip():
        return ""
    return "".join(f"<div dir='auto'>{escape(ln) or '&nbsp;'}</div>" for ln in lines)


def _message_card(author: str, is_staff: bool, when: datetime, body: str, attachment: Optional[str], internal: bool = False) -> str:
    if internal:
        badge = _pill("ملاحظة داخلية", "Internal note", "#B26B00", "#FFF6E5")
        bg, border = "#FFFBF2", "#F2D9A6"
    elif is_staff:
        badge = _pill("فريق الدعم", "Support team", MAROON, "#F6E9E9")
        bg, border = "#FBF7F7", "#EAD3D3"
    else:
        badge = _pill("العميل", "Customer", "#1D4ED8", "#E8EFFD")
        bg, border = "#F7F9FD", "#D6E0F5"
    text_html = _text(body) or "<span style='color:#9CA3AF'>—</span>"
    att = (
        f"<div style='margin-top:10px;font-size:12.5px;color:{MUTED}'>📎 <span dir='auto'>{escape(attachment)}</span>"
        " <span style='color:#9CA3AF'>· <span dir='rtl'>مرفق</span> / Attachment</span></div>"
        if attachment else ""
    )
    return (
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:6px 0'><tr>"
        f"<td style='background:{bg};border:1px solid {border};border-radius:10px;padding:12px 14px'>"
        f"<div style='margin-bottom:8px'>{badge} <strong dir='auto' style='font-size:14px;color:#1F2328;vertical-align:middle'>{escape(author)}</strong>"
        f" <span dir='ltr' style='font-size:12px;color:{MUTED};vertical-align:middle'>· {_t(when)}</span></div>"
        f"<div dir='auto' style='font-size:14.5px;line-height:1.75;color:#1F2328;word-break:break-word'>{text_html}</div>"
        f"{att}</td></tr></table>"
    )


def _banner(kind: str, ticket, extra_ar: str = "", extra_en: str = "") -> str:
    accent, soft, ar, en = HEAD[kind]
    return (
        f"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:{soft};"
        f"border-radius:12px;border:1px solid {accent}33;margin:0 0 12px'><tr><td style='padding:18px 16px;text-align:center'>"
        f"<div dir='rtl' style='font-size:20px;font-weight:bold;color:{accent};line-height:1.4'>{ar}</div>"
        f"<div dir='ltr' style='font-size:15px;color:{accent};opacity:.9;margin-top:2px'>{en}</div>"
        f"<div style='margin-top:10px;font-size:13px;color:#374151'><strong dir='ltr'>{ref(ticket.id)}</strong>"
        f" &nbsp;·&nbsp; <span dir='auto'>{escape(ticket.subject)}</span></div>"
        + (f"<div dir='rtl' style='margin-top:6px;font-size:13px;color:#374151'>{extra_ar}</div>" if extra_ar else "")
        + (f"<div dir='ltr' style='font-size:12.5px;color:{MUTED}'>{extra_en}</div>" if extra_en else "")
        + "</td></tr></table>"
    )


def _button(url: str, ar: str = "فتح التذكرة", en: str = "Open ticket") -> str:
    return (
        "<table role='presentation' align='center' cellpadding='0' cellspacing='0' style='margin:24px auto 6px'><tr>"
        f"<td class='mk-maroon' bgcolor='{MAROON}' style='border-radius:10px;background:{MAROON};background-image:linear-gradient({MAROON},{MAROON})'>"
        f"<a href='{url}' style='display:inline-block;color:#FFFFFF;text-decoration:none;padding:13px 30px;border-radius:10px;"
        f"font-weight:bold;font-size:15px;text-align:center'><span dir='rtl'>{ar}</span> &nbsp;·&nbsp; <span dir='ltr'>{en}</span></a>"
        "</td></tr></table>"
    )


def _stars(url: str) -> str:
    """Five tappable stars — each opens the ticket with the rating pre-selected."""
    cells = "".join(
        f"<td style='padding:0 3px'><a href='{url}?rate={n}' style='text-decoration:none;font-size:26px;color:#E0A100'>★</a>"
        f"<div style='font-size:11px;color:{MUTED};text-align:center'>{n}</div></td>"
        for n in range(1, 6)
    )
    return (
        "<div style='text-align:center;margin:18px 0 4px'>"
        "<div dir='rtl' style='font-size:14px;font-weight:bold;color:#1F2328'>كيف تقيّم تجربتك مع الدعم؟</div>"
        f"<div dir='ltr' style='font-size:12.5px;color:{MUTED};margin-bottom:6px'>How was your support experience?</div>"
        f"<table role='presentation' align='center' dir='ltr' cellpadding='0' cellspacing='0' style='margin:0 auto'><tr>{cells}</tr></table></div>"
    )


def _sla(ticket, now: datetime) -> tuple[str, str, str]:
    """(Arabic, English, colour) for the first-response target."""
    if ticket.first_response_at:
        met = ticket.response_due_at is None or ticket.first_response_at <= ticket.response_due_at
        return (("تم الرد ضمن الوقت المستهدف", "Responded within target", "#1E7B4F") if met
                else ("تم الرد بعد الوقت المستهدف", "Responded after target", "#B26B00"))
    if ticket.status not in ("open", "in_progress", "waiting_user") or ticket.response_due_at is None:
        return ("—", "—", MUTED)
    if now > ticket.response_due_at:
        return ("تجاوز وقت الرد المستهدف", "Response target missed", "#B42318")
    return ("ضمن الوقت المستهدف", "On track", "#1E7B4F")


# ── Activity log ──────────────────────────────────────────────────────────────


def event_text(ev, for_requester: bool) -> tuple[str, str]:
    """One log line in both languages."""
    who = _name(ev.actor) if ev.actor else ""
    f, t = ev.from_value or "", ev.to_value or ""

    def st(v):
        return status_labels(v, for_requester)

    k = ev.kind
    if k == "created":
        return f"أنشأ {who} التذكرة", f"{who} opened the ticket"
    if k == "status":
        (fa, fe), (ta, te) = st(f), st(t)
        return f"غيّر {who} الحالة من «{fa}» إلى «{ta}»", f"{who} changed status from “{fe}” to “{te}”"
    if k == "priority":
        fa, fe, *_ = PRIORITY.get(f, (f, f))
        ta, te, *_ = PRIORITY.get(t, (t, t))
        return f"غيّر {who} الأولوية من «{fa}» إلى «{ta}»", f"{who} changed priority from “{fe}” to “{te}”"
    if k == "category":
        fa, fe = CATEGORY.get(f, (f, f))
        ta, te = CATEGORY.get(t, (t, t))
        return f"غيّر {who} التصنيف من «{fa}» إلى «{ta}»", f"{who} changed category from “{fe}” to “{te}”"
    if k == "assigned":
        if f:
            return f"أعاد {who} إسناد التذكرة من {f} إلى {t}", f"{who} reassigned the ticket from {f} to {t}"
        return f"أسند {who} التذكرة إلى {t}", f"{who} assigned the ticket to {t}"
    if k == "unassigned":
        return f"ألغى {who} إسناد التذكرة إلى {f}", f"{who} unassigned {f}"
    if k == "reply":
        return f"أضاف {who} ردًا", f"{who} replied"
    if k == "note":
        return f"أضاف {who} ملاحظة داخلية", f"{who} added an internal note"
    if k == "resolved":
        return f"وضع {who} التذكرة كمحلولة", f"{who} marked the ticket resolved"
    if k == "closed":
        return f"أغلق {who} التذكرة", f"{who} closed the ticket"
    if k == "reopened":
        return f"أعاد {who} فتح التذكرة", f"{who} reopened the ticket"
    if k == "rated":
        return f"قيّم {who} الخدمة بـ {t} من 5", f"{who} rated the service {t}/5"
    return k, k


def _log(events: Iterable, for_requester: bool, limit: int = 10) -> str:
    evs = [e for e in events if e.public or not for_requester][-limit:]
    if not evs:
        return ""
    rows = []
    for i, e in enumerate(reversed(evs)):
        ar, en = event_text(e, for_requester)
        top = "0" if i == 0 else f"1px solid {LINE}"
        lock = " 🔒" if not e.public else ""
        rows.append(
            "<tr>"
            f"<td dir='ltr' width='86' style='padding:8px 10px;border-top:{top};font-size:11.5px;color:{MUTED};white-space:nowrap;vertical-align:top'>{_t(e.created_at)}</td>"
            f"<td style='padding:8px 10px;border-top:{top};vertical-align:top'>"
            f"<div dir='rtl' style='text-align:right;font-size:13px;color:#1F2328'>{escape(ar)}{lock}</div>"
            f"<div dir='ltr' style='text-align:left;font-size:12px;color:{MUTED}'>{escape(en)}</div></td>"
            "</tr>"
        )
    return (
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' "
        "style='border:1px solid #E3DDD2;border-radius:10px;border-collapse:separate;margin:6px 0'>"
        + "".join(rows) + "</table>"
    )


# ── Builder ───────────────────────────────────────────────────────────────────


@dataclass
class Change:
    field: str  # status | priority | category | assignee
    old: Optional[str]
    new: Optional[str]


@dataclass
class TicketMail:
    kind: str
    to: str
    url: str
    for_requester: bool
    message: object | None = None  # SupportTicketMessage to show in full
    changes: list[Change] = field(default_factory=list)
    actor_name: str = ""
    show_description: bool = False


def _change_value(fld: str, v: Optional[str], for_requester: bool) -> str:
    if not v:
        return "<span style='color:#9CA3AF'>—</span>"
    if fld == "status":
        return _status_pill(v, for_requester)
    if fld == "priority":
        return _priority_pill(v)
    if fld == "category":
        return _category_pill(v)
    return f"<span dir='auto'>{escape(v)}</span>"


def _changes(changes: list[Change], for_requester: bool) -> str:
    rows = []
    for i, c in enumerate(changes):
        ar, en = FIELD[c.field]
        top = "0" if i == 0 else f"1px solid {LINE}"
        rows.append(
            "<tr>"
            f"<td dir='rtl' width='24%' style='padding:9px 10px;border-top:{top};text-align:right;color:{MUTED};font-size:12.5px;vertical-align:middle'>{ar}"
            f"<div dir='ltr' style='font-size:11px'>{en}</div></td>"
            f"<td style='padding:9px 6px;border-top:{top};text-align:center;vertical-align:middle;opacity:.75'>{_change_value(c.field, c.old, for_requester)}</td>"
            f"<td style='padding:9px 2px;border-top:{top};text-align:center;color:{MUTED};font-size:16px;vertical-align:middle'>⇠</td>"
            f"<td style='padding:9px 6px;border-top:{top};text-align:center;vertical-align:middle'>{_change_value(c.field, c.new, for_requester)}</td>"
            "</tr>"
        )
    head = (
        f"<tr><td></td><td dir='rtl' style='text-align:center;font-size:11px;color:{MUTED};padding:6px 0 0'>السابق · Before</td>"
        f"<td></td><td style='text-align:center;font-size:11px;color:{MUTED};padding:6px 0 0'>الجديد · Now</td></tr>"
    )
    return (
        "<table role='presentation' dir='rtl' width='100%' cellpadding='0' cellspacing='0' "
        "style='border:1px solid #E3DDD2;border-radius:10px;border-collapse:separate;margin:6px 0'>"
        + head + "".join(rows) + "</table>"
    )


def build(ticket, mail: TicketMail, now: datetime) -> EmailMessage:
    fr = mail.for_requester
    accent, _, head_ar, head_en = HEAD[mail.kind]
    extra_ar = extra_en = ""
    if mail.actor_name and mail.kind in ("updated", "assigned", "reply_requester", "reply_staff", "note_staff"):
        a = escape(mail.actor_name)
        extra_ar, extra_en = f"بواسطة: <strong dir='auto'>{a}</strong>", f"By: <strong dir='auto'>{a}</strong>"

    chips = (
        "<div style='text-align:center;margin:0 0 6px'>"
        + _status_pill(ticket.status, fr) + _priority_pill(ticket.priority) + _category_pill(ticket.category)
        + "</div>"
    )
    parts = [_banner(mail.kind, ticket, extra_ar, extra_en), chips]

    if mail.changes:
        parts += [_section("ما الذي تغيّر", "What changed"), _changes(mail.changes, fr)]

    if mail.kind == "resolved" and ticket.resolution:
        parts += [_section("ملخص الحل", "Resolution"),
                  "<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>"
                  "<td style='background:#F2FAF5;border:1px solid #BFE3CD;border-radius:10px;padding:12px 14px'>"
                  f"<div dir='auto' style='font-size:14.5px;line-height:1.75;color:#1F2328'>{_text(ticket.resolution)}</div>"
                  "</td></tr></table>"]

    if mail.kind == "rated_staff" and ticket.rating:
        stars = "★" * ticket.rating + "☆" * (5 - ticket.rating)
        comment = (f"<div dir='auto' style='margin-top:8px;font-size:14px;line-height:1.7;color:#1F2328'>{_text(ticket.rating_comment)}</div>"
                   if ticket.rating_comment else "")
        parts += [_section("تقييم العميل", "Customer rating"),
                  "<div style='text-align:center;background:#FFFBEB;border:1px solid #F5E1A4;border-radius:10px;padding:14px'>"
                  f"<div dir='ltr' style='font-size:28px;color:#E0A100;letter-spacing:2px'>{stars}</div>"
                  f"<div dir='ltr' style='font-size:13px;color:{MUTED}'>{ticket.rating} / 5</div>{comment}</div>"]

    m = mail.message
    if m is not None:
        title = ("الملاحظة", "Note") if m.internal else ("نص الرسالة", "Message")
        parts += [_section(*title),
                  _message_card(_name(m.author), m.is_staff, m.created_at, m.body, m.attachment_name, m.internal)]

    if mail.show_description:
        first = next((x for x in ticket.messages if not x.internal), None)
        if first is not None and first is not m:
            parts += [_section("وصف المشكلة", "Description"),
                      _message_card(_name(first.author), first.is_staff, first.created_at, first.body, first.attachment_name)]

    # Recent conversation for context (customer ↔ support), excluding the message above.
    if m is not None and not m.internal:
        convo = [x for x in ticket.messages if not x.internal and x is not m][-2:]
        if convo:
            parts.append(_section("آخر الرسائل", "Earlier in the conversation"))
            parts += [_message_card(_name(x.author), x.is_staff, x.created_at, x.body, x.attachment_name) for x in convo]

    sla_ar, sla_en, sla_c = _sla(ticket, now)
    st_ar, st_en = status_labels(ticket.status, fr)
    pr_ar, pr_en, *_ = PRIORITY.get(ticket.priority, (ticket.priority, ticket.priority))
    ca_ar, ca_en = CATEGORY.get(ticket.category, (ticket.category, ticket.category))
    requester = escape(_name(ticket.user))
    if not fr and ticket.user is not None:
        requester += f"<div dir='ltr' style='font-weight:normal;color:{MUTED};font-size:12px'>{escape(ticket.user.email)}</div>"
    assignee = (
        f"<span dir='auto'>{escape(_name(ticket.assignee))}</span>"
        + (f"<div dir='auto' style='font-weight:normal;color:{MUTED};font-size:12px'>{escape(ticket.assignee.job_title)}</div>"
           if ticket.assignee is not None and getattr(ticket.assignee, "job_title", None) else "")
        if ticket.assignee is not None
        else "<span dir='rtl'>لم يُسند بعد</span><div dir='ltr' style='font-weight:normal;color:#9CA3AF;font-size:12px'>Not assigned yet</div>"
    )
    rows = [
        ("رقم التذكرة", f"<span dir='ltr'>{ref(ticket.id)}</span>", "Ticket no."),
        ("الموضوع", f"<span dir='auto'>{escape(ticket.subject)}</span>", "Subject"),
        ("الحالة", f"<div dir='rtl'>{st_ar}</div><div dir='ltr' style='font-weight:normal;color:{MUTED};font-size:12px'>{st_en}</div>", "Status"),
        ("الأولوية", f"<div dir='rtl'>{pr_ar}</div><div dir='ltr' style='font-weight:normal;color:{MUTED};font-size:12px'>{pr_en}</div>", "Priority"),
        ("التصنيف", f"<div dir='rtl'>{ca_ar}</div><div dir='ltr' style='font-weight:normal;color:{MUTED};font-size:12px'>{ca_en}</div>", "Category"),
        ("مقدّم الطلب", requester, "Requester"),
        ("المسؤول عن التذكرة", assignee, "Assigned to"),
        ("تاريخ الفتح", f"<span dir='ltr'>{_t(ticket.created_at)}</span>", "Opened"),
        ("آخر تحديث", f"<span dir='ltr'>{_t(ticket.updated_at)}</span>", "Last update"),
    ]
    if ticket.status in ("open", "in_progress", "waiting_user"):
        rows += [
            ("موعد الرد المستهدف", f"<span dir='ltr'>{_t(ticket.response_due_at)}</span>"
             f"<div style='font-weight:normal;font-size:12px;color:{sla_c}'><span dir='rtl'>{sla_ar}</span> · <span dir='ltr'>{sla_en}</span></div>",
             "Response target"),
            ("موعد الحل المستهدف", f"<span dir='ltr'>{_t(ticket.resolve_due_at)}</span>", "Resolution target"),
        ]
    else:
        rows.append(("تاريخ الحل / الإغلاق", f"<span dir='ltr'>{_t(ticket.resolved_at or ticket.closed_at)}</span>", "Resolved / closed"))
    if ticket.rating:
        rows.append(("تقييم العميل", f"<span dir='ltr' style='color:#E0A100'>{'★' * ticket.rating}{'☆' * (5 - ticket.rating)}</span> <span dir='ltr'>{ticket.rating}/5</span>", "Customer rating"))
    if not fr and ticket.page_url:
        rows.append(("الصفحة", f"<span dir='ltr' style='font-weight:normal;font-size:12px'>{escape(ticket.page_url)}</span>", "Reported from"))
    parts += [_section("تفاصيل التذكرة", "Ticket details"), _details(rows)]

    log = _log(ticket.events, fr)
    if log:
        parts += [_section("سجل التذكرة", "Activity log"), log]

    if mail.kind == "resolved":
        parts.append(_stars(mail.url))
    parts.append(_button(mail.url))

    if fr:
        why_ar = "وصلتك هذه الرسالة لأنك صاحب التذكرة. للرد، افتح التذكرة واكتب ردك — لا ترد على هذا البريد."
        why_en = "You receive this because you opened this ticket. To reply, open the ticket — please don't reply to this email."
        hours_ar, hours_en = "ساعات العمل: السبت–الخميس، 9 ص – 9 م · الهاتف 920007039", "Office hours: Sat–Thu, 9 AM–9 PM · Phone 920007039"
    else:
        why_ar = "وصلتك هذه الرسالة بصفتك من فريق الدعم الفني أو المسؤول عن التذكرة."
        why_en = "You receive this as a member of the support team or the ticket's assignee."
        hours_ar = hours_en = ""
    parts.append(
        f"<div style='margin-top:14px;font-size:11.5px;color:#9CA3AF;text-align:center;line-height:1.7'>"
        f"<div dir='rtl'>{why_ar}</div><div dir='ltr'>{why_en}</div>"
        + (f"<div dir='rtl'>{hours_ar}</div><div dir='ltr'>{hours_en}</div>" if hours_ar else "")
        + "</div>"
    )

    html = _branded_one("".join(parts), preheader=f"{head_ar} · {head_en} — {ref(ticket.id)} — {ticket.subject}")

    # Plain-text alternative with the same facts.
    def plain(h: str) -> str:
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h)).strip()

    lines = [f"{head_ar} | {head_en}", f"{ref(ticket.id)} — {ticket.subject}", ""]
    if mail.changes:
        lines.append("ما الذي تغيّر / What changed:")
        for c in mail.changes:
            ar, en = FIELD[c.field]
            lines.append(f"- {ar} / {en}: {c.old or '—'} → {c.new or '—'}")
        lines.append("")
    if mail.kind == "resolved" and ticket.resolution:
        lines += ["ملخص الحل / Resolution:", ticket.resolution, ""]
    if m is not None:
        lines += [f"{_name(m.author)} ({_t(m.created_at)}):", m.body or "", ""]
    lines += [f"- {ar} / {en}: {plain(v)}" for ar, v, en in rows]
    lines.append("")
    lines += [f"{_t(e.created_at)}  {event_text(e, fr)[1]}" for e in [e for e in ticket.events if e.public or not fr][-10:]]
    lines += ["", mail.url]

    status_ar, status_en = status_labels(ticket.status, fr)
    subject = f"[{ref(ticket.id)}] {head_ar} | {head_en} — {ticket.subject} ({status_ar} · {status_en})"
    return EmailMessage(to=mail.to, subject=subject[:250], text_body="\n".join(lines), html_body=html, category="support")


def send(ticket, mail: TicketMail, now: datetime) -> bool:
    if not mail.to:
        return False
    return send_email(build(ticket, mail, now))
