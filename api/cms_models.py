"""Public-website CMS models (marketing site at muktasabat.com/{locale}).

Kept apart from api/models.py so the portal domain and the marketing content
evolve independently. Every table here is new, so `Base.metadata.create_all`
on startup creates them — no `ensure_*` helper is needed. Add a column to an
existing table here later → add an `ensure_*` helper in api/database.py, same
as the rest of the codebase.

Bilingual fields follow the `<name>_ar` / `<name>_en` convention used across
the portal.
"""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.database import Base


class _Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class _Publishable:
    published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class SiteSettings(_Timestamps, Base):
    """Single row (id=1). `data` holds the public site blocks (hero, about,
    stats, contact, social, legal, seo…); `private` holds settings that must
    never reach the public API (lead notification recipients)."""

    __tablename__ = "cms_site_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    private: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)


class CmsService(_Timestamps, _Publishable, Base):
    __tablename__ = "cms_services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    icon: Mapped[Optional[str]] = mapped_column(String(60))
    title_ar: Mapped[str] = mapped_column(String(200), nullable=False)
    title_en: Mapped[str] = mapped_column(String(200), nullable=False)
    summary_ar: Mapped[Optional[str]] = mapped_column(String(600))
    summary_en: Mapped[Optional[str]] = mapped_column(String(600))
    body_ar: Mapped[Optional[str]] = mapped_column(Text)
    body_en: Mapped[Optional[str]] = mapped_column(Text)
    image_url: Mapped[Optional[str]] = mapped_column(String(600))


class CmsProject(_Timestamps, _Publishable, Base):
    __tablename__ = "cms_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(30), default="residential", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="completed", nullable=False)
    featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    title_ar: Mapped[str] = mapped_column(String(200), nullable=False)
    title_en: Mapped[str] = mapped_column(String(200), nullable=False)
    summary_ar: Mapped[Optional[str]] = mapped_column(String(600))
    summary_en: Mapped[Optional[str]] = mapped_column(String(600))
    body_ar: Mapped[Optional[str]] = mapped_column(Text)
    body_en: Mapped[Optional[str]] = mapped_column(Text)
    city_ar: Mapped[Optional[str]] = mapped_column(String(120))
    city_en: Mapped[Optional[str]] = mapped_column(String(120))
    lat: Mapped[Optional[float]] = mapped_column(Float)
    lng: Mapped[Optional[float]] = mapped_column(Float)
    area_sqm: Mapped[Optional[float]] = mapped_column(Float)
    units_count: Mapped[Optional[int]] = mapped_column(Integer)
    year: Mapped[Optional[int]] = mapped_column(Integer)
    cover_url: Mapped[Optional[str]] = mapped_column(String(600))
    gallery: Mapped[list] = mapped_column(JSON, default=list, nullable=False)


class CmsPost(_Timestamps, _Publishable, Base):
    __tablename__ = "cms_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False, index=True)
    title_ar: Mapped[str] = mapped_column(String(250), nullable=False)
    title_en: Mapped[str] = mapped_column(String(250), nullable=False)
    excerpt_ar: Mapped[Optional[str]] = mapped_column(String(600))
    excerpt_en: Mapped[Optional[str]] = mapped_column(String(600))
    body_ar: Mapped[Optional[str]] = mapped_column(Text)
    body_en: Mapped[Optional[str]] = mapped_column(Text)
    cover_url: Mapped[Optional[str]] = mapped_column(String(600))
    published_on: Mapped[Optional[date]] = mapped_column(Date)


class CmsJob(_Timestamps, _Publishable, Base):
    __tablename__ = "cms_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False, index=True)
    title_ar: Mapped[str] = mapped_column(String(200), nullable=False)
    title_en: Mapped[str] = mapped_column(String(200), nullable=False)
    department_ar: Mapped[Optional[str]] = mapped_column(String(120))
    department_en: Mapped[Optional[str]] = mapped_column(String(120))
    location_ar: Mapped[Optional[str]] = mapped_column(String(120))
    location_en: Mapped[Optional[str]] = mapped_column(String(120))
    employment_type: Mapped[str] = mapped_column(String(30), default="full_time", nullable=False)
    body_ar: Mapped[Optional[str]] = mapped_column(Text)
    body_en: Mapped[Optional[str]] = mapped_column(Text)
    closes_on: Mapped[Optional[date]] = mapped_column(Date)

    applications: Mapped[list["CmsJobApplication"]] = relationship(back_populates="job")


class CmsTestimonial(_Timestamps, _Publishable, Base):
    __tablename__ = "cms_testimonials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_ar: Mapped[str] = mapped_column(String(120), nullable=False)
    name_en: Mapped[str] = mapped_column(String(120), nullable=False)
    role_ar: Mapped[Optional[str]] = mapped_column(String(160))
    role_en: Mapped[Optional[str]] = mapped_column(String(160))
    quote_ar: Mapped[str] = mapped_column(String(1000), nullable=False)
    quote_en: Mapped[str] = mapped_column(String(1000), nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(600))
    rating: Mapped[int] = mapped_column(Integer, default=5, nullable=False)


class CmsPartner(_Timestamps, _Publishable, Base):
    __tablename__ = "cms_partners"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_ar: Mapped[str] = mapped_column(String(160), nullable=False)
    name_en: Mapped[str] = mapped_column(String(160), nullable=False)
    logo_url: Mapped[Optional[str]] = mapped_column(String(600))
    website: Mapped[Optional[str]] = mapped_column(String(300))


class CmsLead(_Timestamps, Base):
    """Inbound enquiry from the public contact/interest form."""

    __tablename__ = "cms_leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), default="general", nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(30))
    email: Mapped[Optional[str]] = mapped_column(String(160))
    city: Mapped[Optional[str]] = mapped_column(String(80))
    message: Mapped[Optional[str]] = mapped_column(Text)
    source_page: Mapped[Optional[str]] = mapped_column(String(300))
    locale: Mapped[Optional[str]] = mapped_column(String(5))
    status: Mapped[str] = mapped_column(String(20), default="new", nullable=False, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    ip_hash: Mapped[Optional[str]] = mapped_column(String(64))


class CmsJobApplication(_Timestamps, Base):
    __tablename__ = "cms_job_applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cms_jobs.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(30))
    linkedin: Mapped[Optional[str]] = mapped_column(String(300))
    cover_letter: Mapped[Optional[str]] = mapped_column(Text)
    cv_object_key: Mapped[Optional[str]] = mapped_column(String(400))
    cv_filename: Mapped[Optional[str]] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="new", nullable=False, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    ip_hash: Mapped[Optional[str]] = mapped_column(String(64))

    job: Mapped[Optional[CmsJob]] = relationship(back_populates="applications")
