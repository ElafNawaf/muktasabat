"""Email sending via AWS SES.

Two modes:

* `ses_region` + `ses_from_email` set → send through SES (boto3, IAM-auth).
* Either missing → "console" mode: log the email body to stdout. Lets local dev
  exercise the password-reset / verification flows without an AWS account.

The SES path imports boto3 lazily so dev installs without boto3 still work.
"""
from __future__ import annotations

import html as html_lib
import logging
import re
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


_last_error: str | None = None


def last_send_error() -> str | None:
    """Reason the most recent send_email() failed (None after a success)."""
    return _last_error


def send_email(msg: EmailMessage) -> bool:
    """Best-effort send. SES errors are logged, never raised — auth flows stay
    user-facing-friendly even if email infrastructure has a hiccup."""
    global _last_error
    settings = get_settings()
    # SES's sandbox recipient check is case-sensitive; mailboxes aren't.
    msg.to = (msg.to or "").strip().lower()
    msg.cc = [c for c in dict.fromkeys((c or "").strip().lower() for c in (msg.cc or [])) if c and c != msg.to] or None
    if not settings.ses_region or not settings.ses_from_email:
        logger.info(
            "[email:console] to=%s cc=%s subject=%r\n%s",
            msg.to,
            ",".join(msg.cc or []),
            msg.subject,
            msg.text_body,
        )
        return True
    _last_error = None
    try:
        _send_via_ses(msg)
        logger.info("Sent email to %s via SES (subject=%r)", msg.to, msg.subject)
        return True
    except Exception as e:
        _last_error = "ses_sandbox_unverified_recipient" if "not verified" in str(e) else "send_failed"
        logger.exception("Failed to send email to %s via SES", msg.to)
        return False


# ---------------------------------------------------------------------------
# Bilingual templates
#
# Every system email carries both Arabic and English. The recipient's
# preferred language goes first; the other follows under a divider.
# ---------------------------------------------------------------------------

_BRAND = "#7B1A1A"


def _esc(v: object) -> str:
    return html_lib.escape(str(v), quote=True)


def _button(url: str, label: str) -> str:
    return (
        f'<p style="margin:20px 0"><a href="{_esc(url)}" '
        f'style="background:{_BRAND};color:#fff;padding:10px 20px;border-radius:8px;'
        f'text-decoration:none;font-weight:600;display:inline-block">{_esc(label)}</a></p>'
    )


def _block(lang: str, paragraphs: list[str], button: tuple[str, str] | None) -> str:
    rtl = lang == "ar"
    body = "".join(f'<p style="margin:0 0 12px">{p}</p>' for p in paragraphs)
    if button:
        body += _button(*button)
    return (
        f'<div dir="{"rtl" if rtl else "ltr"}" lang="{lang}" '
        f'style="text-align:{"right" if rtl else "left"};font-family:Tahoma,Arial,sans-serif;'
        f'font-size:15px;line-height:1.7;color:#1f2937">{body}</div>'
    )


def _branded(inner_ar: str, inner_en: str, *, preheader: str = "") -> str:
    """Arabic section then English section in the house frame (used by the
    payment alerts, whose bodies are pre-built HTML)."""
    pre = (
        f"<div style='display:none;max-height:0;overflow:hidden;opacity:0'>{preheader}</div>" if preheader else ""
    )
    return (
        f'{pre}<div style="max-width:640px;margin:0 auto;padding:24px">'
        f'<div style="font-weight:700;color:{_BRAND};font-size:18px;margin-bottom:16px">'
        "مكتسبات · Muktasabat</div>"
        f'<div dir="rtl" lang="ar" style="text-align:right;font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.8;color:#1f2937">{inner_ar}</div>'
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">'
        f'<div dir="ltr" lang="en" style="text-align:left;font-family:Tahoma,Arial,sans-serif;font-size:14.5px;line-height:1.7;color:#1f2937">{inner_en}</div>'
        '<p style="color:#9ca3af;font-size:12px;margin-top:24px">'
        "شركة مكتسبات العقارية · Muktasabat Real Estate</p></div>"
    )


def _bilingual(
    *,
    to: str,
    locale: str | None,
    subject_ar: str,
    subject_en: str,
    ar: list[str],
    en: list[str],
    button: tuple[str, str, str] | None = None,  # (url, label_ar, label_en)
) -> EmailMessage:
    """Build one email with Arabic + English. `ar` / `en` paragraphs may contain
    simple HTML; callers must escape any user-supplied values with `_esc`."""
    first = "en" if (locale or "ar").startswith("en") else "ar"
    order = [first, "en" if first == "ar" else "ar"]
    blocks = {
        "ar": _block("ar", ar, (button[0], button[1]) if button else None),
        "en": _block("en", en, (button[0], button[2]) if button else None),
    }
    divider = '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">'
    html = (
        '<div style="max-width:600px;margin:0 auto;padding:24px">'
        f'<div style="font-weight:700;color:{_BRAND};font-size:18px;margin-bottom:16px">'
        "مكتسبات · Muktasabat</div>"
        + blocks[order[0]]
        + divider
        + blocks[order[1]]
        + '<p style="color:#9ca3af;font-size:12px;margin-top:24px">'
        "شركة مكتسبات العقارية · Muktasabat Real Estate</p></div>"
    )

    def _plain(paras: list[str], label: str | None) -> str:
        txt = "\n\n".join(re.sub(r"<[^>]+>", "", html_lib.unescape(p)) for p in paras)
        if button and label is not None:
            txt += f"\n\n{label}: {button[0]}"
        return txt

    texts = {
        "ar": _plain(ar, button[1] if button else None),
        "en": _plain(en, button[2] if button else None),
    }
    subjects = {"ar": subject_ar, "en": subject_en}
    return EmailMessage(
        to=to,
        subject=f"{subjects[order[0]]} | {subjects[order[1]]}",
        text_body=texts[order[0]] + "\n\n— — —\n\n" + texts[order[1]],
        html_body=html,
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def send_password_reset_email(to: str, reset_url: str, locale: str | None = None) -> None:
    send_email(
        _bilingual(
            to=to,
            locale=locale,
            subject_ar="إعادة تعيين كلمة المرور",
            subject_en="Reset your Muktasabat password",
            ar=[
                "تلقّينا طلبًا لإعادة تعيين كلمة المرور لحسابك في مكتسبات.",
                "الرابط صالح لمدة ساعة واحدة. إن لم تطلب ذلك فتجاهل هذه الرسالة وستبقى كلمة المرور كما هي.",
            ],
            en=[
                "You requested a password reset for your Muktasabat account.",
                "The link expires in 1 hour. If you didn't request this, ignore this message — your password stays the same.",
            ],
            button=(reset_url, "تعيين كلمة مرور جديدة", "Set a new password"),
        )
    )


def send_email_verification(to: str, verify_url: str, locale: str | None = None) -> None:
    send_email(
        _bilingual(
            to=to,
            locale=locale,
            subject_ar="تأكيد البريد الإلكتروني",
            subject_en="Verify your Muktasabat email",
            ar=["مرحبًا بك في مكتسبات!", "أكّد بريدك الإلكتروني لتفعيل حسابك. الرابط صالح لمدة 24 ساعة."],
            en=["Welcome to Muktasabat!", "Confirm your email address to activate your account. This link expires in 24 hours."],
            button=(verify_url, "تأكيد البريد الإلكتروني", "Confirm email address"),
        )
    )


def send_user_invite(
    to: str, username: str, role: str, accept_url: str, locale: str | None = None
) -> None:
    """Email an invited user the link to set their initial password."""
    send_email(
        _bilingual(
            to=to,
            locale=locale,
            subject_ar="دعوة للانضمام إلى مكتسبات",
            subject_en="You're invited to Muktasabat",
            ar=[
                f"تمت دعوتك للانضمام إلى بوابة مكتسبات بصلاحية <strong>{_esc(role)}</strong>.",
                f"اسم المستخدم: <strong>{_esc(username)}</strong>",
                "عيّن كلمة المرور لتفعيل حسابك (الرابط صالح لمدة 24 ساعة).",
            ],
            en=[
                f"You've been invited to join the Muktasabat portal as <strong>{_esc(role)}</strong>.",
                f"Username: <strong>{_esc(username)}</strong>",
                "Set your password to activate your account (link expires in 24 hours).",
            ],
            button=(accept_url, "تعيين كلمة المرور", "Set your password"),
        )
    )


# ---------------------------------------------------------------------------
# My account — security notifications
# ---------------------------------------------------------------------------


def send_password_changed_notice(to: str, username: str, locale: str | None = None) -> None:
    send_email(
        _bilingual(
            to=to,
            locale=locale,
            subject_ar="تم تغيير كلمة المرور",
            subject_en="Your password was changed",
            ar=[
                f"تم تغيير كلمة المرور لحساب <strong>{_esc(username)}</strong> وتسجيل الخروج من جميع الأجهزة الأخرى.",
                "إن لم تقم بذلك، استخدم «نسيت كلمة المرور» فورًا وتواصل مع الدعم الفني على 920007039.",
            ],
            en=[
                f"The password for <strong>{_esc(username)}</strong> was changed and all other devices were signed out.",
                "If this wasn't you, use “Forgot password” right away and contact support on 920007039.",
            ],
        )
    )


def send_email_change_confirmation(
    to: str, confirm_url: str, username: str, locale: str | None = None
) -> None:
    """Sent to the NEW address — it only takes effect once confirmed."""
    send_email(
        _bilingual(
            to=to,
            locale=locale,
            subject_ar="تأكيد البريد الإلكتروني الجديد",
            subject_en="Confirm your new email address",
            ar=[
                f"طُلب تغيير البريد الإلكتروني لحساب <strong>{_esc(username)}</strong> إلى هذا العنوان.",
                "أكّد العنوان خلال 24 ساعة ليصبح فعّالًا.",
            ],
            en=[
                f"A request was made to change the email of <strong>{_esc(username)}</strong> to this address.",
                "Confirm it within 24 hours for the change to take effect.",
            ],
            button=(confirm_url, "تأكيد البريد الجديد", "Confirm new email"),
        )
    )


def send_email_change_alert(
    to: str, new_email: str, username: str, locale: str | None = None
) -> None:
    """Sent to the OLD address so a hijack attempt is visible."""
    send_email(
        _bilingual(
            to=to,
            locale=locale,
            subject_ar="طلب تغيير البريد الإلكتروني",
            subject_en="Email change requested",
            ar=[
                f"طُلب تغيير البريد الإلكتروني لحساب <strong>{_esc(username)}</strong> إلى <strong>{_esc(new_email)}</strong>.",
                "إن لم تقم بذلك، غيّر كلمة المرور فورًا وتواصل مع الدعم الفني.",
            ],
            en=[
                f"A request was made to change the email of <strong>{_esc(username)}</strong> to <strong>{_esc(new_email)}</strong>.",
                "If this wasn't you, change your password right away and contact support.",
            ],
        )
    )


# ---------------------------------------------------------------------------
# Support tickets
# ---------------------------------------------------------------------------


def send_ticket_created_to_staff(
    to: str, ticket_ref: str, subject: str, requester: str, priority: str, url: str
) -> None:
    send_email(
        _bilingual(
            to=to,
            locale="ar",
            subject_ar=f"تذكرة دعم جديدة {ticket_ref}",
            subject_en=f"New support ticket {ticket_ref}",
            ar=[
                f"فتح <strong>{_esc(requester)}</strong> تذكرة دعم جديدة.",
                f"الموضوع: <strong>{_esc(subject)}</strong><br>الأولوية: {_esc(priority)}",
            ],
            en=[
                f"<strong>{_esc(requester)}</strong> opened a new support ticket.",
                f"Subject: <strong>{_esc(subject)}</strong><br>Priority: {_esc(priority)}",
            ],
            button=(url, "عرض التذكرة", "View ticket"),
        )
    )


def send_ticket_received(to: str, ticket_ref: str, subject: str, url: str, locale: str | None) -> None:
    send_email(
        _bilingual(
            to=to,
            locale=locale,
            subject_ar=f"استلمنا طلبك {ticket_ref}",
            subject_en=f"We received your request {ticket_ref}",
            ar=[
                f"شكرًا لتواصلك. استلمنا تذكرتك <strong>{_esc(subject)}</strong> برقم {ticket_ref}.",
                "سيرد فريق الدعم خلال ساعات العمل (السبت–الخميس، 9 ص – 9 م).",
            ],
            en=[
                f"Thanks for reaching out. We received your ticket <strong>{_esc(subject)}</strong> ({ticket_ref}).",
                "Our support team will reply during office hours (Sat–Thu, 9 AM–9 PM).",
            ],
            button=(url, "متابعة التذكرة", "Track ticket"),
        )
    )


def send_ticket_reply_to_user(
    to: str, ticket_ref: str, subject: str, excerpt: str, url: str, locale: str | None
) -> None:
    send_email(
        _bilingual(
            to=to,
            locale=locale,
            subject_ar=f"رد جديد على تذكرتك {ticket_ref}",
            subject_en=f"New reply on your ticket {ticket_ref}",
            ar=[f"رد فريق الدعم على تذكرتك <strong>{_esc(subject)}</strong>:", f"<em>{_esc(excerpt)}</em>"],
            en=[f"Support replied to your ticket <strong>{_esc(subject)}</strong>:", f"<em>{_esc(excerpt)}</em>"],
            button=(url, "عرض الرد", "View reply"),
        )
    )


def send_ticket_status_to_user(
    to: str, ticket_ref: str, subject: str, status_ar: str, status_en: str, url: str, locale: str | None
) -> None:
    send_email(
        _bilingual(
            to=to,
            locale=locale,
            subject_ar=f"تحديث حالة التذكرة {ticket_ref}",
            subject_en=f"Ticket {ticket_ref} updated",
            ar=[f"تم تحديث حالة تذكرتك <strong>{_esc(subject)}</strong> إلى: <strong>{_esc(status_ar)}</strong>."],
            en=[f"Your ticket <strong>{_esc(subject)}</strong> is now: <strong>{_esc(status_en)}</strong>."],
            button=(url, "عرض التذكرة", "View ticket"),
        )
    )


def send_ticket_user_reply_to_staff(to: str, ticket_ref: str, subject: str, requester: str, url: str) -> None:
    send_email(
        _bilingual(
            to=to,
            locale="ar",
            subject_ar=f"رد من المستخدم على {ticket_ref}",
            subject_en=f"Customer replied on {ticket_ref}",
            ar=[f"أضاف <strong>{_esc(requester)}</strong> ردًا على التذكرة <strong>{_esc(subject)}</strong>."],
            en=[f"<strong>{_esc(requester)}</strong> replied on <strong>{_esc(subject)}</strong>."],
            button=(url, "عرض التذكرة", "View ticket"),
        )
    )
