"""First-run starter content for the public website.

Runs on API startup and only fills an EMPTY CMS (no settings row data and no
services). After that, everything is edited from the portal → Website.
Copy is taken from the muktasabat.lovable.app draft; numbers in `stats` are
placeholders and must be replaced with real figures before launch.
No testimonials or partners are seeded — those must be real.
"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.cms_models import CmsProject, CmsService, SiteSettings


def _b(ar: str, en: str) -> dict:
    return {"ar": ar, "en": en}


SITE = {
    "brand_name": _b("مكتسبات العقارية", "Muktasabat Real Estate"),
    "tagline": _b("رؤية طموحة. قيمة مستدامة.", "Ambitious vision. Sustainable value."),
    "hero_title": _b("رؤية طموحة. قيمة مستدامة.", "Ambitious vision. Sustainable value."),
    "hero_subtitle": _b(
        "ريادة الاستثمار والتطوير وإدارة الأملاك في المملكة العربية السعودية — من الفكرة حتى التشغيل.",
        "Leading real estate investment, development and property management in Saudi Arabia — from concept to operation.",
    ),
    "about_title": _b("من نحن", "About Muktasabat"),
    "about_body": _b(
        "نربط الرؤية بالخبرة لتطوير الأصول العقارية وإدارتها. نعمل مع الملاك والمستثمرين من مرحلة التخطيط وحتى التشغيل، بما يحقق قيمة مستدامة وطويلة الأمد لأصولهم.",
        "We connect vision with expertise to develop and manage real estate assets. We work alongside owners and investors from planning through operations, creating sustainable, long-term value.",
    ),
    "vision": _b(
        "أن نكون الشريك العقاري الأكثر ثقة في المملكة.",
        "To be the most trusted real estate partner in the Kingdom.",
    ),
    "mission": _b(
        "تقديم حلول تطوير وإدارة متكاملة ترفع قيمة الأصول وتخدم الملاك والمستأجرين بشفافية.",
        "Delivering integrated development and management solutions that grow asset value and serve owners and tenants transparently.",
    ),
    "values": [
        {"icon": "verified", "title": _b("الشفافية", "Transparency"), "body": _b("تقارير واضحة ولحظية لكل مالك.", "Clear, real-time reporting for every owner.")},
        {"icon": "handshake", "title": _b("الشراكة", "Partnership"), "body": _b("نعمل كامتداد لفريق المالك.", "We work as an extension of the owner's team.")},
        {"icon": "trending_up", "title": _b("الاستدامة", "Sustainability"), "body": _b("قرارات تحفظ قيمة الأصل على المدى الطويل.", "Decisions that protect asset value for the long term.")},
    ],
    "stats": [
        {"value": 0, "suffix": "+", "label": _b("وحدة تحت الإدارة", "Units under management")},
        {"value": 0, "suffix": "%", "label": _b("نسبة الإشغال", "Occupancy rate")},
        {"value": 0, "suffix": "+", "label": _b("مشروع منجز", "Projects delivered")},
        {"value": 0, "suffix": "", "label": _b("سنوات خبرة", "Years of experience")},
    ],
    "portal_title": _b("بوابة الملاك", "Owner Portal"),
    "portal_body": _b(
        "تابع عقودك ومدفوعاتك وتقارير أملاكك وطلبات المستأجرين في مكان واحد، على مدار الساعة.",
        "Track your contracts, payments, property reports and tenant requests in one place, around the clock.",
    ),
    "phone": "+966 55 500 5210",
    "whatsapp": "+966555005210",
    "address": _b("الرياض، المملكة العربية السعودية", "Riyadh, Saudi Arabia"),
    "working_hours": _b("الأحد – الخميس، 9 ص – 5 م", "Sun – Thu, 9 AM – 5 PM"),
    "map_lat": 24.7136,
    "map_lng": 46.6753,
    "social": {},
    "seo_title": _b("مكتسبات العقارية | تطوير وإدارة أملاك", "Muktasabat Real Estate | Development & Property Management"),
    "seo_description": _b(
        "مكتسبات العقارية: تطوير للغير، شراكات تطوير، إدارة أملاك وإدارة مرافق في المملكة العربية السعودية.",
        "Muktasabat Real Estate: development management, development partnerships, property and facilities management in Saudi Arabia.",
    ),
}

SERVICES = [
    {
        "slug": "development-management",
        "icon": "architecture",
        "title_ar": "التطوير للغير",
        "title_en": "Development Management",
        "summary_ar": "إدارة المشاريع العقارية من الفكرة حتى التسليم نيابةً عن الملاك.",
        "summary_en": "Managing real estate projects from concept to handover on behalf of owners.",
    },
    {
        "slug": "development-partnerships",
        "icon": "handshake",
        "title_ar": "شراكات التطوير",
        "title_en": "Development Partnerships",
        "summary_ar": "شراكات استراتيجية مع الملاك والمستثمرين لتعظيم قيمة الأراضي والأصول.",
        "summary_en": "Strategic partnerships with landowners and investors to unlock land and asset value.",
    },
    {
        "slug": "property-management",
        "icon": "apartment",
        "title_ar": "إدارة الأملاك",
        "title_en": "Property Management",
        "summary_ar": "إدارة التأجير والعقود والتحصيل وتوثيق العقود عبر منصة إيجار.",
        "summary_en": "Leasing, contracts, rent collection and Ejar contract registration.",
    },
    {
        "slug": "facilities-management",
        "icon": "engineering",
        "title_ar": "إدارة المرافق",
        "title_en": "Facilities Management",
        "summary_ar": "تشغيل وصيانة المرافق السكنية والتجارية وفق معايير الجودة والسلامة.",
        "summary_en": "Operating and maintaining residential and commercial facilities to quality and safety standards.",
    },
]

PROJECTS = [
    {
        "slug": "palm-villas",
        "category": "residential",
        "featured": True,
        "title_ar": "مجمع فلل النخيل",
        "title_en": "Palm Villas Complex",
        "city_ar": "الرياض",
        "city_en": "Riyadh",
        "lat": 24.774,
        "lng": 46.738,
    },
    {
        "slug": "business-tower",
        "category": "commercial",
        "featured": True,
        "title_ar": "برج الأعمال",
        "title_en": "Business Tower",
        "city_ar": "جدة",
        "city_en": "Jeddah",
        "lat": 21.543,
        "lng": 39.173,
    },
    {
        "slug": "integrated-waterfront",
        "category": "development",
        "status": "ongoing",
        "featured": True,
        "title_ar": "مشروع الواجهة المتكاملة",
        "title_en": "Integrated Waterfront Project",
        "city_ar": "الرياض",
        "city_en": "Riyadh",
        "lat": 24.69,
        "lng": 46.69,
    },
]


def seed_cms(db: Session) -> None:
    row = db.get(SiteSettings, 1)
    has_services = (db.scalar(select(func.count()).select_from(CmsService)) or 0) > 0
    if row is not None and (row.data or has_services):
        return
    if row is None:
        row = SiteSettings(id=1, data=SITE, private={})
        db.add(row)
    elif not row.data:
        row.data = SITE
    if not has_services:
        for i, s in enumerate(SERVICES):
            db.add(CmsService(**s, sort_order=i, published=True))
    if (db.scalar(select(func.count()).select_from(CmsProject)) or 0) == 0:
        for i, p in enumerate(PROJECTS):
            db.add(CmsProject(**p, sort_order=i, published=True))
    db.commit()
