"""Pydantic schemas for the public-website CMS.

Security notes
- Every free-text field has a max length so a compromised editor account
  can't bloat the DB or the rendered page.
- Every URL field goes through `_safe_url`: only http(s) or site-relative
  paths are accepted, which blocks `javascript:` / `data:` URL injection
  into hrefs and <img src>.
- Rich text is Markdown, rendered on the web side with raw HTML disabled, so
  no HTML sanitiser is needed here.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Annotated, Any, Literal, Optional

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, field_validator

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_PHONE_RE = re.compile(r"^[+0-9 ()\-]{7,20}$")


def _safe_url(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if v.startswith("/") and not v.startswith("//"):
        return v
    if re.match(r"^https?://", v, re.IGNORECASE):
        return v
    raise ValueError("URL must start with https:// or /")


SafeUrl = Annotated[Optional[Annotated[str, StringConstraints(max_length=600)]], AfterValidator(_safe_url)]
Slug = Annotated[str, StringConstraints(min_length=1, max_length=160, pattern=_SLUG_RE.pattern)]
Short = Optional[Annotated[str, StringConstraints(max_length=200)]]
Medium = Optional[Annotated[str, StringConstraints(max_length=600)]]
Long = Optional[Annotated[str, StringConstraints(max_length=50_000)]]


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


# ───────────────────────── Site settings ─────────────────────────


class Bilingual(_Base):
    ar: Optional[str] = Field(default=None, max_length=2000)
    en: Optional[str] = Field(default=None, max_length=2000)


class StatItem(_Base):
    value: float = Field(ge=0, le=1_000_000_000)
    suffix: Optional[str] = Field(default=None, max_length=8)
    label: Bilingual = Bilingual()


class ValueItem(_Base):
    icon: Optional[str] = Field(default=None, max_length=60)
    title: Bilingual = Bilingual()
    body: Bilingual = Bilingual()


class SiteData(_Base):
    """Public settings — returned verbatim by the public API."""

    brand_name: Bilingual = Bilingual()
    tagline: Bilingual = Bilingual()
    logo_url: SafeUrl = None

    hero_title: Bilingual = Bilingual()
    hero_subtitle: Bilingual = Bilingual()
    hero_image_url: SafeUrl = None

    about_title: Bilingual = Bilingual()
    about_body: Bilingual = Bilingual()
    about_image_url: SafeUrl = None
    vision: Bilingual = Bilingual()
    mission: Bilingual = Bilingual()
    values: list[ValueItem] = Field(default_factory=list, max_length=8)

    stats: list[StatItem] = Field(default_factory=list, max_length=6)

    portal_title: Bilingual = Bilingual()
    portal_body: Bilingual = Bilingual()

    phone: Optional[str] = Field(default=None, max_length=30)
    whatsapp: Optional[str] = Field(default=None, max_length=30)
    email: Optional[str] = Field(default=None, max_length=160)
    address: Bilingual = Bilingual()
    working_hours: Bilingual = Bilingual()
    map_lat: Optional[float] = Field(default=None, ge=-90, le=90)
    map_lng: Optional[float] = Field(default=None, ge=-180, le=180)

    social: dict[str, SafeUrl] = Field(default_factory=dict)

    cr_number: Optional[str] = Field(default=None, max_length=40)
    fal_licence: Optional[str] = Field(default=None, max_length=40)
    vat_number: Optional[str] = Field(default=None, max_length=40)

    seo_title: Bilingual = Bilingual()
    seo_description: Bilingual = Bilingual()
    og_image_url: SafeUrl = None

    @field_validator("social")
    @classmethod
    def _social_keys(cls, v: dict[str, Any]) -> dict[str, Any]:
        allowed = {"x", "instagram", "linkedin", "snapchat", "tiktok", "youtube", "facebook"}
        return {k: val for k, val in v.items() if k in allowed and val}

    @field_validator("phone", "whatsapp")
    @classmethod
    def _phone(cls, v: Optional[str]) -> Optional[str]:
        if v and not _PHONE_RE.match(v):
            raise ValueError("Invalid phone number")
        return v or None


class SitePrivate(_Base):
    lead_notify_emails: list[str] = Field(default_factory=list, max_length=10)
    careers_notify_emails: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("lead_notify_emails", "careers_notify_emails")
    @classmethod
    def _emails(cls, v: list[str]) -> list[str]:
        out = []
        for e in v:
            e = e.strip()
            if not e:
                continue
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e):
                raise ValueError(f"Invalid email: {e}")
            out.append(e)
        return out


class SiteSettingsAdmin(_Base):
    data: SiteData = SiteData()
    private: SitePrivate = SitePrivate()


# ───────────────────────── Content types ─────────────────────────


class _PublishFields(_Base):
    published: bool = False
    sort_order: int = Field(default=0, ge=-10_000, le=10_000)


class ServiceIn(_PublishFields):
    slug: Slug
    icon: Optional[str] = Field(default=None, max_length=60)
    title_ar: str = Field(min_length=1, max_length=200)
    title_en: str = Field(min_length=1, max_length=200)
    summary_ar: Medium = None
    summary_en: Medium = None
    body_ar: Long = None
    body_en: Long = None
    image_url: SafeUrl = None


class ServiceOut(ServiceIn):
    id: int
    updated_at: datetime


ProjectCategory = Literal["residential", "commercial", "development", "mixed", "hospitality"]
ProjectStatus = Literal["completed", "ongoing", "upcoming"]


class ProjectIn(_PublishFields):
    slug: Slug
    category: ProjectCategory = "residential"
    status: ProjectStatus = "completed"
    featured: bool = False
    title_ar: str = Field(min_length=1, max_length=200)
    title_en: str = Field(min_length=1, max_length=200)
    summary_ar: Medium = None
    summary_en: Medium = None
    body_ar: Long = None
    body_en: Long = None
    city_ar: Short = None
    city_en: Short = None
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    area_sqm: Optional[float] = Field(default=None, ge=0, le=100_000_000)
    units_count: Optional[int] = Field(default=None, ge=0, le=100_000)
    year: Optional[int] = Field(default=None, ge=1950, le=2100)
    cover_url: SafeUrl = None
    gallery: list[Annotated[str, AfterValidator(_safe_url)]] = Field(default_factory=list, max_length=40)


class ProjectOut(ProjectIn):
    id: int
    updated_at: datetime


class PostIn(_PublishFields):
    slug: Slug
    title_ar: str = Field(min_length=1, max_length=250)
    title_en: str = Field(min_length=1, max_length=250)
    excerpt_ar: Medium = None
    excerpt_en: Medium = None
    body_ar: Long = None
    body_en: Long = None
    cover_url: SafeUrl = None
    published_on: Optional[date] = None


class PostOut(PostIn):
    id: int
    updated_at: datetime


EmploymentType = Literal["full_time", "part_time", "contract", "internship"]


class JobIn(_PublishFields):
    slug: Slug
    title_ar: str = Field(min_length=1, max_length=200)
    title_en: str = Field(min_length=1, max_length=200)
    department_ar: Short = None
    department_en: Short = None
    location_ar: Short = None
    location_en: Short = None
    employment_type: EmploymentType = "full_time"
    body_ar: Long = None
    body_en: Long = None
    closes_on: Optional[date] = None


class JobOut(JobIn):
    id: int
    updated_at: datetime


class TestimonialIn(_PublishFields):
    name_ar: str = Field(min_length=1, max_length=120)
    name_en: str = Field(min_length=1, max_length=120)
    role_ar: Short = None
    role_en: Short = None
    quote_ar: str = Field(min_length=1, max_length=1000)
    quote_en: str = Field(min_length=1, max_length=1000)
    avatar_url: SafeUrl = None
    rating: int = Field(default=5, ge=1, le=5)


class TestimonialOut(TestimonialIn):
    id: int
    updated_at: datetime


class PartnerIn(_PublishFields):
    name_ar: str = Field(min_length=1, max_length=160)
    name_en: str = Field(min_length=1, max_length=160)
    logo_url: SafeUrl = None
    website: SafeUrl = None


class PartnerOut(PartnerIn):
    id: int
    updated_at: datetime


# ───────────────────────── Leads & applications ─────────────────────────

LeadKind = Literal["owner", "investor", "tenant", "partner", "general"]
LeadStatus = Literal["new", "contacted", "qualified", "won", "lost", "spam"]


class LeadIn(_Base):
    kind: LeadKind = "general"
    name: str = Field(min_length=2, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[str] = Field(default=None, max_length=160)
    city: Optional[str] = Field(default=None, max_length=80)
    message: Optional[str] = Field(default=None, max_length=4000)
    source_page: Optional[str] = Field(default=None, max_length=300)
    locale: Optional[Literal["ar", "en"]] = None
    # Bot traps — `website` must be empty (hidden field), `turnstile_token`
    # is verified when TURNSTILE_SECRET_KEY is configured.
    website: Optional[str] = Field(default=None, max_length=200)
    turnstile_token: Optional[str] = Field(default=None, max_length=4096)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: Optional[str]) -> Optional[str]:
        if v and not _PHONE_RE.match(v):
            raise ValueError("Invalid phone number")
        return v or None

    @field_validator("email")
    @classmethod
    def _email(cls, v: Optional[str]) -> Optional[str]:
        if v and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Invalid email")
        return v or None


class LeadOut(_Base):
    id: int
    kind: str
    name: str
    phone: Optional[str]
    email: Optional[str]
    city: Optional[str]
    message: Optional[str]
    source_page: Optional[str]
    locale: Optional[str]
    status: str
    notes: Optional[str]
    created_at: datetime


class LeadUpdate(_Base):
    status: LeadStatus
    notes: Optional[str] = Field(default=None, max_length=4000)


ApplicationStatus = Literal["new", "reviewing", "interview", "offer", "hired", "rejected"]


class ApplicationOut(_Base):
    id: int
    job_id: Optional[int]
    job_title_en: Optional[str] = None
    job_title_ar: Optional[str] = None
    name: str
    email: str
    phone: Optional[str]
    linkedin: Optional[str]
    cover_letter: Optional[str]
    cv_filename: Optional[str]
    has_cv: bool = False
    status: str
    notes: Optional[str]
    created_at: datetime


class ApplicationUpdate(_Base):
    status: ApplicationStatus
    notes: Optional[str] = Field(default=None, max_length=4000)


class MediaOut(_Base):
    url: str
    object_key: str


class InboxCounts(_Base):
    new_leads: int
    new_applications: int
