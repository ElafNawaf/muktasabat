"""First-run starter content for the public website.

Runs on API startup and only fills an EMPTY CMS (no settings row data and no
services). After that, everything is edited from the portal → Website.
Copy is taken from the muktasabat.lovable.app draft; numbers in `stats` are
placeholders and must be replaced with real figures before launch.
No testimonials or partners are seeded — those must be real.
"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.cms_models import CmsListing, CmsProject, CmsService, SiteSettings


def _b(ar: str, en: str) -> dict:
    return {"ar": ar, "en": en}


SITE = {
    "brand_name": _b("شركة مكتسبات العقارية", "Muktasabat Real Estate"),
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
    "phone": "920007039",
    "whatsapp": "+966920007039",
    "address": _b("الرياض، المملكة العربية السعودية", "Riyadh, Saudi Arabia"),
    "working_hours": _b("السبت – الخميس، 9 ص – 9 م", "Sat – Thu, 9 AM – 9 PM"),
    "map_lat": 24.7136,
    "map_lng": 46.6753,
    "social": {},
    "seo_title": _b("شركة مكتسبات العقارية | تطوير وإدارة أملاك", "Muktasabat Real Estate | Development & Property Management"),
    "seo_description": _b(
        "شركة مكتسبات العقارية: تطوير للغير، شراكات تطوير، إدارة أملاك وإدارة مرافق في المملكة العربية السعودية.",
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


# ── Data migrations for already-seeded sites (idempotent) ──
_REPLACE = {
    # Draft contact numbers from the Lovable mock-up → the company's unified number.
    "phone": ({"+966 55 500 5210", "+966555005210"}, "920007039"),
    "whatsapp": ({"+966555005210", "+966 55 500 5210"}, "+966920007039"),
}


# Bilingual fields whose Arabic draft value is replaced by the official name.
_REPLACE_AR = {
    "brand_name": ("مكتسبات العقارية", "شركة مكتسبات العقارية"),
    "seo_title": ("مكتسبات العقارية | تطوير وإدارة أملاك", "شركة مكتسبات العقارية | تطوير وإدارة أملاك"),
}


def migrate_cms(db: Session) -> None:
    row = db.get(SiteSettings, 1)
    if row is None or not row.data:
        return
    data = dict(row.data)
    changed = False
    for key, (old, new) in _REPLACE_AR.items():
        bi = dict(data.get(key) or {})
        if (bi.get("ar") or "").strip() == old:
            bi["ar"] = new
            data[key] = bi
            changed = True
    for key, (old_values, new_value) in _REPLACE.items():
        if data.get(key) in old_values:
            data[key] = new_value
            changed = True
    if changed:
        row.data = data
        db.commit()


# ── v2 (Nov 2026): reposition around what the company actually does ──
# Public footprint (verified office on Aqar, "شركة مكتسبات العقارية للتسويق
# وإدارة الأملاك") shows exclusive marketing, brokerage, leasing and property
# management in Riyadh and Makkah. Copy is only replaced while it still holds
# the original draft text, so anything an editor has written is never touched.

_OLD_HERO_SUB_AR = SITE["hero_subtitle"]["ar"]
_OLD_ABOUT_AR = SITE["about_body"]["ar"]
_OLD_MISSION_AR = SITE["mission"]["ar"]
_OLD_SEO_DESC_AR = SITE["seo_description"]["ar"]

V2_COPY = {
    "hero_title": (
        {SITE["hero_title"]["ar"]},
        _b("عقارك في أيدٍ تعرف قيمته.", "Your property, in hands that know its worth."),
    ),
    "hero_subtitle": (
        {_OLD_HERO_SUB_AR},
        _b(
            "تسويق عقاري حصري، وساطة موثوقة، وإدارة أملاك بتقارير مالية شهرية — في الرياض ومكة المكرمة.",
            "Exclusive property marketing, trusted brokerage and property management with monthly financial reports — in Riyadh and Makkah.",
        ),
    ),
    "about_body": (
        {_OLD_ABOUT_AR},
        _b(
            "شركة مكتسبات العقارية للتسويق وإدارة الأملاك مكتب عقاري نظامي وموثّق. نسوّق ونؤجر ونبيع الشقق والأدوار والفلل والأراضي والعقارات التجارية في الرياض ومكة المكرمة، وندير الأملاك نيابةً عن ملاكها: إعلانات مرخّصة، وفرز للمستأجرين، وتوثيق العقود عبر منصة إيجار، وتحصيل منتظم، وصيانة، وتقارير مالية يطّلع عليها المالك في أي وقت عبر بوابة الملاك.",
            "Muktasabat Real Estate Company for Marketing and Property Management is a licensed, verified real estate office. We market, lease and sell apartments, floors, villas, land and commercial property in Riyadh and Makkah, and manage properties on behalf of their owners: licensed adverts, tenant screening, Ejar-registered contracts, steady collection, maintenance, and financial reports owners can open any time in the owner portal.",
        ),
    ),
    "mission": (
        {_OLD_MISSION_AR},
        _b(
            "أن نحقق لكل مالك أعلى عائد ممكن بأقل شغور، بشفافية كاملة في كل ريال يُحصَّل أو يُصرف.",
            "To earn every owner the best possible return with the least vacancy, with full transparency on every riyal collected or spent.",
        ),
    ),
    "seo_description": (
        {_OLD_SEO_DESC_AR},
        _b(
            "شركة مكتسبات العقارية للتسويق وإدارة الأملاك: عقارات للإيجار والبيع في الرياض ومكة المكرمة، تسويق عقاري حصري، وساطة، وإدارة أملاك مع بوابة ملاك وتقارير مالية.",
            "Muktasabat Real Estate: property for rent and sale in Riyadh and Makkah, exclusive marketing, brokerage and property management with an owner portal and financial reports.",
        ),
    ),
    "seo_title": (
        {SITE["seo_title"]["ar"], "شركة مكتسبات العقارية | تطوير وإدارة أملاك"},
        _b("شركة مكتسبات العقارية | تسويق وإدارة أملاك", "Muktasabat Real Estate | Marketing & Property Management"),
    ),
}

V2_SERVICES = [
    {
        "slug": "exclusive-marketing",
        "icon": "campaign",
        "title_ar": "التسويق العقاري الحصري",
        "title_en": "Exclusive Property Marketing",
        "summary_ar": "خطة تسويق لكل عقار: تصوير احترافي، إعلانات مرخّصة على عقار والمنصات الكبرى، وجولات معاينة منظّمة حتى إتمام الصفقة.",
        "summary_en": "A marketing plan per property: professional photos, licensed adverts on Aqar and the major platforms, and organised viewings through to closing.",
        "sort_order": -3,
    },
    {
        "slug": "brokerage",
        "icon": "real_estate_agent",
        "title_ar": "الوساطة العقارية",
        "title_en": "Real Estate Brokerage",
        "summary_ar": "بيع وشراء وتأجير الوحدات السكنية والتجارية والأراضي بعقود وساطة نظامية وفق أنظمة الهيئة العامة للعقار.",
        "summary_en": "Buying, selling and leasing homes, commercial units and land under formal brokerage agreements, in line with REGA rules.",
        "sort_order": -2,
    },
    {
        "slug": "rental-valuation",
        "icon": "price_check",
        "title_ar": "تقدير القيمة الإيجارية",
        "title_en": "Rental Valuation",
        "summary_ar": "نقدّر لك الإيجار العادل لعقارك بناءً على صفقات الحي الفعلية، مجانًا ودون التزام.",
        "summary_en": "We estimate a fair rent for your property from actual deals in the district, free and without obligation.",
        "sort_order": -1,
    },
]

# Real adverts from the company's Aqar profile. Seeded UNPUBLISHED: an editor
# must add photos and the REGA advert licence number, confirm price and
# availability, then publish.
V2_LISTINGS = [
    {
        "slug": "qurtubah-darco-duplex",
        "ref": "MK-1001",
        "purpose": "rent",
        "property_type": "duplex",
        "exclusive": True,
        "featured": True,
        "title_ar": "شقة دورين جديدة في مشروع داركو – حي قرطبة",
        "title_en": "New duplex apartment in Darco project – Qurtubah",
        "summary_ar": "تصميم عصري ومساحات مريحة للعائلة، قريبة من الخدمات والطرق الرئيسية، مع سطح خاص.",
        "summary_en": "Modern design and comfortable family spaces close to services and main roads, with a private roof.",
        "body_ar": "**الدور الأول:** مجلس واسع، صالة مفتوحة على المجلس، مطبخ عملي، غرفة خادمة، دورة مياه.\n\n**الدور الثاني:** ثلاث غرف نوم منها غرفة ماستر مع غرفة ملابس، وصالة عائلية.\n\n**الملحق:** سطح خاص للجلسات الخارجية.",
        "body_en": "**First floor:** spacious majlis, lounge open to the majlis, practical kitchen, maid's room, bathroom.\n\n**Second floor:** three bedrooms including a master with walk-in closet, family lounge.\n\n**Annex:** private roof for outdoor gatherings.",
        "city_ar": "الرياض", "city_en": "Riyadh",
        "district_ar": "قرطبة", "district_en": "Qurtubah",
        "price": 100000, "price_period": "year", "area_sqm": 188, "bedrooms": 3,
        "features_ar": "غرفة ماستر بغرفة ملابس\nسطح خاص\nغرفة خادمة\nتشطيب حديث",
        "features_en": "Master bedroom with walk-in closet\nPrivate roof\nMaid's room\nModern finishes",
    },
    {
        "slug": "qurtubah-apartment-166",
        "ref": "MK-1002",
        "purpose": "rent",
        "property_type": "apartment",
        "title_ar": "شقة واسعة للإيجار في حي قرطبة",
        "title_en": "Spacious apartment for rent in Qurtubah",
        "summary_ar": "دور أول، تشطيب جيد وتوزيع مريح للمساحات، مكيفة وجاهزة للسكن.",
        "summary_en": "First floor, good finishing and comfortable layout, air-conditioned and ready to move in.",
        "city_ar": "الرياض", "city_en": "Riyadh",
        "district_ar": "قرطبة", "district_en": "Qurtubah",
        "price": 75000, "price_period": "year", "area_sqm": 166, "bedrooms": 3, "bathrooms": 4,
        "floor": "1",
        "features_ar": "مجلس مستقل\nمقلط\nغرفة خادمة\nمكيفات مركبة",
        "features_en": "Separate majlis\nDining room\nMaid's room\nAC units installed",
    },
    {
        "slug": "munsiyah-first-floor",
        "ref": "MK-1003",
        "purpose": "rent",
        "property_type": "floor",
        "title_ar": "دور أول واسع للإيجار في حي المونسية",
        "title_en": "Spacious first floor for rent in Al Munsiyah",
        "summary_ar": "مساحات واسعة وتصميم عملي يناسب العائلات.",
        "summary_en": "Generous spaces and a practical layout suited to families.",
        "city_ar": "الرياض", "city_en": "Riyadh",
        "district_ar": "المونسية", "district_en": "Al Munsiyah",
        "price": 65000, "price_period": "year", "area_sqm": 525, "bedrooms": 3,
        "floor": "1",
        "features_ar": "مجلس واسع\nمقلط\nصالة عائلية",
        "features_en": "Large majlis\nDining room\nFamily lounge",
    },
    {
        "slug": "al-falah-land-1200",
        "ref": "MK-1004",
        "purpose": "sale",
        "property_type": "land",
        "exclusive": True,
        "title_ar": "أرض للبيع في حي الفلاح – واجهة شرقية",
        "title_en": "Land for sale in Al Falah – east-facing",
        "summary_ar": "موقع مميز على شارع عرض 20 م، مناسبة للاستثمار أو التطوير.",
        "summary_en": "Prime plot on a 20 m street, suited to investment or development.",
        "city_ar": "الرياض", "city_en": "Riyadh",
        "district_ar": "الفلاح", "district_en": "Al Falah",
        "price_period": "total", "area_sqm": 1200, "street_width_m": 20, "facade": "east",
    },
    {
        "slug": "makkah-buhayrat-plots",
        "ref": "MK-1005",
        "purpose": "sale",
        "property_type": "land",
        "exclusive": True,
        "title_ar": "قطعتا أرض للبيع في حي البحيرات – مكة المكرمة",
        "title_en": "Two plots for sale in Al Buhayrat – Makkah",
        "summary_ar": "واجهات ممتازة وموقع مميز، فرصة استثمارية في قلب مكة المكرمة. السعر للقطعتين معًا.",
        "summary_en": "Excellent frontages in a prime location, an investment opportunity in the heart of Makkah. Price is for both plots together.",
        "city_ar": "مكة المكرمة", "city_en": "Makkah",
        "district_ar": "البحيرات", "district_en": "Al Buhayrat",
        "price": 8000000, "price_period": "total",
    },
]


def _done(row: SiteSettings, key: str) -> bool:
    return key in ((row.private or {}).get("_migrations") or [])


def _mark(row: SiteSettings, key: str) -> None:
    private = dict(row.private or {})
    private["_migrations"] = sorted(set((private.get("_migrations") or []) + [key]))
    row.private = private


def migrate_cms_v2(db: Session) -> None:
    row = db.get(SiteSettings, 1)
    if row is None or _done(row, "v2-positioning"):
        return
    data = dict(row.data or {})
    for key, (old_ar_values, new) in V2_COPY.items():
        cur = dict(data.get(key) or {})
        if not (cur.get("ar") or "").strip() or (cur.get("ar") or "").strip() in old_ar_values:
            data[key] = new
    if not data.get("aqar_url"):
        data["aqar_url"] = "https://sa.aqar.fm/user/410728"
    if not (data.get("coverage") or {}).get("ar"):
        data["coverage"] = _b("الرياض ومكة المكرمة", "Riyadh and Makkah")
    row.data = data

    existing = set(db.scalars(select(CmsService.slug)).all())
    for s in V2_SERVICES:
        if s["slug"] not in existing:
            db.add(CmsService(**s, published=True))
    have_listings = set(db.scalars(select(CmsListing.slug)).all())
    for i, item in enumerate(V2_LISTINGS):
        if item["slug"] not in have_listings:
            db.add(CmsListing(**item, sort_order=i, published=False))
    _mark(row, "v2-positioning")
    db.commit()


# ── v3: real office location from the company's Google Maps place ──
OFFICE_MAPS_URL = (
    "https://www.google.com/maps/place/Muktasabat+Real+Estate+Company/@24.8138198,46.7241149,17z/"
    "data=!4m6!3m5!1s0x3e2efc46bb9634d1:0x5a4621f8509aa4f3!8m2!3d24.8138003!4d46.7242436!16s%2Fg%2F1yg6nps7d"
)
OFFICE_LAT, OFFICE_LNG = 24.8138003, 46.7242436


def migrate_cms_v3(db: Session) -> None:
    row = db.get(SiteSettings, 1)
    if row is None or _done(row, "v3-office-map"):
        return
    data = dict(row.data or {})
    # Only replace the draft city-centre pin, never coordinates an editor set.
    if data.get("map_lat") in (None, SITE["map_lat"]) and data.get("map_lng") in (None, SITE["map_lng"]):
        data["map_lat"], data["map_lng"] = OFFICE_LAT, OFFICE_LNG
    if not data.get("maps_url"):
        data["maps_url"] = OFFICE_MAPS_URL
    row.data = data
    _mark(row, "v3-office-map")
    db.commit()


# ── v4: office hours confirmed by the company (Sat–Thu, 9 AM – 9 PM) ──
def migrate_cms_v4(db: Session) -> None:
    row = db.get(SiteSettings, 1)
    if row is None or _done(row, "v4-hours"):
        return
    data = dict(row.data or {})
    data["working_hours"] = SITE["working_hours"]
    row.data = data
    _mark(row, "v4-hours")
    db.commit()
