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
        "Destination": {"ToAddresses": [msg.to]},
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


def send_email(msg: EmailMessage) -> bool:
    """Best-effort send. SES errors are logged, never raised — auth flows stay
    user-facing-friendly even if email infrastructure has a hiccup."""
    settings = get_settings()
    # Mailboxes are case-insensitive in practice, but SES's sandbox recipient
    # check is not: "Elaf.x@gmail.com" fails when "elaf.x@gmail.com" is verified.
    msg.to = (msg.to or "").strip().lower()
    if not settings.ses_region or not settings.ses_from_email:
        logger.info(
            "[email:console] to=%s subject=%r\n%s",
            _mask(msg.to),
            msg.subject,
            msg.text_body,
        )
        return True
    try:
        _send_via_ses(msg)
        logger.info("Sent email to %s via SES (subject=%r)", _mask(msg.to), msg.subject)
        return True
    except Exception:
        logger.exception("Failed to send email to %s via SES", _mask(msg.to))
        return False


def _branded(inner_ar: str, inner_en: str) -> str:
    """Bilingual branded HTML shell (Arabic first, English below)."""
    return (
        "<div style='background:#FAF7F1;padding:24px 0;font-family:Tahoma,Arial,sans-serif'>"
        "<div style='max-width:560px;margin:0 auto;background:#fff;border:1px solid #E3DDD2;border-radius:8px;overflow:hidden'>"
        "<div style='background:#7B1A1A;color:#fff;padding:18px 24px;font-size:18px;font-weight:bold' dir='rtl'>"
        "شركة مكتسبات العقارية <span style='font-weight:normal;opacity:.8;font-size:13px'>Muktasabat Real Estate</span></div>"
        f"<div dir='rtl' style='padding:20px 24px;text-align:right;color:#1F2328;line-height:1.8'>{inner_ar}</div>"
        "<hr style='border:0;border-top:1px solid #E3DDD2;margin:0 24px'>"
        f"<div dir='ltr' style='padding:20px 24px;color:#1F2328;line-height:1.6'>{inner_en}</div>"
        "</div></div>"
    )


def _button(url: str, label: str) -> str:
    return (
        f"<p><a href='{url}' style='display:inline-block;background:#7B1A1A;color:#fff;"
        f"text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold'>{label}</a></p>"
    )


def send_password_reset_email(to: str, reset_url: str, username: str | None = None) -> None:
    from html import escape

    u = escape(username or "")
    text = (
        "طلبت إعادة تعيين كلمة المرور لحسابك في مكتسبات.\n"
        + (f"اسم المستخدم: {username}\n" if username else "")
        + f"افتح الرابط لتعيين كلمة مرور جديدة (صالح لساعة واحدة):\n{reset_url}\n\n"
        "You requested a password reset for your Muktasabat account.\n"
        + (f"Username: {username}\n" if username else "")
        + f"Open this link to set a new password (expires in 1 hour):\n{reset_url}\n\n"
        "If you didn't request this, ignore this message — your password stays the same."
    )
    html = _branded(
        "<p>طلبت إعادة تعيين كلمة المرور لحسابك.</p>"
        + (f"<p>اسم المستخدم للدخول: <strong dir='ltr'>{u}</strong></p>" if u else "")
        + _button(reset_url, "تعيين كلمة مرور جديدة")
        + "<p style='color:#5D636B;font-size:13px'>الرابط صالح لساعة واحدة. إن لم تطلب ذلك فتجاهل الرسالة.</p>",
        "<p>You requested a password reset.</p>"
        + (f"<p>Your username: <strong>{u}</strong></p>" if u else "")
        + _button(reset_url, "Set a new password")
        + "<p style='color:#5D636B;font-size:13px'>The link expires in 1 hour. If you didn't ask for this, ignore this email.</p>",
    )
    send_email(EmailMessage(to=to, subject="إعادة تعيين كلمة المرور | Reset your Muktasabat password", text_body=text, html_body=html))


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
    return send_email(EmailMessage(to=to, subject="دعوة إلى مكتسبات | Your Muktasabat invitation", text_body=text, html_body=html))


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
    send_email(EmailMessage(to=to, subject="تأكيد البريد الإلكتروني | Verify your Muktasabat email", text_body=text, html_body=html))


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
    send_email(EmailMessage(to=to, subject="دعوة إلى مكتسبات | You're invited to Muktasabat", text_body=text, html_body=html))
