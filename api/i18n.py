"""Locale-aware display for bilingual DB fields (primary + optional _en / _ar).

This is the FastAPI counterpart of app/i18n_data.py. It does not depend on
flask_babel — the locale must be passed explicitly (typically from a request
query param or Accept-Language header).
"""
from typing import Annotated, Any, Literal

from fastapi import Header, Query

Locale = Literal["ar", "en"]


def localized_value(obj: Any, field: str, locale: Locale = "en") -> str:
    if obj is None:
        return ""
    primary = getattr(obj, field, None)
    if isinstance(primary, str):
        primary = primary.strip() or None
    en = getattr(obj, f"{field}_en", None)
    ar = getattr(obj, f"{field}_ar", None)
    if isinstance(en, str):
        en = en.strip() or None
    if isinstance(ar, str):
        ar = ar.strip() or None

    if locale.startswith("ar") and ar:
        return ar
    if locale.startswith("en") and en:
        return en
    if primary is None:
        return ""
    return str(primary).strip()


def get_locale(
    locale: Annotated[Locale, Query(description="Display language for bilingual fields")] = "en",
    accept_language: Annotated[str | None, Header()] = None,
) -> Locale:
    """Resolve locale: ?locale= query param wins, then Accept-Language header, else 'en'."""
    if locale in ("ar", "en"):
        return locale
    if accept_language:
        for part in accept_language.split(","):
            tag = part.split(";")[0].strip().lower()
            if tag.startswith("ar"):
                return "ar"
            if tag.startswith("en"):
                return "en"
    return "en"


LocaleDep = Annotated[Locale, "ar or en"]
