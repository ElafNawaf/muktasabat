"""Email sending via AWS SES.

Two modes:

* `ses_region` + `ses_from_email` set → send through SES (boto3, IAM-auth).
* Either missing → "console" mode: log the email body to stdout. Lets local dev
  exercise the password-reset / verification flows without an AWS account.

The SES path imports boto3 lazily so dev installs without boto3 still work.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from api.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class EmailMessage:
    to: str
    subject: str
    text_body: str
    html_body: str | None = None
    cc: list[str] | None = None
    # Shown in the super-admin e-mail log: payment_alert, invite, password_reset,
    # verification, account, support, website, owner_portal, system…
    category: str = "system"


def _send_via_ses(msg: EmailMessage) -> None:
    settings = get_settings()
    try:
        import boto3
    except ImportError as e:
        raise RuntimeError(
            "boto3 is required for SES email — install boto3 or unset SES_REGION."
        ) from e

    client = boto3.client("ses", region_name=settings.ses_region)
    body: dict = {"Text": {"Data": msg.text_body, "Charset": "UTF-8"}}
    if msg.html_body:
        body["Html"] = {"Data": msg.html_body, "Charset": "UTF-8"}

    kwargs = {
        "Source": settings.ses_from_email,
        "Destination": {"ToAddresses": [msg.to], **({"CcAddresses": msg.cc} if msg.cc else {})},
        "Message": {
            "Subject": {"Data": msg.subject, "Charset": "UTF-8"},
            "Body": body,
        },
    }
    if settings.ses_configuration_set:
        kwargs["ConfigurationSetName"] = settings.ses_configuration_set

    client.send_email(**kwargs)


def _mask(addr: str) -> str:
    """Logs never carry full addresses (they can end up in shared CI logs)."""
    local, _, domain = (addr or "").partition("@")
    return f"{local[:1]}***@{domain}" if domain else "***"


import threading

_last = threading.local()


def last_send_error() -> str | None:
    """Plain-language reason the most recent send_email() on this thread failed."""
    return getattr(_last, "error", None)


def _reason(e: Exception) -> str:
    text = str(e)
    if "not verified" in text and "identities failed the check" in text:
        return "ses_sandbox_unverified_recipient"
    if "not verified" in text:
        return "ses_sender_not_verified"
    if "AccessDenied" in text or "not authorized" in text:
        return "ses_permission_denied"
    if "Daily message quota exceeded" in text or "Maximum sending rate" in text:
        return "ses_quota_exceeded"
    return "send_failed"


def send_email(msg: EmailMessage) -> bool:
    """Best-effort send. SES errors are logged, never raised — auth flows stay
    user-facing-friendly even if email infrastructure has a hiccup."""
    settings = get_settings()
    # Mailboxes are case-insensitive in practice, but SES's sandbox recipient
    # check is not: "Elaf.x@gmail.com" fails when "elaf.x@gmail.com" is verified.
    msg.to = (msg.to or "").strip().lower()
    msg.cc = [c for c in dict.fromkeys((c or "").strip().lower() for c in (msg.cc or [])) if c and c != msg.to] or None
    if not settings.ses_region or not settings.ses_from_email:
        logger.info(
            "[email:console] to=%s cc=%s subject=%r\n%s",
            _mask(msg.to),
            ",".join(_mask(c) for c in msg.cc or []),
            msg.subject,
            msg.text_body,
        )
        _record(msg, "console", None)
        return True
    _last.error = None
    try:
        _send_via_ses(msg)
        logger.info("Sent email to %s via SES (subject=%r)", _mask(msg.to), msg.subject)
        _record(msg, "sent", None)
        return True
    except Exception:
        import sys

        _last.error = _reason(sys.exc_info()[1])
        logger.exception("Failed to send email to %s via SES (%s)", _mask(msg.to), _last.error)
        _record(msg, "failed", _last.error)
        return False


_TOKEN_RE = None


def _redact(body: str | None) -> str | None:
    """Strip one-time tokens (reset / invite / verify / confirm links)."""
    global _TOKEN_RE
    if not body:
        return body
    if _TOKEN_RE is None:
        import re

        _TOKEN_RE = re.compile(r"(token=)[A-Za-z0-9_\-]+")
    return _TOKEN_RE.sub(r"\1[redacted]", body)


def _record(msg: EmailMessage, status: str, error: str | None) -> None:
    """Append to the super-admin e-mail log. Never raises — logging must not
    break the flow that sent the e-mail."""
    try:
        from api.database import SessionLocal
        from api.models import EmailLog

        with SessionLocal() as db:
            db.add(
                EmailLog(
                    category=(msg.category or "system")[:40],
                    to_email=(msg.to or "")[:255],
                    cc_emails=",".join(msg.cc or [])[:1000] or None,
                    subject=(msg.subject or "")[:500],
                    status=status,
                    error=(error or None) and error[:120],
                    text_body=_redact(msg.text_body),
                    html_body=_redact(msg.html_body),
                )
            )
            db.commit()
    except Exception:
        logger.exception("Could not write e-mail log row")


def _branded(inner_ar: str, inner_en: str, *, preheader: str = "") -> str:
    """The one Muktasabat email template: logo + Arabic/English company name on
    the brand maroon, Arabic section (RTL) then English section, branded footer.
    Table-based inline-styled HTML so Gmail, Outlook and iOS Mail render it."""
    base = get_settings().web_base_url.rstrip("/")
    logo = f"{base}/brand/email-logo.png"
    font = "Tahoma,Segoe UI,Arial,sans-serif"
    pre = (
        f"<div style='display:none;max-height:0;overflow:hidden;opacity:0'>{preheader}</div>" if preheader else ""
    )
    return (
        "<!doctype html><html><head><meta name='color-scheme' content='light only'>"
        "<meta name='supported-color-schemes' content='light'>"
        "<style>:root{color-scheme:light only;supported-color-schemes:light}"
        "u+.body .mk-maroon{background-image:linear-gradient(#7B1A1A,#7B1A1A)!important}</style></head>"
        f"<body class='body' style='margin:0;padding:0;background:#F5EFE4'>{pre}"
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#F5EFE4'><tr><td align='center' style='padding:28px 12px'>"
        "<table role='presentation' width='600' cellpadding='0' cellspacing='0' style='width:100%;max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E3DDD2'>"
        # Header: logo + names
        "<tr><td class='mk-maroon' bgcolor='#7B1A1A' style='background:#7B1A1A;background-image:linear-gradient(#7B1A1A,#7B1A1A);padding:22px 28px'>"
        "<table role='presentation' dir='rtl' width='100%' cellpadding='0' cellspacing='0'><tr>"
        f"<td width='62' style='width:56px'><img src='{logo}' width='48' height='48' alt='Muktasabat' style='display:block;border:0;border-radius:10px;margin-left:14px'></td>"
        f"<td dir='rtl' style='text-align:right;font-family:{font};color:#FFFFFF'>"
        "<div style='font-size:20px;font-weight:bold;line-height:1.3'>شركة مكتسبات العقارية</div>"
        "<div style='font-size:13px;color:#E9DCC6;letter-spacing:.3px' dir='ltr'>Muktasabat Real Estate</div>"
        "</td></tr></table></td></tr>"
        "<tr><td style='height:4px;background:#E9DCC6;line-height:4px;font-size:0'>&nbsp;</td></tr>"
        # Arabic
        f"<tr><td dir='rtl' style='padding:28px 28px 8px;text-align:right;font-family:{font};font-size:15px;line-height:1.9;color:#1F2328'>{inner_ar}</td></tr>"
        "<tr><td style='padding:0 28px'><div style='border-top:1px solid #E3DDD2;height:1px;line-height:1px;font-size:0'>&nbsp;</div></td></tr>"
        # English
        f"<tr><td dir='ltr' style='padding:20px 28px 28px;text-align:left;font-family:{font};font-size:14.5px;line-height:1.7;color:#1F2328'>{inner_en}</td></tr>"
        # Footer
        f"<tr><td style='background:#FAF7F1;border-top:1px solid #E3DDD2;padding:18px 28px;font-family:{font};font-size:12.5px;color:#5D636B;text-align:center;line-height:1.8'>"
        "<div dir='rtl'><strong style='color:#7B1A1A'>شركة مكتسبات العقارية</strong> · Muktasabat Real Estate</div>"
        f"<div dir='ltr'><a href='{base}' style='color:#7B1A1A;text-decoration:none'>muktasabat.com</a> &nbsp;|&nbsp; 920007039</div>"
        "<div dir='rtl'>رسالة آلية، يرجى عدم الرد عليها.</div>"
        "<div dir='ltr'>This is an automated message, please do not reply.</div>"
        "</td></tr></table></td></tr></table></body></html>"
    )


def _button(url: str, label: str) -> str:
    return (
        f"<table role='presentation' cellpadding='0' cellspacing='0' style='margin:22px 0'><tr>"
        f"<td class='mk-maroon' bgcolor='#7B1A1A' style='border-radius:8px;background:#7B1A1A;background-image:linear-gradient(#7B1A1A,#7B1A1A)'>"
        f"<a href='{url}' style='display:inline-block;color:#FFFFFF;text-decoration:none;padding:13px 28px;"
        f"border-radius:8px;font-weight:bold;font-size:15px'>{label}</a></td></tr></table>"
    )


def send_password_reset_email(
    to: str, reset_url: str, username: str | None = None, *, hours: int = 1, by_admin: bool = False
) -> bool:
    """Reset link. `by_admin` = an administrator triggered it (not the user)."""
    from html import escape

    u = escape(username or "")
    v_ar = "ساعة واحدة" if hours == 1 else f"{hours} ساعة"
    v_en = "1 hour" if hours == 1 else f"{hours} hours"
    lead_ar = "أرسل لك مدير النظام رابطًا لتعيين كلمة مرور جديدة لحسابك في مكتسبات." if by_admin else "طلبت إعادة تعيين كلمة المرور لحسابك في مكتسبات."
    lead_en = "Your administrator sent you a link to set a new password for your Muktasabat account." if by_admin else "You requested a password reset for your Muktasabat account."
    tail_ar = "إن لم تتوقع هذه الرسالة فتواصل مع الدعم الفني." if by_admin else "إن لم تطلب ذلك فتجاهل الرسالة."
    tail_en = "If you weren't expecting this, contact support." if by_admin else "If you didn't ask for this, ignore this email."
    text = (
        f"{lead_ar}\n"
        + (f"اسم المستخدم: {username}\n" if username else "")
        + f"افتح الرابط لتعيين كلمة مرور جديدة (صالح {v_ar}):\n{reset_url}\n\n"
        f"{lead_en}\n"
        + (f"Username: {username}\n" if username else "")
        + f"Open this link to set a new password (expires in {v_en}):\n{reset_url}\n\n"
        + tail_en
    )
    html = _branded(
        f"<p>{lead_ar}</p>"
        + (f"<p>اسم المستخدم للدخول: <strong dir='ltr'>{u}</strong></p>" if u else "")
        + _button(reset_url, "تعيين كلمة مرور جديدة")
        + f"<p style='color:#5D636B;font-size:13px'>الرابط صالح {v_ar}. {tail_ar}</p>",
        f"<p>{lead_en}</p>"
        + (f"<p>Your username: <strong>{u}</strong></p>" if u else "")
        + _button(reset_url, "Set a new password")
        + f"<p style='color:#5D636B;font-size:13px'>The link expires in {v_en}. {tail_en}</p>",
    )
    return send_email(EmailMessage(to=to, subject="إعادة تعيين كلمة المرور | Reset your Muktasabat password", text_body=text, html_body=html, category="password_reset"))


def send_account_invite(to: str, username: str, url: str, hours: int, portal: str) -> bool:
    """(Re-)invitation: username + set-password link. `portal` is "staff" or "owner"."""
    from html import escape

    u = escape(username)
    what_ar = "بوابة الملاك لمتابعة عقاراتك وعقودك وإيراداتك" if portal == "owner" else "نظام إدارة الأملاك"
    what_en = "the owner portal to follow your properties, leases and revenue" if portal == "owner" else "the property-management system"
    text = (
        f"تمت دعوتك إلى {what_ar} في شركة مكتسبات العقارية.\nاسم المستخدم: {username}\n"
        f"عيّن كلمة المرور (الرابط صالح {hours} ساعة):\n{url}\n\n"
        f"You're invited to {what_en} at Muktasabat Real Estate.\nUsername: {username}\n"
        f"Set your password (link valid for {hours} hours):\n{url}\n"
    )
    html = _branded(
        f"<p>تمت دعوتك إلى {what_ar}.</p>"
        f"<p>اسم المستخدم: <strong dir='ltr'>{u}</strong> (ويمكنك الدخول ببريدك الإلكتروني أيضًا)</p>"
        + _button(url, "تعيين كلمة المرور والدخول")
        + f"<p style='color:#5D636B;font-size:13px'>الرابط صالح لمدة {hours} ساعة.</p>",
        f"<p>You're invited to {what_en}.</p>"
        f"<p>Username: <strong>{u}</strong> (you can also sign in with your email)</p>"
        + _button(url, "Set your password")
        + f"<p style='color:#5D636B;font-size:13px'>The link is valid for {hours} hours.</p>",
    )
    return send_email(EmailMessage(to=to, subject="دعوة إلى مكتسبات | Your Muktasabat invitation", text_body=text, html_body=html, category="invite"))


def send_email_verification(to: str, verify_url: str) -> None:
    text = (
        "مرحبًا بك في شركة مكتسبات العقارية.\nأكّد بريدك الإلكتروني لتفعيل حسابك (الرابط صالح 24 ساعة):\n"
        f"{verify_url}\n\n"
        "Welcome to Muktasabat Real Estate.\nConfirm your email address to activate your account (link valid for 24 hours):\n"
        f"{verify_url}"
    )
    html = _branded(
        "<p>مرحبًا بك! أكّد بريدك الإلكتروني لتفعيل حسابك.</p>"
        + _button(verify_url, "تأكيد البريد الإلكتروني")
        + "<p style='color:#5D636B;font-size:13px'>الرابط صالح لمدة 24 ساعة.</p>",
        "<p>Welcome! Confirm your email address to activate your account.</p>"
        + _button(verify_url, "Confirm email")
        + "<p style='color:#5D636B;font-size:13px'>The link is valid for 24 hours.</p>",
    )
    send_email(EmailMessage(to=to, subject="تأكيد البريد الإلكتروني | Verify your Muktasabat email", text_body=text, html_body=html, category="verification"))


ROLE_NAMES = {
    "admin": ("مدير النظام", "Administrator"),
    "manager": ("مدير", "Manager"),
    "viewer": ("مستخدم اطّلاع", "Viewer"),
    "owner": ("مالك", "Owner"),
    "content_editor": ("محرر محتوى الموقع", "Website editor"),
}


def send_user_invite(to: str, username: str, role: str, accept_url: str) -> None:
    """Email an invited staff user the link to set their initial password (bilingual)."""
    from html import escape

    r_ar, r_en = ROLE_NAMES.get(role, (role, role))
    u = escape(username)
    text = (
        f"تمت دعوتك إلى نظام شركة مكتسبات العقارية بصلاحية: {r_ar}\nاسم المستخدم: {username}\n"
        f"عيّن كلمة المرور لتفعيل حسابك (الرابط صالح 24 ساعة):\n{accept_url}\n\n"
        f"You've been invited to Muktasabat as {r_en}.\nUsername: {username}\n"
        f"Set your password to activate your account (link expires in 24 hours):\n{accept_url}"
    )
    html = _branded(
        f"<p>تمت دعوتك إلى نظام إدارة الأملاك بصلاحية <strong>{escape(r_ar)}</strong>.</p>"
        f"<p>اسم المستخدم: <strong dir='ltr'>{u}</strong> (ويمكنك الدخول ببريدك الإلكتروني أيضًا)</p>"
        + _button(accept_url, "تعيين كلمة المرور")
        + "<p style='color:#5D636B;font-size:13px'>الرابط صالح لمدة 24 ساعة.</p>",
        f"<p>You've been invited to the property-management system as <strong>{escape(r_en)}</strong>.</p>"
        f"<p>Username: <strong>{u}</strong> (you can also sign in with your email)</p>"
        + _button(accept_url, "Set your password")
        + "<p style='color:#5D636B;font-size:13px'>The link expires in 24 hours.</p>",
    )
    send_email(EmailMessage(to=to, subject="دعوة إلى مكتسبات | You're invited to Muktasabat", text_body=text, html_body=html, category="invite"))


# ---------------------------------------------------------------------------
# My account — security notices, and support-ticket notifications.
# Same house template as everything above (Arabic first, then English).
# `locale` is accepted for call-site symmetry; the template is always AR → EN.
# ---------------------------------------------------------------------------

from html import escape as _esc  # noqa: E402


def _notice(
    to: str,
    *,
    subject_ar: str,
    subject_en: str,
    ar: str,
    en: str,
    button: tuple[str, str, str] | None = None,  # (url, label_ar, label_en)
    preheader: str = "",
    category: str = "account",
) -> bool:
    """Send one bilingual notice. `ar` / `en` are HTML paragraphs; escape any
    user-supplied values with `_esc` before passing them in."""
    import re

    if button:
        ar = ar + _button(button[0], button[1])
        en = en + _button(button[0], button[2])
    plain = lambda h: re.sub(r"<[^>]+>", "", h.replace("</p>", "\n")).strip()  # noqa: E731
    text = plain(ar) + (f"\n{button[0]}" if button else "") + "\n\n" + plain(en) + (f"\n{button[0]}" if button else "")
    return send_email(
        EmailMessage(
            to=to,
            subject=f"{subject_ar} | {subject_en}",
            text_body=text,
            html_body=_branded(ar, en, preheader=preheader),
            category=category,
        )
    )


_MUTED = "<p style='color:#5D636B;font-size:13px'>{}</p>"


def send_password_changed_notice(to: str, username: str, locale: str | None = None) -> bool:
    u = _esc(username)
    return _notice(
        to,
        subject_ar="تم تغيير كلمة المرور",
        subject_en="Your password was changed",
        ar=f"<p>تم تغيير كلمة المرور لحساب <strong dir='ltr'>{u}</strong> وتسجيل الخروج من جميع الأجهزة الأخرى.</p>"
        + _MUTED.format("إن لم تقم بذلك، استخدم «نسيت كلمة المرور» فورًا وتواصل مع الدعم الفني على 920007039."),
        en=f"<p>The password for <strong>{u}</strong> was changed and all other devices were signed out.</p>"
        + _MUTED.format("If this wasn't you, use “Forgot password” right away and contact support on 920007039."),
        preheader="Password changed · تم تغيير كلمة المرور",
    )


def send_email_change_confirmation(to: str, confirm_url: str, username: str, locale: str | None = None) -> bool:
    """Sent to the NEW address — the change only applies once confirmed."""
    u = _esc(username)
    return _notice(
        to,
        subject_ar="تأكيد البريد الإلكتروني الجديد",
        subject_en="Confirm your new email address",
        ar=f"<p>طُلب تغيير البريد الإلكتروني لحساب <strong dir='ltr'>{u}</strong> إلى هذا العنوان.</p>",
        en=f"<p>A request was made to change the email of <strong>{u}</strong> to this address.</p>",
        button=(confirm_url, "تأكيد البريد الجديد", "Confirm new email"),
    )


def send_email_change_alert(to: str, new_email: str, username: str, locale: str | None = None) -> bool:
    """Sent to the OLD address so a takeover attempt is visible."""
    u, n = _esc(username), _esc(new_email)
    return _notice(
        to,
        subject_ar="طلب تغيير البريد الإلكتروني",
        subject_en="Email change requested",
        ar=f"<p>طُلب تغيير البريد الإلكتروني لحساب <strong dir='ltr'>{u}</strong> إلى <strong dir='ltr'>{n}</strong>.</p>"
        + _MUTED.format("إن لم تقم بذلك، غيّر كلمة المرور فورًا وتواصل مع الدعم الفني."),
        en=f"<p>A request was made to change the email of <strong>{u}</strong> to <strong>{n}</strong>.</p>"
        + _MUTED.format("If this wasn't you, change your password right away and contact support."),
    )


def send_ticket_created_to_staff(
    to: str, ticket_ref: str, subject: str, requester: str, priority: str, url: str
) -> bool:
    s, r, p = _esc(subject), _esc(requester), _esc(priority)
    return _notice(
        to,
        category="support",
        subject_ar=f"تذكرة دعم جديدة {ticket_ref}",
        subject_en=f"New support ticket {ticket_ref}",
        ar=f"<p>فتح <strong>{r}</strong> تذكرة دعم جديدة.</p><p>الموضوع: <strong>{s}</strong><br>الأولوية: {p}</p>",
        en=f"<p><strong>{r}</strong> opened a new support ticket.</p><p>Subject: <strong>{s}</strong><br>Priority: {p}</p>",
        button=(url, "عرض التذكرة", "View ticket"),
    )


def send_ticket_received(to: str, ticket_ref: str, subject: str, url: str, locale: str | None = None) -> bool:
    s = _esc(subject)
    return _notice(
        to,
        category="support",
        subject_ar=f"استلمنا طلبك {ticket_ref}",
        subject_en=f"We received your request {ticket_ref}",
        ar=f"<p>شكرًا لتواصلك. استلمنا تذكرتك <strong>{s}</strong> برقم {ticket_ref}.</p>"
        + _MUTED.format("سيرد فريق الدعم خلال ساعات العمل (السبت–الخميس، 9 ص – 9 م)."),
        en=f"<p>Thanks for reaching out. We received your ticket <strong>{s}</strong> ({ticket_ref}).</p>"
        + _MUTED.format("Our support team will reply during office hours (Sat–Thu, 9 AM–9 PM)."),
        button=(url, "متابعة التذكرة", "Track ticket"),
    )


def send_ticket_reply_to_user(
    to: str, ticket_ref: str, subject: str, excerpt: str, url: str, locale: str | None = None
) -> bool:
    s, x = _esc(subject), _esc(excerpt)
    quote = f"<p style='border-inline-start:3px solid #E5DCCB;padding:4px 12px;color:#374151'>{x}</p>"
    return _notice(
        to,
        category="support",
        subject_ar=f"رد جديد على تذكرتك {ticket_ref}",
        subject_en=f"New reply on your ticket {ticket_ref}",
        ar=f"<p>رد فريق الدعم على تذكرتك <strong>{s}</strong>:</p>{quote}",
        en=f"<p>Support replied to your ticket <strong>{s}</strong>:</p>{quote}",
        button=(url, "عرض الرد", "View reply"),
    )


def send_ticket_status_to_user(
    to: str,
    ticket_ref: str,
    subject: str,
    status_ar: str,
    status_en: str,
    url: str,
    locale: str | None = None,
) -> bool:
    s = _esc(subject)
    return _notice(
        to,
        category="support",
        subject_ar=f"تحديث حالة التذكرة {ticket_ref}",
        subject_en=f"Ticket {ticket_ref} updated",
        ar=f"<p>تم تحديث حالة تذكرتك <strong>{s}</strong> إلى: <strong>{_esc(status_ar)}</strong>.</p>",
        en=f"<p>Your ticket <strong>{s}</strong> is now: <strong>{_esc(status_en)}</strong>.</p>",
        button=(url, "عرض التذكرة", "View ticket"),
    )


def send_ticket_user_reply_to_staff(to: str, ticket_ref: str, subject: str, requester: str, url: str) -> bool:
    s, r = _esc(subject), _esc(requester)
    return _notice(
        to,
        category="support",
        subject_ar=f"رد من المستخدم على {ticket_ref}",
        subject_en=f"Customer replied on {ticket_ref}",
        ar=f"<p>أضاف <strong>{r}</strong> ردًا على التذكرة <strong>{s}</strong>.</p>",
        en=f"<p><strong>{r}</strong> replied on <strong>{s}</strong>.</p>",
        button=(url, "عرض التذكرة", "View ticket"),
    )
