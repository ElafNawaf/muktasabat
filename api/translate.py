"""Amazon Translate wrapper.

Lazy boto3 import keeps dev installs without boto3 working. When
`translate_region` (or `ses_region` as fallback) is empty, `translate()` returns
the input unchanged — useful for local dev.
"""
from __future__ import annotations

import logging
from typing import Literal

from api.config import get_settings

logger = logging.getLogger(__name__)

Lang = Literal["en", "ar", "auto"]


def is_configured() -> bool:
    """True when AWS Translate has somewhere to send a request (region set)."""
    settings = get_settings()
    return bool(settings.translate_region or settings.ses_region)


def translate(text: str, source: Lang, target: Lang) -> str:
    """Translate `text` from `source` to `target`. Returns the input on no-op or
    on error (best-effort — the caller is filling a form field, not a billing
    receipt; surfacing a 500 here would feel hostile)."""
    if not text or not text.strip():
        return text
    if source == target:
        return text

    settings = get_settings()
    region = settings.translate_region or settings.ses_region
    if not region:
        return text

    try:
        import boto3
    except ImportError:
        logger.warning("boto3 not installed — translate is a no-op.")
        return text

    try:
        client = boto3.client("translate", region_name=region)
        resp = client.translate_text(
            Text=text,
            SourceLanguageCode=source,
            TargetLanguageCode=target,
        )
        return resp.get("TranslatedText", text)
    except Exception:
        logger.exception("Amazon Translate failed; returning original text.")
        return text
