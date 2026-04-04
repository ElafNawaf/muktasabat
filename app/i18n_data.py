"""Locale-aware display for bilingual DB fields (primary + optional _en / _ar)."""
from __future__ import annotations

from typing import Any, Optional


def localized_value(obj: Any, field: str, locale: Optional[str] = None) -> str:
    """
    Return the value for `field` in the active or given locale.

    Uses getattr(obj, f'{field}_en') and _ar when set; otherwise falls back to `field`.
    """
    if obj is None:
        return ''
    primary = getattr(obj, field, None)
    if isinstance(primary, str):
        primary = primary.strip() or None
    en = getattr(obj, f'{field}_en', None)
    ar = getattr(obj, f'{field}_ar', None)
    if isinstance(en, str):
        en = en.strip() or None
    if isinstance(ar, str):
        ar = ar.strip() or None

    if locale is None:
        try:
            from flask_babel import get_locale
            loc = str(get_locale() or 'en')
        except RuntimeError:
            loc = 'en'
    else:
        loc = locale

    if loc.startswith('ar') and ar:
        return ar
    if loc.startswith('en') and en:
        return en
    if primary is None:
        return ''
    return str(primary).strip()


def optional_form_str(form, key: str):
    """Return stripped string or None for optional bilingual form fields."""
    if form is None:
        return None
    v = form.get(key)
    if v is None:
        return None
    v = v.strip()
    return v or None
