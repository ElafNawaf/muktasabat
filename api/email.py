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


def send_email(msg: EmailMessage) -> None:
    """Best-effort send. SES errors are logged, never raised — auth flows stay
    user-facing-friendly even if email infrastructure has a hiccup."""
    settings = get_settings()
    if not settings.ses_region or not settings.ses_from_email:
        logger.info(
            "[email:console] to=%s subject=%r\n%s",
            msg.to,
            msg.subject,
            msg.text_body,
        )
        return
    try:
        _send_via_ses(msg)
        logger.info("Sent email to %s via SES (subject=%r)", msg.to, msg.subject)
    except Exception:
        logger.exception("Failed to send email to %s via SES", msg.to)


def send_password_reset_email(to: str, reset_url: str) -> None:
    text = (
        "You requested a password reset for your Muktasabat account.\n\n"
        f"Open this link to set a new password (expires in 1 hour):\n{reset_url}\n\n"
        "If you didn't request this, ignore this message — your password stays the same."
    )
    html = (
        "<p>You requested a password reset for your Muktasabat account.</p>"
        f'<p><a href="{reset_url}">Set a new password</a> (expires in 1 hour).</p>'
        "<p>If you didn't request this, ignore this message — your password stays the same.</p>"
    )
    send_email(EmailMessage(to=to, subject="Reset your Muktasabat password", text_body=text, html_body=html))


def send_email_verification(to: str, verify_url: str) -> None:
    text = (
        "Welcome to Muktasabat!\n\n"
        "Confirm your email address to activate your account:\n"
        f"{verify_url}\n\n"
        "This link expires in 24 hours."
    )
    html = (
        "<p>Welcome to Muktasabat!</p>"
        f'<p><a href="{verify_url}">Confirm your email address</a> to activate your account.</p>'
        "<p>This link expires in 24 hours.</p>"
    )
    send_email(EmailMessage(to=to, subject="Verify your Muktasabat email", text_body=text, html_body=html))


def send_user_invite(to: str, username: str, role: str, accept_url: str) -> None:
    """Email an invited user the link to set their initial password."""
    text = (
        f"You've been invited to join Muktasabat as {role}.\n\n"
        f"Username: {username}\n\n"
        "Set your password to activate your account (link expires in 24 hours):\n"
        f"{accept_url}"
    )
    html = (
        f"<p>You've been invited to join Muktasabat as <strong>{role}</strong>.</p>"
        f"<p>Username: <strong>{username}</strong></p>"
        f'<p><a href="{accept_url}">Set your password</a> to activate your account.</p>'
        "<p>This link expires in 24 hours.</p>"
    )
    send_email(
        EmailMessage(to=to, subject="You're invited to Muktasabat", text_body=text, html_body=html)
    )
