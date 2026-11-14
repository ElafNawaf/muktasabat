"""Data-management workbook specification (إدارة البيانات — تصدير / استيراد Excel).

Single source of truth for the admin bulk export / import:

* which entity sheets exist and in which order they are imported (parents first),
* every column: type, required-ness, length, numeric range, lookup list,
  foreign-key target and format rule,
* the lookup lists (enumerations) with Arabic / English labels.

The exporter builds the workbook from this spec and the importer validates
against exactly the same spec, so the file you download is always the file the
system accepts back. To add a column to the workbook, add one ``F(...)`` line
here — nothing else needs to change.

Lookup values mirror ``api/schemas/*`` Literals and the option lists used by the
web forms (``web/src/app/[locale]/(app)/**/…FormModal.tsx``). Keep them in sync.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from api import models as m
from api.hr_models import Attendance, HrProfile, HrRequest
from api.hr_people_models import HrAsset, HrCompany, HrContract, HrContractTemplate, HrDepartment, HrFamilyMember, HrPersonal
from api.routers.collections import CollectionAction
from api.maintenance_models import WorkOrder
from api.renewal_models import LeaseRenewal

FORMAT_VERSION = "muktasabat-data-v1"

# ══════════════════════════════════════════════════════════════════════════════
# Lookups (القوائم المرجعية)
# ══════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class Lookup:
    key: str
    label_en: str
    label_ar: str
    values: tuple[tuple[Any, str, str], ...]  # (stored value, English label, Arabic label)

    @property
    def allowed(self) -> list[Any]:
        return [v[0] for v in self.values]


def _lk(key: str, en: str, ar: str, *values: tuple[Any, str, str]) -> Lookup:
    return Lookup(key, en, ar, tuple(values))


LOOKUPS: dict[str, Lookup] = {
    lk.key: lk
    for lk in [
        _lk("party_type", "Party type", "نوع الطرف",
            ("individual", "Individual", "فرد"), ("company", "Company", "شركة")),
        _lk("id_type", "ID type (Ejar)", "نوع الهوية (إيجار)",
            ("national_id", "National ID", "هوية وطنية"),
            ("iqama", "Iqama", "إقامة"),
            ("gcc_id", "GCC ID", "هوية خليجية"),
            ("passport", "Passport", "جواز سفر"),
            ("visitor", "Visitor ID", "هوية زائر"),
            ("cr", "Commercial registration", "سجل تجاري"),
            ("endowment", "Endowment (Waqf)", "وقف")),
        _lk("building_contract_type", "Property contract type", "نوع عقد العقار",
            ("residential", "Residential", "سكني"), ("commercial", "Commercial", "تجاري"),
            ("mixed", "Mixed", "مختلط"), ("investment", "Investment", "استثماري")),
        _lk("property_type", "Property type", "نوع العقار",
            ("residential", "Residential", "سكني"),
            ("apartment_building", "Apartment building", "عمارة سكنية"),
            ("villa", "Villa", "فيلا"), ("office", "Office", "مكتب"),
            ("commercial", "Commercial", "تجاري"), ("warehouse", "Warehouse", "مستودع"),
            ("mixed", "Mixed", "مختلط"), ("land", "Land", "أرض"), ("other", "Other", "أخرى")),
        _lk("residence_type", "Residence type", "نوع السكن",
            ("singles", "Singles", "عزّاب"), ("families", "Families", "عائلات"),
            ("mixed", "Mixed", "مختلط")),
        _lk("deed_document_type", "Deed document type", "نوع الوثيقة",
            ("deed", "Deed", "صك"), ("title", "Title", "ملكية"),
            ("usufruct", "Usufruct", "حق انتفاع"), ("other", "Other", "أخرى")),
        _lk("unit_type", "Unit type", "نوع الوحدة",
            ("apartment", "Apartment", "شقة"), ("villa", "Villa", "فيلا"),
            ("office", "Office", "مكتب"), ("shop", "Shop", "محل"),
            ("warehouse", "Warehouse", "مستودع")),
        _lk("unit_usage", "Unit usage (Ejar)", "استخدام الوحدة (إيجار)",
            ("residential", "Residential", "سكني"), ("commercial", "Commercial", "تجاري"),
            ("office", "Office", "مكتبي"), ("warehouse", "Warehouse", "مستودع"),
            ("other", "Other", "أخرى")),
        _lk("lease_contract_type", "Contract type", "نوع العقد",
            ("residential", "Residential", "سكني"), ("commercial", "Commercial", "تجاري"),
            ("management", "Management", "إدارة")),
        _lk("validity_type", "Contract validity", "صلاحية العقد",
            ("fixed", "Fixed term", "محدّدة"), ("open", "Open", "مفتوحة")),
        _lk("payment_type", "Payment type", "نوع الدفعة",
            ("monthly", "Monthly", "شهرية"), ("quarterly", "Quarterly", "ربع سنوية"),
            ("semi-annual", "Semi-annual", "نصف سنوية"), ("annual", "Annual", "سنوية"),
            ("full", "Single payment", "دفعة واحدة")),
        _lk("payment_cycle", "Payment cycle (months)", "دورة الدفع (بالأشهر)",
            (1, "Every month", "كل شهر"), (3, "Every 3 months", "كل 3 أشهر"),
            (6, "Every 6 months", "كل 6 أشهر"), (12, "Every 12 months", "كل 12 شهر")),
        _lk("contract_status", "Lease status", "حالة العقد",
            ("active", "Active", "ساري"), ("expired", "Expired", "منتهي"),
            ("terminated", "Terminated", "منهي")),
        _lk("ejar_signatory", "Ejar signatory", "الطرف الموقّع في إيجار",
            ("landlord", "Landlord", "المالك"),
            ("property_manager", "Property manager (office)", "مدير الأملاك (المكتب)")),
        _lk("fee_type", "Management fee type", "نوع أتعاب الإدارة",
            ("percentage", "Percentage of rent collected", "نسبة من الإيجار المحصّل"),
            ("fixed", "Fixed annual amount", "مبلغ سنوي مقطوع")),
        _lk("fee_collection_method", "Fee collection method", "طريقة تحصيل الأتعاب",
            ("deduct_from_rent", "Deduct from collected rent", "خصم من التحصيل"),
            ("invoice_owner", "Invoice the owner", "فاتورة للمالك")),
        _lk("management_status", "Management contract status", "حالة عقد الإدارة",
            ("draft", "Draft", "مسودة"), ("active", "Active", "ساري"),
            ("expired", "Expired", "منتهي"), ("terminated", "Terminated", "منهي")),
        _lk("payment_status", "Payment status", "حالة الدفعة",
            ("pending", "Pending", "مستحقة"), ("paid", "Paid", "مدفوعة"),
            ("overdue", "Overdue", "متأخرة")),
        _lk("payment_method", "Payment method", "طريقة الدفع",
            ("bank_transfer", "Bank transfer", "تحويل بنكي"), ("cash", "Cash", "نقدي"),
            ("cheque", "Cheque", "شيك")),
        _lk("split_type", "Payment split type", "نوع توزيع الدفعة",
            ("owner_share", "Owner share", "حصة المالك"),
            ("management_fee", "Management fee", "أتعاب الإدارة"),
            ("agent_fee", "Agent fee", "عمولة الوسيط"),
            ("ejar_fee", "Ejar fee", "رسوم إيجار")),
        _lk("expense_category", "Expense category", "تصنيف المصروف",
            ("maintenance", "Maintenance", "صيانة"), ("utilities", "Utilities", "مرافق"),
            ("insurance", "Insurance", "تأمين"), ("legal", "Legal", "قانوني"),
            ("marketing", "Marketing", "تسويق"), ("cleaning", "Cleaning", "نظافة"),
            ("security", "Security", "أمن"),
            ("government_fees", "Government fees", "رسوم حكومية"), ("other", "Other", "أخرى")),
        _lk("paid_by", "Paid by", "المدفوع من",
            ("company", "Company", "الشركة"), ("owner", "Owner", "المالك"),
            ("tenant", "Tenant", "المستأجر")),
        _lk("boolean", "Yes / No", "نعم / لا",
            (True, "Yes", "نعم"), (False, "No", "لا")),
        # ── HR / group ERP ──
        _lk("employment_status", "Employment status", "الحالة الوظيفية",
            ("active", "Active", "على رأس العمل"), ("probation", "Probation", "فترة تجربة"),
            ("resigned", "Resigned", "مستقيل"), ("terminated", "Terminated", "منتهية خدمته"),
            ("excluded", "Excluded from HR", "مستبعد من الموارد البشرية")),
        _lk("employment_kind", "Employment type", "نوع التوظيف",
            ("full_time", "Full time", "دوام كامل"), ("part_time", "Part time", "دوام جزئي"),
            ("contractor", "Contractor", "متعاقد")),
        _lk("work_mode", "Work mode", "نمط العمل",
            ("office", "Office", "مكتبي"), ("hybrid", "Hybrid", "مرن"), ("remote", "Remote", "عن بُعد")),
        _lk("ticket_entitlement", "Ticket entitlement", "استحقاق التذاكر",
            ("none", "None", "لا يوجد"), ("annual", "Annual", "سنوي"), ("biennial", "Every 2 years", "كل سنتين")),
        _lk("travel_class", "Travel class", "درجة السفر",
            ("economy", "Economy", "سياحية"), ("business", "Business", "رجال أعمال"), ("first", "First", "أولى")),
        _lk("gender", "Gender", "الجنس", ("male", "Male", "ذكر"), ("female", "Female", "أنثى")),
        _lk("marital_status", "Marital status", "الحالة الاجتماعية",
            ("single", "Single", "أعزب"), ("married", "Married", "متزوج"),
            ("divorced", "Divorced", "مطلق"), ("widowed", "Widowed", "أرمل")),
        _lk("staff_id_type", "Staff ID type", "نوع هوية الموظف",
            ("national_id", "National ID", "هوية وطنية"), ("iqama", "Iqama", "إقامة")),
        _lk("family_relation", "Family relation", "صلة القرابة",
            ("spouse", "Spouse", "زوج/زوجة"), ("son", "Son", "ابن"), ("daughter", "Daughter", "ابنة"),
            ("father", "Father", "أب"), ("mother", "Mother", "أم"), ("brother", "Brother", "أخ"),
            ("sister", "Sister", "أخت"), ("other", "Other", "أخرى")),
        _lk("hr_contract_type", "Employment contract type", "نوع عقد العمل",
            ("fixed", "Fixed term", "محدد المدة"), ("unlimited", "Unlimited", "غير محدد المدة"),
            ("part_time", "Part time", "دوام جزئي"), ("temporary", "Temporary", "مؤقت")),
        _lk("collection_action", "Collection follow-up", "إجراء التحصيل",
            ("call", "Call", "اتصال"), ("no_answer", "No answer", "لم يرد"), ("whatsapp", "WhatsApp", "واتساب"),
            ("visit", "Visit", "زيارة"), ("promise", "Promise to pay", "وعد بالسداد"), ("dispute", "Dispute", "اعتراض"),
            ("escalate", "Escalated", "تصعيد"), ("note", "Note", "ملاحظة")),
        _lk("hr_signed_status", "Signed copy", "النسخة الموقعة",
            ("uploaded", "Uploaded, to verify", "مرفوعة بانتظار التحقق"), ("verified", "Verified", "معتمدة"), ("rejected", "Sent back", "أُعيدت")),
        _lk("hr_contract_status", "Employment contract status", "حالة عقد العمل",
            ("draft", "Draft", "مسودة"), ("pending_acceptance", "Waiting for the employee", "بانتظار قبول الموظف"),
            ("accepted", "Accepted (active)", "مقبول (ساري)"), ("terminated", "Terminated", "منتهي")),
        _lk("asset_kind", "Asset type", "نوع العهدة",
            ("laptop", "Laptop", "حاسب محمول"), ("desktop", "Desktop", "حاسب مكتبي"), ("phone", "Phone", "جوال"),
            ("tablet", "Tablet", "جهاز لوحي"), ("car", "Car", "سيارة"), ("sim", "SIM card", "شريحة اتصال"),
            ("cash", "Cash custody", "عهدة نقدية"), ("card", "Card", "بطاقة"), ("keys", "Keys", "مفاتيح"),
            ("uniform", "Uniform", "زي رسمي"), ("tools", "Tools", "أدوات"), ("other", "Other", "أخرى")),
        _lk("asset_status", "Asset status", "حالة العهدة",
            ("in_stock", "In stock", "في المخزن"), ("assigned", "Assigned", "مسلّمة لموظف"),
            ("maintenance", "In maintenance", "في الصيانة"), ("lost", "Lost", "مفقودة"), ("retired", "Retired", "مستبعدة")),
        _lk("asset_condition", "Asset condition", "حالة الجهاز",
            ("new", "New", "جديد"), ("good", "Good", "جيد"), ("fair", "Fair", "مقبول"), ("damaged", "Damaged", "تالف")),
        _lk("hr_request_kind", "HR request type", "نوع الطلب",
            ("leave", "Leave", "إجازة"), ("permission", "Permission", "استئذان"),
            ("ticket", "Travel ticket", "تذكرة سفر"), ("work_location", "Work location", "موقع عمل")),
        _lk("hr_request_status", "HR request status", "حالة الطلب",
            ("pending", "Pending", "بانتظار الاعتماد"), ("approved", "Approved", "معتمد"),
            ("rejected", "Rejected", "مرفوض"), ("cancelled", "Cancelled", "ملغى"), ("booked", "Booked", "محجوز")),
        _lk("leave_type", "Leave type", "نوع الإجازة",
            ("annual", "Annual", "سنوية"), ("sick", "Sick", "مرضية"), ("emergency", "Emergency", "اضطرارية"),
            ("unpaid", "Unpaid", "بدون راتب"), ("hajj", "Hajj", "حج"), ("marriage", "Marriage", "زواج"),
            ("bereavement", "Bereavement", "وفاة"), ("maternity", "Maternity", "أمومة"),
            ("paternity", "Paternity", "أبوة"), ("exam", "Exam", "اختبارات"), ("other", "Other", "أخرى")),
        _lk("permission_type", "Permission type", "نوع الاستئذان",
            ("late_arrival", "Late arrival", "تأخر صباحي"), ("early_leave", "Early leave", "خروج مبكر"),
            ("during_day", "During the day", "أثناء الدوام")),
        _lk("location_type", "Work location type", "نوع موقع العمل",
            ("remote", "Remote", "عن بُعد"), ("field", "Field visit", "زيارة ميدانية")),
        _lk("ticket_purpose", "Ticket purpose", "غرض التذكرة",
            ("annual_leave", "Annual leave", "إجازة سنوية"), ("business", "Business trip", "مهمة عمل"),
            ("exit_reentry", "Exit / re-entry", "خروج وعودة"), ("other", "Other", "أخرى")),
        _lk("attendance_source", "Attendance source", "مصدر التسجيل",
            ("web", "Portal", "البوابة"), ("manual", "Manual (HR)", "يدوي (الموارد البشرية)"), ("auto", "Automatic", "تلقائي")),
        _lk("attendance_mode", "Attendance mode", "نوع الحضور",
            ("office", "Office", "المكتب"), ("remote", "Remote", "عن بُعد"), ("field", "Field", "ميداني")),
        # ── Operations ──
        _lk("wo_category", "Work order category", "تصنيف طلب الصيانة",
            ("plumbing", "Plumbing", "سباكة"), ("electrical", "Electrical", "كهرباء"), ("ac", "Air conditioning", "تكييف"),
            ("carpentry", "Carpentry", "نجارة"), ("painting", "Painting", "دهان"), ("cleaning", "Cleaning", "نظافة"),
            ("pest", "Pest control", "مكافحة حشرات"), ("appliances", "Appliances", "أجهزة"),
            ("structural", "Structural", "إنشائي"), ("elevator", "Elevator", "مصاعد"),
            ("fire_safety", "Fire safety", "سلامة وحريق"), ("other", "Other", "أخرى")),
        _lk("wo_priority", "Work order priority", "أولوية الطلب",
            ("emergency", "Emergency", "طارئ"), ("high", "High", "عالية"), ("normal", "Normal", "عادية"), ("low", "Low", "منخفضة")),
        _lk("wo_status", "Work order status", "حالة طلب الصيانة",
            ("new", "New", "جديد"), ("assigned", "Assigned", "مُسند"), ("awaiting_approval", "Awaiting approval", "بانتظار الموافقة"),
            ("approved", "Approved", "معتمد"), ("rejected", "Rejected", "مرفوض"), ("in_progress", "In progress", "قيد التنفيذ"),
            ("completed", "Completed", "مكتمل"), ("closed", "Closed", "مغلق"), ("cancelled", "Cancelled", "ملغى")),
        _lk("charge_to", "Charged to", "على حساب",
            ("owner", "Owner", "المالك"), ("tenant", "Tenant", "المستأجر"), ("company", "Company", "الشركة")),
        _lk("reported_by", "Reported by", "مصدر البلاغ",
            ("staff", "Staff", "الموظفون"), ("tenant", "Tenant", "المستأجر"), ("owner", "Owner", "المالك"),
            ("inspection", "Inspection", "معاينة")),
        _lk("renewal_stage", "Renewal stage", "مرحلة التجديد",
            ("due", "Due", "مستحق"), ("contacted", "Contacted", "تم التواصل"), ("offer_sent", "Offer sent", "أُرسل العرض"),
            ("awaiting_owner", "Awaiting owner", "بانتظار المالك"), ("agreed", "Agreed", "متفق عليه"),
            ("renewed", "Renewed", "جُدّد"), ("lost", "Lost", "لم يُجدَّد")),
        _lk("tenant_intent", "Tenant intent", "نية المستأجر",
            ("unknown", "Unknown", "غير معروف"), ("renew", "Will renew", "سيجدد"),
            ("undecided", "Undecided", "متردد"), ("leave", "Leaving", "سيغادر")),
        _lk("lost_reason", "Reason not renewed", "سبب عدم التجديد",
            ("price", "Price", "السعر"), ("relocation", "Relocation", "انتقال"), ("bought_home", "Bought a home", "اشترى منزلًا"),
            ("dissatisfied", "Dissatisfied", "غير راضٍ"), ("owner_ending", "Owner ending lease", "المالك أنهى العقد"),
            ("other", "Other", "أخرى")),
    ]
}

# ══════════════════════════════════════════════════════════════════════════════
# Format rules (قواعد التنسيق)
# ══════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class Format:
    regex: re.Pattern
    example: str
    en: str
    ar: str


FORMATS: dict[str, Format] = {
    # Saudi mobile / landline / unified numbers, or any international number with "+".
    "phone": Format(
        re.compile(r"^(?:\+\d{9,15}|0\d{8,9}|9200\d{5}|800\d{7})$"),
        "0501234567",
        "Phone must be digits only: 05XXXXXXXX, 0XXXXXXXXX, 9200XXXXX, 800XXXXXXX or +<country code><number>",
        "رقم الجوال يجب أن يكون أرقامًا فقط بالصيغة 05XXXXXXXX أو 0XXXXXXXXX أو 9200XXXXX أو 800XXXXXXX أو +رمز الدولة",
    ),
    "email": Format(
        re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$"),
        "name@example.com",
        "Invalid e-mail address",
        "البريد الإلكتروني غير صحيح",
    ),
    # Saudi national ID (starts with 1) or Iqama (starts with 2), 10 digits.
    "saudi_id": Format(
        re.compile(r"^[12]\d{9}$"),
        "1012345678",
        "Must be a 10-digit Saudi ID / Iqama number starting with 1 or 2",
        "يجب أن يكون رقم هوية / إقامة من 10 أرقام يبدأ بـ 1 أو 2",
    ),
    # Passport / GCC / visitor / other identity documents.
    "doc_id": Format(
        re.compile(r"^[A-Za-z0-9]{5,20}$"),
        "A1234567",
        "Must be 5–20 letters or digits with no spaces",
        "يجب أن يكون من 5 إلى 20 حرفًا أو رقمًا بدون مسافات",
    ),
    "iban": Format(
        re.compile(r"^SA\d{22}$"),
        "SA0380000000608010167519",
        "IBAN must be 'SA' followed by 22 digits, no spaces",
        "الآيبان يجب أن يبدأ بـ SA متبوعًا بـ 22 رقمًا بدون مسافات",
    ),
    "cr": Format(
        re.compile(r"^\d{10}$"),
        "1010123456",
        "Commercial registration must be 10 digits",
        "السجل التجاري يجب أن يكون 10 أرقام",
    ),
    "vat": Format(
        re.compile(r"^3\d{13}3$"),
        "300000000000003",
        "VAT number must be 15 digits starting and ending with 3",
        "الرقم الضريبي يجب أن يكون 15 رقمًا يبدأ وينتهي بالرقم 3",
    ),
    "national_address": Format(
        re.compile(r"^[A-Z]{4}\d{4}$"),
        "RRRD2929",
        "Short national address must be 4 capital letters + 4 digits (e.g. RRRD2929)",
        "العنوان الوطني المختصر يجب أن يكون 4 أحرف إنجليزية كبيرة و4 أرقام (مثل RRRD2929)",
    ),
    "postal_code": Format(
        re.compile(r"^\d{5}$"), "12345",
        "Postal code must be 5 digits", "الرمز البريدي يجب أن يكون 5 أرقام",
    ),
    "four_digits": Format(
        re.compile(r"^\d{4}$"), "1234",
        "Must be exactly 4 digits", "يجب أن يكون 4 أرقام بالضبط",
    ),
}

# ══════════════════════════════════════════════════════════════════════════════
# Columns and sheets
# ══════════════════════════════════════════════════════════════════════════════

# kind: id | str | text | int | float | bool | date | datetime | enum | ref
_MISSING = object()


@dataclass(frozen=True)
class F:
    key: str
    en: str
    ar: str
    kind: str = "str"
    required: bool = False
    max_len: Optional[int] = None
    lookup: Optional[str] = None
    ref: Optional[str] = None
    min: Optional[float] = None
    max: Optional[float] = None
    gt: Optional[float] = None
    fmt: Optional[str] = None
    readonly: bool = False
    default: Any = _MISSING
    # Text code fields typed as numbers (e.g. an ID pasted as 1012345678) are
    # accepted and converted; phones are not, because Excel drops the leading 0.
    numeric_ok: bool = True
    width: int = 18

    @property
    def has_default(self) -> bool:
        return self.default is not _MISSING


@dataclass
class Sheet:
    key: str
    title: str  # Excel sheet name (≤ 31 chars)
    en: str
    ar: str
    model: Any
    fields: list[F]
    display: str = "name"
    reference_only: bool = False
    unique: list[tuple[str, ...]] = field(default_factory=list)
    # row-level business rules: fn(row_values, ctx) -> list[(col_key, en, ar)]
    rules: list[Callable] = field(default_factory=list)

    def get(self, key: str) -> F:
        for f_ in self.fields:
            if f_.key == key:
                return f_
        raise KeyError(key)

    @property
    def importable(self) -> list[F]:
        return [f_ for f_ in self.fields if not f_.readonly and f_.kind != "id"]


def _id() -> F:
    return F("id", "System ID (blank or NEW-… for new rows)", "المعرّف (فارغ أو NEW-… للسجل الجديد)", "id", width=12)


def _created() -> F:
    return F("created_at", "Created at", "تاريخ الإنشاء", "datetime", readonly=True, width=18)


def _notes(prefix: str = "notes") -> list[F]:
    return [
        F(prefix, "Notes", "ملاحظات", "text", width=30),
        F(f"{prefix}_en", "Notes (EN)", "ملاحظات (إنجليزي)", "text", width=30),
        F(f"{prefix}_ar", "Notes (AR)", "ملاحظات (عربي)", "text", width=30),
    ]


def _names(n: int = 150) -> list[F]:
    return [
        F("name", "Name", "الاسم", required=True, max_len=n, width=28),
        F("name_en", "Name (EN)", "الاسم (إنجليزي)", max_len=n, width=24),
        F("name_ar", "Name (AR)", "الاسم (عربي)", max_len=n, width=24),
    ]


def _money(key: str, en: str, ar: str, **kw) -> F:
    kw.setdefault("min", 0)
    return F(key, en, ar, "float", width=14, **kw)


def _pct(key: str, en: str, ar: str, **kw) -> F:
    return F(key, en, ar, "float", min=0, max=100, width=12, **kw)


def _phone(key: str = "phone", en: str = "Phone", ar: str = "الجوال", **kw) -> F:
    return F(key, en, ar, max_len=20, fmt="phone", numeric_ok=False, width=16, **kw)


def _email(key: str = "email", en: str = "E-mail", ar: str = "البريد الإلكتروني") -> F:
    return F(key, en, ar, max_len=120, fmt="email", width=24)


def _bool(key: str, en: str, ar: str, default: bool) -> F:
    return F(key, en, ar, "bool", lookup="boolean", default=default, width=12)


def _enum(key: str, en: str, ar: str, lookup: str, **kw) -> F:
    return F(key, en, ar, "enum", lookup=lookup, width=18, **kw)


def _ref(key: str, en: str, ar: str, target: str, **kw) -> F:
    return F(key, en, ar, "ref", ref=target, width=12, **kw)


def _address_fields() -> list[F]:
    return [
        F("national_address", "Short national address", "العنوان الوطني المختصر", max_len=120, fmt="national_address"),
        F("postal_code", "Postal code", "الرمز البريدي", max_len=10, fmt="postal_code", width=12),
        F("building_number", "Building no.", "رقم المبنى", max_len=10, fmt="four_digits", width=12),
        F("additional_number", "Additional no.", "الرقم الإضافي", max_len=10, fmt="four_digits", width=12),
    ]


# ── Row rules ────────────────────────────────────────────────────────────────

SAUDI_ID_TYPES = {"national_id", "iqama"}


def _id_number_rule(id_col: str, type_col: str = "id_type", required_for_individual: bool = False):
    """National ID / Iqama must match its ID type (1… for citizens, 2… for residents)."""

    def rule(row: dict, ctx) -> list:
        out = []
        number, id_type = row.get(id_col), row.get(type_col)
        party_type = row.get("owner_type") or row.get("tenant_type")
        if required_for_individual and party_type == "individual" and not number:
            out.append((id_col, "ID number is required for individuals", "رقم الهوية مطلوب للأفراد"))
        if not number:
            return out
        if id_type in SAUDI_ID_TYPES:
            if not FORMATS["saudi_id"].regex.match(number):
                out.append((id_col, FORMATS["saudi_id"].en, FORMATS["saudi_id"].ar))
            elif id_type == "national_id" and not number.startswith("1"):
                out.append((id_col, "A Saudi national ID starts with 1 (use id_type 'iqama' for 2…)",
                            "الهوية الوطنية تبدأ بالرقم 1 (استخدم نوع الهوية 'إقامة' للأرقام التي تبدأ بـ 2)"))
            elif id_type == "iqama" and not number.startswith("2"):
                out.append((id_col, "An Iqama number starts with 2", "رقم الإقامة يبدأ بالرقم 2"))
        elif id_type == "cr":
            if not FORMATS["cr"].regex.match(number):
                out.append((id_col, FORMATS["cr"].en, FORMATS["cr"].ar))
        elif not FORMATS["doc_id"].regex.match(number):
            out.append((id_col, FORMATS["doc_id"].en, FORMATS["doc_id"].ar))
        return out

    return rule


def _company_rule(type_col: str):
    def rule(row: dict, ctx) -> list:
        out = []
        if row.get(type_col) == "company":
            if not row.get("cr_number"):
                out.append(("cr_number", "Commercial registration is required for companies",
                            "السجل التجاري مطلوب للشركات"))
            if not row.get("representative_name"):
                out.append(("representative_name", "Representative name is required for companies",
                            "اسم الممثل مطلوب للشركات"))
        return out

    return rule


def _rep_id_rule(row: dict, ctx) -> list:
    v = row.get("representative_national_id")
    if v and not FORMATS["saudi_id"].regex.match(v):
        return [("representative_national_id", FORMATS["saudi_id"].en, FORMATS["saudi_id"].ar)]
    return []


def _dates_rule(start: str, end: str):
    def rule(row: dict, ctx) -> list:
        s, e = row.get(start), row.get(end)
        if s and e and e <= s:
            return [(end, f"{end} must be after {start}", "تاريخ النهاية يجب أن يكون بعد تاريخ البداية")]
        return []

    return rule


def _fee_rule(row: dict, ctx) -> list:
    if row.get("fee_type") == "percentage" and not (row.get("fee_percentage") or 0) > 0:
        return [("fee_percentage", "fee_percentage must be greater than 0 for percentage fees",
                 "نسبة الأتعاب يجب أن تكون أكبر من صفر عند اختيار النسبة")]
    if row.get("fee_type") == "fixed" and not (row.get("fee_fixed_amount") or 0) > 0:
        return [("fee_fixed_amount", "fee_fixed_amount must be greater than 0 for fixed fees",
                 "المبلغ المقطوع يجب أن يكون أكبر من صفر")]
    return []


def _lease_rule(row: dict, ctx) -> list:
    out = []
    if row.get("contract_type") in ("residential", "commercial"):
        if row.get("tenant_id") is None:
            out.append(("tenant_id", "Tenant is required for residential / commercial leases",
                        "المستأجر مطلوب لعقود الإيجار السكنية والتجارية"))
        if not (row.get("rent_amount") or 0) > 0:
            out.append(("rent_amount", "Rent amount must be greater than 0 for leases",
                        "قيمة الإيجار يجب أن تكون أكبر من صفر لعقود الإيجار"))
    elif row.get("contract_type") == "management" and row.get("tenant_id") is not None:
        out.append(("tenant_id", "A management-type contract has no tenant — leave it blank",
                    "عقد الإدارة لا يحتوي على مستأجر — اترك الحقل فارغًا"))
    return out


def _lease_mandate_rule(row: dict, ctx) -> list:
    """Mirror api.routers.contracts._validate_management_link on the final data."""
    mc_ref, unit_ref = row.get("management_contract_id"), row.get("unit_id")
    if mc_ref is None or unit_ref is None:
        return []
    mandate = ctx.record("management_contracts", mc_ref)
    unit = ctx.record("units", unit_ref)
    if not mandate or not unit:
        return []
    building = ctx.record("buildings", unit.get("building_id"))
    if not building:
        return []
    if ctx.same(building.get("owner_id"), mandate.get("owner_id")) is False:
        return [("management_contract_id",
                 "The management contract belongs to a different owner than this unit's property",
                 "عقد الإدارة يخص مالكًا غير مالك عقار هذه الوحدة")]
    entries = ctx.children("management_contract_properties", "management_contract_id", mc_ref)
    if entries:
        covered = any(
            ctx.same(e.get("building_id"), unit.get("building_id"))
            and (e.get("unit_id") is None or ctx.same(e.get("unit_id"), unit_ref))
            for e in entries
        )
        if not covered:
            return [("management_contract_id",
                     "This unit is not part of the selected management contract's portfolio",
                     "هذه الوحدة ليست ضمن العقارات المشمولة بعقد الإدارة المحدد")]
    return []


def _mcp_rule(row: dict, ctx) -> list:
    out = []
    unit = ctx.record("units", row.get("unit_id")) if row.get("unit_id") is not None else None
    if unit is not None and ctx.same(unit.get("building_id"), row.get("building_id")) is False:
        out.append(("unit_id", "The unit does not belong to this property",
                    "الوحدة لا تتبع هذا العقار"))
    mandate = ctx.record("management_contracts", row.get("management_contract_id"))
    building = ctx.record("buildings", row.get("building_id"))
    if mandate and building and ctx.same(mandate.get("owner_id"), building.get("owner_id")) is False:
        out.append(("building_id", "The property belongs to a different owner than the management contract",
                    "العقار يخص مالكًا غير مالك عقد الإدارة"))
    return out


def _expense_rule(row: dict, ctx) -> list:
    out = []
    o, b, u = row.get("owner_id"), row.get("building_id"), row.get("unit_id")
    if o is None and b is None and u is None:
        out.append(("owner_id", "Link the expense to an owner, a property or a unit",
                    "اربط المصروف بمالك أو عقار أو وحدة"))
    unit = ctx.record("units", u) if u is not None else None
    if unit and b is not None and ctx.same(unit.get("building_id"), b) is False:
        out.append(("unit_id", "The unit does not belong to this property", "الوحدة لا تتبع هذا العقار"))
    building = ctx.record("buildings", b) if b is not None else None
    if building and o is not None and ctx.same(building.get("owner_id"), o) is False:
        out.append(("building_id", "The property belongs to a different owner", "العقار يخص مالكًا آخر"))
    return out


def _paid_rule(row: dict, ctx) -> list:
    if row.get("status") == "paid" and not row.get("paid_date"):
        return [("paid_date", "paid_date is required when status is 'paid'",
                 "تاريخ السداد مطلوب عندما تكون الحالة 'مدفوعة'")]
    return []


# ── Sheets, in import (dependency) order ─────────────────────────────────────

def _hr_profile_rule(row: dict, ctx) -> list:
    v = row.get("remote_days")
    if v and not re.fullmatch(r"[0-6](,[0-6])*", v.replace(" ", "")):
        return [("remote_days", "Remote days must be weekday numbers 0–6 separated by commas (e.g. 0,2)",
                 "أيام العمل عن بعد أرقام من 0 إلى 6 مفصولة بفواصل (مثل 0,2)")]
    return []


def _asset_rule(row: dict, ctx) -> list:
    if row.get("status") == "assigned" and row.get("assigned_user_id") is None:
        return [("assigned_user_id", "An assigned asset needs the employee it is assigned to",
                 "العهدة المسلّمة تحتاج تحديد الموظف المستلم")]
    return []


def _hr_request_rule(row: dict, ctx) -> list:
    out = []
    kind = row.get("kind")
    s, e = row.get("start_date"), row.get("end_date")
    if s and e and e < s:
        out.append(("end_date", "End date is before the start date", "تاريخ النهاية قبل تاريخ البداية"))
    if kind == "leave":
        if not row.get("leave_type"):
            out.append(("leave_type", "Leave type is required for leave requests", "نوع الإجازة مطلوب"))
        if not s or not e:
            out.append(("start_date", "Leave needs a start and an end date", "الإجازة تحتاج تاريخ بداية ونهاية"))
    elif kind == "permission" and not row.get("permission_type"):
        out.append(("permission_type", "Permission type is required", "نوع الاستئذان مطلوب"))
    elif kind == "work_location" and not row.get("location_type"):
        out.append(("location_type", "Work location type is required", "نوع موقع العمل مطلوب"))
    return out


def _attendance_rule(row: dict, ctx) -> list:
    i, o = row.get("check_in"), row.get("check_out")
    if o and not i:
        return [("check_in", "A check-out needs a check-in", "لا يمكن تسجيل انصراف بدون حضور")]
    if i and o and o <= i:
        return [("check_out", "Check-out must be after check-in", "وقت الانصراف يجب أن يكون بعد الحضور")]
    return []


SHEETS: list[Sheet] = [
    Sheet(
        "users", "Users", "Users (reference only)", "المستخدمون (للاطلاع فقط)", m.User,
        [
            _id(),
            F("username", "Username", "اسم المستخدم", readonly=True, width=20),
            F("email", "E-mail", "البريد الإلكتروني", readonly=True, width=26),
            F("role", "Role", "الدور", readonly=True, width=14),
        ],
        display="username",
        reference_only=True,
    ),
    Sheet(
        "agents", "Agents", "Agents / brokers", "الوسطاء", m.Agent,
        [
            _id(), *_names(150), _phone(), _email(),
            F("national_id", "National ID / Iqama", "رقم الهوية / الإقامة", max_len=20, fmt="saudi_id"),
            F("bank_name", "Bank", "البنك", max_len=100),
            F("iban", "IBAN", "الآيبان", max_len=34, fmt="iban", width=28),
            *_notes(), _created(),
        ],
        unique=[("national_id",)],
    ),
    Sheet(
        "owners", "Owners", "Owners", "الملاك", m.Owner,
        [
            _id(),
            _enum("owner_type", "Owner type", "نوع المالك", "party_type", required=True, default="individual"),
            *_names(150),
            _ref("agent_id", "Agent", "الوسيط", "agents"),
            _phone(), _email(),
            _enum("id_type", "ID type", "نوع الهوية", "id_type", required=True, default="national_id"),
            F("national_id", "ID number", "رقم الهوية", max_len=20),
            F("id_expiry_date", "ID expiry date", "تاريخ انتهاء الهوية", "date"),
            F("date_of_birth", "Date of birth", "تاريخ الميلاد", "date"),
            F("nationality", "Nationality", "الجنسية", max_len=60),
            _phone("absher_phone", "Absher phone", "جوال أبشر"),
            F("national_address", "Short national address", "العنوان الوطني المختصر", max_len=120, fmt="national_address"),
            F("cr_number", "Commercial registration", "السجل التجاري", max_len=20, fmt="cr"),
            F("representative_name", "Representative name", "اسم الممثل", max_len=150),
            F("representative_national_id", "Representative ID", "هوية الممثل", max_len=20),
            F("representative_date_of_birth", "Representative date of birth", "تاريخ ميلاد الممثل", "date"),
            _phone("representative_phone", "Representative phone", "جوال الممثل"),
            F("bank_name", "Bank", "البنك", max_len=100),
            F("iban", "IBAN", "الآيبان", max_len=34, fmt="iban", width=28),
            F("ejar_party_id", "Ejar party ID", "معرّف الطرف في إيجار", max_len=50),
            *_notes(), _created(),
        ],
        unique=[("national_id",), ("cr_number",)],
        rules=[
            _id_number_rule("national_id", required_for_individual=True),
            _company_rule("owner_type"),
            _rep_id_rule,
        ],
    ),
    Sheet(
        "management_companies", "Establishment", "Establishment (management company)",
        "المنشأة العقارية", m.ManagementCompany,
        [
            _id(),
            F("name", "Name", "الاسم", required=True, max_len=200, width=28),
            F("name_en", "Name (EN)", "الاسم (إنجليزي)", max_len=200, width=24),
            F("name_ar", "Name (AR)", "الاسم (عربي)", max_len=200, width=24),
            F("cr_number", "Commercial registration", "السجل التجاري", max_len=20, fmt="cr"),
            F("cr_issue_date", "CR issue date", "تاريخ إصدار السجل", "date"),
            F("cr_expiry_date", "CR expiry date", "تاريخ انتهاء السجل", "date"),
            F("vat_number", "VAT number", "الرقم الضريبي", max_len=30, fmt="vat"),
            F("fal_license_number", "FAL brokerage licence", "رخصة فال للوساطة", max_len=40),
            F("fal_license_expiry", "FAL licence expiry", "انتهاء رخصة فال", "date"),
            F("fal_management_license_number", "FAL management licence", "رخصة فال لإدارة الأملاك", max_len=40),
            F("fal_management_license_expiry", "FAL management licence expiry", "انتهاء رخصة إدارة الأملاك", "date"),
            F("ejar_establishment_id", "Ejar establishment ID", "معرّف المنشأة في إيجار", max_len=50),
            F("ejar_branch_id", "Ejar branch ID", "معرّف الفرع في إيجار", max_len=50),
            _phone(), _email(),
            F("city", "City", "المدينة", max_len=100),
            F("district", "District", "الحي", max_len=100),
            F("street", "Street", "الشارع", max_len=200),
            *_address_fields(),
            F("representative_name", "Representative name", "اسم المفوّض", max_len=150),
            F("representative_national_id", "Representative ID", "هوية المفوّض", max_len=20, fmt="saudi_id"),
            _phone("representative_phone", "Representative phone", "جوال المفوّض"),
            _email("representative_email", "Representative e-mail", "بريد المفوّض"),
            F("bank_name", "Bank", "البنك", max_len=100),
            F("iban", "IBAN", "الآيبان", max_len=34, fmt="iban", width=28),
            _bool("is_active", "Active", "فعّالة", True),
            F("notes", "Notes", "ملاحظات", "text", width=30),
            _created(),
        ],
        rules=[_dates_rule("cr_issue_date", "cr_expiry_date")],
    ),
    Sheet(
        "employees", "Employees", "Employees", "الموظفون", m.Employee,
        [
            _id(),
            _ref("user_id", "User account", "حساب المستخدم", "users", required=True),
            F("name", "Name", "الاسم", required=True, max_len=120, width=26),
            F("name_en", "Name (EN)", "الاسم (إنجليزي)", max_len=120, width=22),
            F("name_ar", "Name (AR)", "الاسم (عربي)", max_len=120, width=22),
            _phone(),
            _created(),
        ],
        unique=[("user_id",)],
    ),
    Sheet(
        "buildings", "Properties", "Properties (buildings)", "العقارات", m.Building,
        [
            _id(),
            _ref("owner_id", "Owner", "المالك", "owners", required=True),
            _ref("assignee_id", "Assigned user", "الموظف المسؤول", "users"),
            *_names(150),
            F("building_code", "Property code", "كود العقار", max_len=50),
            _enum("property_type", "Property type", "نوع العقار", "property_type"),
            _enum("contract_type", "Contract type", "نوع العقد", "building_contract_type"),
            _enum("residence_type", "Residence type", "نوع السكن", "residence_type"),
            F("branch", "Branch", "الفرع", max_len=100),
            F("water_meter_number", "Water meter no.", "رقم عداد المياه", max_len=50),
            F("electricity_meter_number", "Electricity meter no.", "رقم عداد الكهرباء", max_len=50),
            F("lease_contract_number", "Ejar lease contract no.", "رقم عقد الإيجار", max_len=50),
            F("city", "City", "المدينة", max_len=100),
            F("city_en", "City (EN)", "المدينة (إنجليزي)", max_len=100),
            F("city_ar", "City (AR)", "المدينة (عربي)", max_len=100),
            F("district", "District", "الحي", max_len=100),
            F("district_en", "District (EN)", "الحي (إنجليزي)", max_len=100),
            F("district_ar", "District (AR)", "الحي (عربي)", max_len=100),
            F("street", "Street", "الشارع", max_len=200),
            *_address_fields(),
            F("address", "Address", "العنوان", max_len=300, width=30),
            F("address_en", "Address (EN)", "العنوان (إنجليزي)", max_len=300, width=30),
            F("address_ar", "Address (AR)", "العنوان (عربي)", max_len=300, width=30),
            F("latitude", "Latitude", "خط العرض", "float", min=-90, max=90),
            F("longitude", "Longitude", "خط الطول", "float", min=-180, max=180),
            F("deed_number", "Deed number", "رقم الصك", max_len=50),
            _enum("deed_document_type", "Document type", "نوع الوثيقة", "deed_document_type"),
            F("deed_date", "Deed date", "تاريخ الصك", "date"),
            F("deed_document_number", "Document number", "رقم الوثيقة", max_len=50),
            F("ejar_property_id", "Ejar property ID", "معرّف العقار في إيجار", max_len=50),
            F("offices_count", "Offices", "عدد المكاتب", "int", min=0, default=0, width=10),
            F("commercial_shops_count", "Shops", "عدد المحلات", "int", min=0, default=0, width=10),
            F("apartments_count", "Apartments", "عدد الشقق", "int", min=0, default=0, width=10),
            *_notes(), _created(),
        ],
        unique=[("building_code",)],
    ),
    Sheet(
        "units", "Units", "Units", "الوحدات", m.Unit,
        [
            _id(),
            _ref("building_id", "Property", "العقار", "buildings", required=True),
            F("name", "Name", "الاسم", required=True, max_len=100, width=22),
            F("name_en", "Name (EN)", "الاسم (إنجليزي)", max_len=100, width=20),
            F("name_ar", "Name (AR)", "الاسم (عربي)", max_len=100, width=20),
            F("number", "Unit number", "رقم الوحدة", required=True, max_len=50, width=12),
            _enum("unit_type", "Unit type", "نوع الوحدة", "unit_type"),
            _enum("usage_type", "Usage (Ejar)", "الاستخدام (إيجار)", "unit_usage"),
            F("area_sqm", "Area (m²)", "المساحة (م²)", "float", min=0, width=12),
            _money("rent_amount", "Monthly rent", "الإيجار الشهري", default=0),
            _pct("management_percentage", "Management %", "نسبة الإدارة %", default=0),
            F("agent_name", "Agent name", "اسم الوسيط", max_len=150),
            _pct("agent_percentage", "Agent %", "نسبة الوسيط %", default=0),
            F("electric_invoice", "Electricity account", "حساب الكهرباء", max_len=50),
            F("water_invoice", "Water account", "حساب المياه", max_len=50),
            _money("ejar_fee", "Ejar fee", "رسوم إيجار", default=0),
            F("ejar_unit_id", "Ejar unit ID", "معرّف الوحدة في إيجار", max_len=50),
            F("rooms_count", "Rooms", "عدد الغرف", "int", min=0, max=99, width=10),
            F("bathrooms_count", "Bathrooms", "دورات المياه", "int", min=0, max=99, width=10),
            _bool("is_furnished", "Furnished", "مفروشة", False),
            _bool("is_available", "Available", "متاحة", True),
            *_notes(), _created(),
        ],
        display="name",
        unique=[("building_id", "number")],
    ),
    Sheet(
        "tenants", "Tenants", "Tenants", "المستأجرون", m.Tenant,
        [
            _id(),
            _enum("tenant_type", "Tenant type", "نوع المستأجر", "party_type", required=True, default="individual"),
            *_names(150),
            _phone(required=True),
            _enum("id_type", "ID type", "نوع الهوية", "id_type", required=True, default="national_id"),
            F("national_id", "ID number", "رقم الهوية", required=True, max_len=20),
            F("id_expiry_date", "ID expiry date", "تاريخ انتهاء الهوية", "date"),
            F("date_of_birth", "Date of birth", "تاريخ الميلاد", "date"),
            F("nationality", "Nationality", "الجنسية", max_len=60),
            _email(),
            _phone("absher_phone", "Absher phone", "جوال أبشر"),
            F("national_address", "Short national address", "العنوان الوطني المختصر", max_len=120, fmt="national_address"),
            F("cr_number", "Commercial registration", "السجل التجاري", max_len=20, fmt="cr"),
            F("cr_date", "CR date", "تاريخ السجل", "date"),
            F("representative_name", "Representative name", "اسم الممثل", max_len=150),
            F("representative_national_id", "Representative ID", "هوية الممثل", max_len=20),
            F("representative_date_of_birth", "Representative date of birth", "تاريخ ميلاد الممثل", "date"),
            F("tax_number", "VAT number", "الرقم الضريبي", max_len=30, fmt="vat"),
            F("ejar_party_id", "Ejar party ID", "معرّف الطرف في إيجار", max_len=50),
            *_notes(), _created(),
        ],
        unique=[("national_id",)],
        rules=[_id_number_rule("national_id"), _company_rule("tenant_type"), _rep_id_rule],
    ),
    Sheet(
        "tenant_companions", "Tenant companions", "Tenant companions", "مرافقو المستأجرين",
        m.TenantCompanion,
        [
            _id(),
            _ref("tenant_id", "Tenant", "المستأجر", "tenants", required=True),
            F("name", "Name", "الاسم", required=True, max_len=150, width=26),
            F("national_id", "ID number", "رقم الهوية", required=True, max_len=20, fmt="saudi_id"),
            F("date_of_birth", "Date of birth", "تاريخ الميلاد", "date"),
        ],
        unique=[("tenant_id", "national_id")],
    ),
    Sheet(
        "management_contracts", "Management contracts", "Management contracts (owner ↔ office)",
        "عقود إدارة الأملاك", m.ManagementContract,
        [
            _id(),
            F("contract_number", "Contract number", "رقم العقد", required=True, max_len=50),
            _ref("owner_id", "Owner", "المالك", "owners", required=True),
            _ref("company_id", "Establishment", "المنشأة", "management_companies"),
            F("ejar_contract_number", "Ejar contract no.", "رقم العقد في إيجار", max_len=50),
            F("branch", "Branch", "الفرع", max_len=100),
            F("contract_date", "Contract date", "تاريخ التحرير", "date"),
            F("start_date", "Start date", "تاريخ البداية", "date", required=True),
            F("end_date", "End date", "تاريخ النهاية", "date", required=True),
            F("duration_months", "Duration (months)", "المدة (بالأشهر)", "int", min=1, default=12),
            _bool("auto_renew", "Auto renew", "تجديد تلقائي", False),
            F("notice_period_days", "Notice period (days)", "مدة الإشعار (أيام)", "int", min=0, max=365, default=30),
            _enum("fee_type", "Fee type", "نوع الأتعاب", "fee_type", required=True, default="percentage"),
            _pct("fee_percentage", "Fee %", "نسبة الأتعاب %", default=0),
            _money("fee_fixed_amount", "Fixed annual fee", "الأتعاب السنوية المقطوعة", default=0),
            _enum("fee_collection_method", "Fee collection", "طريقة التحصيل", "fee_collection_method",
                  required=True, default="deduct_from_rent"),
            _pct("vat_rate", "VAT %", "الضريبة %", default=15),
            F("payout_cycle_months", "Payout cycle (months)", "دورية التحويل (أشهر)", "int", min=1, max=12, default=1),
            _bool("can_market_units", "Can market units", "التسويق", True),
            _bool("can_sign_leases", "Can sign leases", "توقيع عقود الإيجار", True),
            _bool("can_collect_rent", "Can collect rent", "تحصيل الإيجارات", True),
            _bool("can_evict", "Can evict", "الإخلاء", False),
            _bool("can_maintain", "Can maintain", "الصيانة", True),
            _money("maintenance_limit_amount", "Maintenance limit", "سقف الصيانة", default=0),
            _bool("can_pay_utilities", "Can pay utilities", "سداد الخدمات", False),
            _enum("status", "Status", "الحالة", "management_status", required=True, default="active"),
            F("notes", "Notes", "ملاحظات", "text", width=30),
            _money("estimated_annual_fee", "Estimated annual fee (calculated)", "الأتعاب السنوية (محسوبة)", readonly=True),
            _money("vat_amount", "VAT (calculated)", "الضريبة (محسوبة)", readonly=True),
            _money("total_fee_amount", "Total fee (calculated)", "إجمالي الأتعاب (محسوب)", readonly=True),
            F("ejar_status", "Ejar status", "حالة إيجار", readonly=True, width=12),
            F("ejar_reference", "Ejar reference", "مرجع إيجار", readonly=True),
            F("ejar_registered_at", "Ejar registered at", "تاريخ التسجيل في إيجار", "datetime", readonly=True),
            _created(),
        ],
        display="contract_number",
        unique=[("contract_number",)],
        rules=[_dates_rule("start_date", "end_date"), _fee_rule],
    ),
    Sheet(
        "management_contract_properties", "Managed properties",
        "Properties under management contracts", "العقارات المشمولة بعقود الإدارة",
        m.ManagementContractProperty,
        [
            _id(),
            _ref("management_contract_id", "Management contract", "عقد الإدارة", "management_contracts", required=True),
            _ref("building_id", "Property", "العقار", "buildings", required=True),
            _ref("unit_id", "Unit (blank = whole property)", "الوحدة (فارغ = كامل العقار)", "units"),
            _pct("fee_percentage_override", "Fee % override", "نسبة أتعاب خاصة %"),
            _created(),
        ],
        display="id",
        unique=[("management_contract_id", "building_id", "unit_id")],
        rules=[_mcp_rule],
    ),
    Sheet(
        "contracts", "Lease contracts", "Lease contracts (owner ↔ tenant)", "عقود الإيجار", m.Contract,
        [
            _id(),
            F("contract_number", "Contract number", "رقم العقد", required=True, max_len=50),
            _enum("contract_type", "Contract type", "نوع العقد", "lease_contract_type", required=True, default="residential"),
            _ref("unit_id", "Unit", "الوحدة", "units", required=True),
            _ref("tenant_id", "Tenant", "المستأجر", "tenants"),
            _ref("management_contract_id", "Management contract", "عقد الإدارة", "management_contracts"),
            _ref("agent_id", "Agent", "الوسيط", "agents"),
            F("branch", "Branch", "الفرع", max_len=100),
            _enum("validity_type", "Validity", "صلاحية العقد", "validity_type"),
            F("start_date", "Start date", "تاريخ البداية", "date", required=True),
            F("end_date", "End date", "تاريخ النهاية", "date", required=True),
            F("duration_years", "Duration (years)", "المدة (سنوات)", "int", min=0, default=1, width=10),
            F("duration_months", "Duration (months)", "المدة (أشهر)", "int", min=0, max=11, default=0, width=10),
            F("duration_days", "Duration (days)", "المدة (أيام)", "int", min=0, max=30, default=0, width=10),
            _money("total_rent_amount", "Total rent (full term)", "إجمالي الإيجار لكامل المدة", default=0),
            _money("rent_amount", "Rent per payment", "قيمة الدفعة", required=True),
            F("ejar_contract_number", "Ejar contract no.", "رقم العقد في إيجار", max_len=50),
            _enum("payment_type", "Payment type", "نوع الدفعة", "payment_type"),
            F("payment_count", "Number of payments", "عدد الدفعات", "int", min=1, default=1, width=10),
            F("payment_cycle", "Payment cycle (months)", "دورة الدفع (أشهر)", "enum", lookup="payment_cycle", required=True, width=12),
            _bool("electricity_on_tenant", "Electricity on tenant", "الكهرباء على المستأجر", True),
            _pct("electricity_split_percentage", "Electricity split %", "نسبة تقسيم الكهرباء %"),
            _bool("water_on_tenant", "Water on tenant", "الماء على المستأجر", True),
            _pct("water_split_percentage", "Water split %", "نسبة تقسيم الماء %"),
            _money("electricity_amount", "Electricity amount", "مبلغ الكهرباء", default=0),
            _money("water_amount", "Water amount", "مبلغ الماء", default=0),
            F("electricity_meter_number", "Electricity meter no.", "رقم عداد الكهرباء", max_len=50),
            F("water_meter_number", "Water meter no.", "رقم عداد المياه", max_len=50),
            _money("services_amount", "Services", "الخدمات", default=0),
            _money("insurance_amount", "Deposit / insurance", "التأمين", default=0),
            _pct("vat_rate", "VAT %", "الضريبة %", default=15),
            _pct("agent_percentage", "Agent %", "نسبة الوسيط %", default=0),
            _pct("management_percentage", "Management %", "نسبة الإدارة %", default=0),
            _enum("ejar_signed_by", "Ejar signatory", "الموقّع في إيجار", "ejar_signatory", required=True, default="property_manager"),
            _money("ejar_registration_fee", "Ejar registration fee", "رسوم التسجيل في إيجار", default=0),
            _enum("status", "Status", "الحالة", "contract_status", required=True, default="active"),
            F("notes", "Notes", "ملاحظات", "text", width=30),
            _money("vat_amount", "VAT (calculated)", "الضريبة (محسوبة)", readonly=True),
            _money("total_amount", "Contract total (calculated)", "إجمالي العقد (محسوب)", readonly=True),
            F("ejar_status", "Ejar status", "حالة إيجار", readonly=True, width=12),
            F("ejar_reference", "Ejar reference", "مرجع إيجار", readonly=True),
            F("ejar_registered_at", "Ejar registered at", "تاريخ التسجيل في إيجار", "datetime", readonly=True),
            _created(),
        ],
        display="contract_number",
        unique=[("contract_number",)],
        rules=[_dates_rule("start_date", "end_date"), _lease_rule, _lease_mandate_rule],
    ),
    Sheet(
        "payments", "Payments", "Rent payments", "دفعات الإيجار", m.Payment,
        [
            _id(),
            _ref("contract_id", "Lease contract", "عقد الإيجار", "contracts", required=True),
            _money("amount", "Amount", "المبلغ", required=True, min=None, gt=0),
            F("due_date", "Due date", "تاريخ الاستحقاق", "date", required=True),
            F("paid_date", "Paid date", "تاريخ السداد", "date"),
            _enum("status", "Status", "الحالة", "payment_status", required=True, default="pending"),
            _enum("payment_method", "Method", "طريقة الدفع", "payment_method"),
            F("receipt_number", "Receipt no.", "رقم السند", max_len=50),
            F("notes", "Notes", "ملاحظات", "text", width=30),
            _created(),
        ],
        display="due_date",
        rules=[_paid_rule],
    ),
    Sheet(
        "payment_splits", "Payment splits", "Payment splits", "توزيع الدفعات", m.PaymentSplit,
        [
            _id(),
            _ref("payment_id", "Payment", "الدفعة", "payments", required=True),
            _enum("split_type", "Split type", "نوع التوزيع", "split_type", required=True),
            _money("amount", "Amount", "المبلغ", required=True),
            F("description", "Description", "الوصف", max_len=200, width=30),
        ],
        display="id",
    ),
    Sheet(
        "expenses", "Expenses", "Expenses", "المصروفات", m.Expense,
        [
            _id(),
            _ref("owner_id", "Owner", "المالك", "owners"),
            _ref("building_id", "Property", "العقار", "buildings"),
            _ref("unit_id", "Unit", "الوحدة", "units"),
            _enum("category", "Category", "التصنيف", "expense_category", required=True),
            F("description", "Description", "الوصف", required=True, max_len=300, width=30),
            F("description_en", "Description (EN)", "الوصف (إنجليزي)", max_len=300, width=30),
            F("description_ar", "Description (AR)", "الوصف (عربي)", max_len=300, width=30),
            _money("amount", "Amount", "المبلغ", required=True, min=None, gt=0),
            F("expense_date", "Expense date", "تاريخ المصروف", "date", required=True),
            _enum("paid_by", "Paid by", "المدفوع من", "paid_by", required=True, default="company"),
            F("receipt_number", "Receipt no.", "رقم السند", max_len=50),
            F("vendor_name", "Vendor", "المورّد", max_len=150),
            F("notes", "Notes", "ملاحظات", "text", width=30),
            _created(),
        ],
        display="description",
        rules=[_expense_rule],
    ),
    # ══ HR / group ERP (الموارد البشرية — نظام موحد للمجموعة) ══
    Sheet(
        "hr_companies", "Group companies", "Group companies (holding & subsidiaries)", "شركات المجموعة", HrCompany,
        [
            _id(),
            F("name_ar", "Name (AR)", "الاسم (عربي)", required=True, max_len=160, width=26),
            F("name_en", "Name (EN)", "الاسم (إنجليزي)", max_len=160, width=24),
            F("short_code", "Short code", "الرمز المختصر", max_len=10, width=12),
            _bool("is_holding", "Holding company", "الشركة القابضة", False),
            _ref("parent_id", "Parent company", "الشركة الأم", "hr_companies"),
            F("cr_number", "Commercial registration", "السجل التجاري", max_len=30),
            F("color", "Colour (#RRGGBB)", "اللون", max_len=9, width=12),
            F("office_lat", "Office latitude", "خط العرض للمكتب", "float", min=-90, max=90, width=14),
            F("office_lng", "Office longitude", "خط الطول للمكتب", "float", min=-180, max=180, width=14),
            F("geofence_radius_m", "Check-in radius (m)", "نطاق التحضير (م)", "int", min=5, max=5000, width=12),
            _bool("active", "Active", "نشطة", True),
            _created(),
        ],
        display="name_ar",
    ),
    Sheet(
        "hr_departments", "Departments", "Departments", "الإدارات", HrDepartment,
        [
            _id(),
            _ref("company_id", "Company", "الشركة", "hr_companies", required=True),
            _ref("parent_id", "Parent department", "الإدارة الأم", "hr_departments"),
            F("name_ar", "Name (AR)", "الاسم (عربي)", required=True, max_len=120, width=24),
            F("name_en", "Name (EN)", "الاسم (إنجليزي)", max_len=120, width=24),
            _ref("head_user_id", "Department head (user)", "مدير الإدارة (مستخدم)", "users"),
            _bool("active", "Active", "نشطة", True),
        ],
        display="name_ar",
    ),
    Sheet(
        "hr_profiles", "Employee HR records", "Employee HR records", "السجلات الوظيفية للموظفين", HrProfile,
        [
            _id(),
            _ref("user_id", "Employee (user)", "الموظف (مستخدم)", "users", required=True),
            F("employee_no", "Employee no.", "الرقم الوظيفي", max_len=30, width=14),
            _ref("company_id", "Company", "الشركة", "hr_companies"),
            _ref("department_id", "Department", "الإدارة", "hr_departments"),
            F("department", "Department (free text)", "الإدارة (نص)", max_len=80),
            F("job_title", "Job title", "المسمى الوظيفي", max_len=120, width=22),
            _ref("manager_user_id", "Line manager (user)", "المدير المباشر (مستخدم)", "users"),
            F("hire_date", "Hire date", "تاريخ التعيين", "date"),
            F("nationality", "Nationality", "الجنسية", max_len=60),
            _enum("contract_type", "Employment type", "نوع التوظيف", "employment_kind", required=True, default="full_time"),
            _enum("employment_status", "Employment status", "الحالة الوظيفية", "employment_status", required=True, default="active"),
            F("annual_leave_days", "Annual leave days", "أيام الإجازة السنوية", "float", min=0, max=60, default=21, width=12),
            F("leave_adjustment", "Leave adjustment (+/− days)", "تعديل رصيد الإجازة (± أيام)", "float", min=-365, max=365, default=0, width=12),
            _enum("ticket_entitlement", "Ticket entitlement", "استحقاق التذاكر", "ticket_entitlement", required=True, default="none"),
            F("ticket_destination", "Ticket destination", "وجهة التذكرة", max_len=80),
            _enum("ticket_class", "Ticket class", "درجة التذكرة", "travel_class", required=True, default="economy"),
            F("ticket_family_members", "Family on ticket", "المرافقون في التذكرة", "int", min=0, max=15, default=0, width=12),
            F("work_start", "Work start (overrides HR settings)", "بداية الدوام (يتجاوز الإعدادات)", "time", width=12),
            F("work_end", "Work end", "نهاية الدوام", "time", width=12),
            _enum("work_mode", "Work mode", "نمط العمل", "work_mode", required=True, default="office"),
            F("remote_days", "Remote weekdays (0=Mon … 6=Sun, comma separated)", "أيام العمل عن بعد (0=الاثنين … 6=الأحد)", max_len=20, width=14),
            F("emergency_contact", "Emergency contact", "جهة اتصال للطوارئ", max_len=160),
            F("notes", "Notes", "ملاحظات", "text", width=30),
        ],
        display="employee_no",
        unique=[("user_id",)],
        rules=[_hr_profile_rule],
    ),
    Sheet(
        "hr_personal", "Personal files", "Employee personal files", "الملفات الشخصية للموظفين", HrPersonal,
        [
            _id(),
            _ref("user_id", "Employee (user)", "الموظف (مستخدم)", "users", required=True),
            F("first_name_ar", "First name (AR)", "الاسم الأول", max_len=60),
            F("father_name_ar", "Father name (AR)", "اسم الأب", max_len=60),
            F("family_name_ar", "Family name (AR)", "اسم العائلة", max_len=60),
            F("first_name_en", "First name (EN)", "الاسم الأول (إنجليزي)", max_len=60),
            F("family_name_en", "Family name (EN)", "اسم العائلة (إنجليزي)", max_len=60),
            F("date_of_birth", "Date of birth", "تاريخ الميلاد", "date"),
            _enum("gender", "Gender", "الجنس", "gender"),
            _enum("marital_status", "Marital status", "الحالة الاجتماعية", "marital_status"),
            _enum("id_type", "ID type", "نوع الهوية", "staff_id_type"),
            F("id_number", "ID / Iqama number", "رقم الهوية / الإقامة", max_len=20),
            F("id_expiry", "ID expiry", "انتهاء الهوية", "date"),
            F("passport_number", "Passport no.", "رقم الجواز", max_len=20),
            F("passport_country", "Passport country", "دولة الجواز", max_len=60),
            F("passport_issue", "Passport issued", "إصدار الجواز", "date"),
            F("passport_expiry", "Passport expiry", "انتهاء الجواز", "date"),
            F("personal_email", "Personal e-mail", "البريد الشخصي", max_len=120, width=24),
            F("personal_phone", "Personal phone", "الجوال الشخصي", max_len=20, numeric_ok=False, width=16),
            F("address", "Address", "العنوان", max_len=300, width=30),
            F("city", "City", "المدينة", max_len=60),
            F("emergency_name", "Emergency contact name", "اسم جهة الطوارئ", max_len=120),
            F("emergency_relation", "Emergency contact relation", "صلة جهة الطوارئ", max_len=40),
            F("emergency_phone", "Emergency phone", "جوال الطوارئ", max_len=20, numeric_ok=False, width=16),
            F("gosi_number", "GOSI no.", "رقم التأمينات", max_len=20),
            F("bank_name", "Bank", "البنك", max_len=80),
            F("iban", "IBAN", "الآيبان", max_len=34, fmt="iban", width=28),
            F("account_holder", "Account holder", "اسم صاحب الحساب", max_len=120),
        ],
        display="id_number",
        unique=[("user_id",)],
        rules=[_id_number_rule("id_number")],
    ),
    Sheet(
        "hr_family_members", "Family members", "Employee family members", "أفراد أسر الموظفين", HrFamilyMember,
        [
            _id(),
            _ref("user_id", "Employee (user)", "الموظف (مستخدم)", "users", required=True),
            F("name", "Name", "الاسم", required=True, max_len=120, width=24),
            _enum("relation", "Relation", "صلة القرابة", "family_relation", required=True),
            F("date_of_birth", "Date of birth", "تاريخ الميلاد", "date"),
            F("id_number", "ID / Iqama number", "رقم الهوية / الإقامة", max_len=20),
            F("passport_number", "Passport no.", "رقم الجواز", max_len=20),
            _bool("dependent", "Dependent (insurance / tickets)", "تابع (تأمين / تذاكر)", True),
            F("phone", "Phone", "الجوال", max_len=20, numeric_ok=False, width=16),
            F("notes", "Notes", "ملاحظات", max_len=200, width=30),
        ],
        display="name",
    ),
    Sheet(
        "hr_contract_templates", "Contract templates", "Contract templates", "قوالب عقود العمل", HrContractTemplate,
        [
            _id(),
            F("name", "Template name", "اسم القالب", required=True, max_len=120, width=28),
            _ref("company_id", "Company (empty = whole group)", "الشركة (فارغ = كل المجموعة)", "hr_companies"),
            _enum("contract_type", "Contract type", "نوع العقد", "hr_contract_type", required=True, default="fixed"),
            F("body_ar", "Arabic text ({{placeholders}})", "النص العربي ({{المتغيرات}})", "text", required=True, width=60),
            F("body_en", "English text", "النص الإنجليزي", "text", width=40),
            F("probation_days", "Probation days", "مدة التجربة (يوم)", "int", min=0, max=180, default=90, width=12),
            F("duration_months", "Duration (months)", "مدة العقد (شهر)", "int", min=1, max=120, width=12),
            F("working_hours_week", "Working hours / week", "ساعات العمل الأسبوعية", "int", min=1, max=80, default=48, width=12),
            F("annual_leave_days", "Annual leave days", "أيام الإجازة السنوية", "int", min=21, max=60, default=21, width=12),
            F("notice_days", "Notice period (days)", "فترة الإشعار (أيام)", "int", min=0, max=365, default=60, width=12),
            _bool("requires_signed_copy", "Signed copy required", "يتطلب نسخة موقعة", True),
            _bool("is_default", "Default", "افتراضي", False),
            _bool("active", "Active", "فعّال", True),
        ],
        display="name",
    ),
    Sheet(
        "hr_contracts", "Employment contracts", "Employment contracts", "عقود العمل", HrContract,
        [
            _id(),
            F("number", "Contract no.", "رقم العقد", required=True, max_len=30, width=16),
            _ref("user_id", "Employee (user)", "الموظف (مستخدم)", "users", required=True),
            _ref("company_id", "Company", "الشركة", "hr_companies"),
            _enum("contract_type", "Contract type", "نوع العقد", "hr_contract_type", required=True, default="fixed"),
            F("job_title", "Job title", "المسمى الوظيفي", max_len=120, width=22),
            F("start_date", "Start date", "تاريخ البداية", "date", required=True),
            F("end_date", "End date", "تاريخ النهاية", "date"),
            F("probation_end", "Probation ends", "نهاية فترة التجربة", "date"),
            _money("basic_salary", "Basic salary (monthly)", "الراتب الأساسي (شهري)", required=True, default=0),
            _money("housing_allowance", "Housing allowance", "بدل السكن", default=0),
            _money("transport_allowance", "Transport allowance", "بدل النقل", default=0),
            _money("other_allowance", "Other allowance", "بدلات أخرى", default=0),
            F("other_allowance_label", "Other allowance label", "وصف البدلات الأخرى", max_len=80),
            F("working_hours_week", "Working hours / week", "ساعات العمل الأسبوعية", "int", min=1, max=72, width=12),
            F("annual_leave_days", "Annual leave days", "أيام الإجازة السنوية", "int", min=0, max=60, width=12),
            F("notice_days", "Notice period (days)", "فترة الإشعار (أيام)", "int", min=0, max=365, width=12),
            F("terms", "Terms", "الشروط", "text", width=40),
            _enum("status", "Status", "الحالة", "hr_contract_status", required=True, default="draft"),
            F("terminated_at", "Terminated on", "تاريخ الإنهاء", "date"),
            F("termination_reason", "Termination reason", "سبب الإنهاء", max_len=300, width=30),
            F("accepted_at", "Accepted at", "تاريخ القبول", "datetime", readonly=True),
            _ref("template_id", "Template", "القالب", "hr_contract_templates"),
            _enum("signed_status", "Signed copy", "النسخة الموقعة", "hr_signed_status", readonly=True),
            F("signed_uploaded_at", "Signed copy uploaded", "تاريخ رفع النسخة الموقعة", "datetime", readonly=True),
            _created(),
        ],
        display="number",
        unique=[("number",)],
        rules=[_dates_rule("start_date", "end_date")],
    ),
    Sheet(
        "hr_assets", "Assets & custody", "Company assets & custody", "الأصول والعُهد", HrAsset,
        [
            _id(),
            F("tag", "Asset tag", "رقم العهدة", required=True, max_len=30, width=14),
            _ref("company_id", "Company", "الشركة", "hr_companies"),
            _enum("kind", "Type", "النوع", "asset_kind", required=True),
            F("name", "Name", "الاسم", required=True, max_len=160, width=24),
            F("brand_model", "Brand / model", "الماركة / الموديل", max_len=120),
            F("serial", "Serial / IMEI / plate", "الرقم التسلسلي / اللوحة", max_len=80),
            _money("value", "Value", "القيمة"),
            F("purchase_date", "Purchase date", "تاريخ الشراء", "date"),
            F("warranty_end", "Warranty ends", "نهاية الضمان", "date"),
            _enum("status", "Status", "الحالة", "asset_status", required=True, default="in_stock"),
            _ref("assigned_user_id", "Assigned to (user)", "مسلّمة إلى (مستخدم)", "users"),
            F("assigned_at", "Assigned on", "تاريخ التسليم", "date"),
            _enum("condition", "Condition", "حالة الجهاز", "asset_condition"),
            F("notes", "Notes", "ملاحظات", "text", width=30),
            F("acknowledged_at", "Acknowledged by employee", "إقرار الموظف بالاستلام", "datetime", readonly=True),
            _created(),
        ],
        display="tag",
        unique=[("tag",)],
        rules=[_asset_rule],
    ),
    Sheet(
        "hr_requests", "HR requests", "Leave, permissions & tickets", "الإجازات والاستئذانات والتذاكر", HrRequest,
        [
            _id(),
            F("number", "Request no.", "رقم الطلب", required=True, max_len=20, width=14),
            _enum("kind", "Type", "النوع", "hr_request_kind", required=True),
            _ref("user_id", "Employee (user)", "الموظف (مستخدم)", "users", required=True),
            _enum("status", "Status", "الحالة", "hr_request_status", required=True, default="pending"),
            F("reason", "Reason", "السبب", "text", width=30),
            _enum("leave_type", "Leave type", "نوع الإجازة", "leave_type"),
            F("start_date", "Start date", "تاريخ البداية", "date"),
            F("end_date", "End date", "تاريخ النهاية", "date"),
            F("days", "Days", "عدد الأيام", "float", min=0, max=365, width=10),
            _ref("delegate_user_id", "Delegate (user)", "البديل (مستخدم)", "users"),
            _enum("permission_type", "Permission type", "نوع الاستئذان", "permission_type"),
            F("from_time", "From", "من الساعة", "time", width=10),
            F("to_time", "To", "إلى الساعة", "time", width=10),
            F("minutes", "Minutes", "الدقائق", "int", min=0, max=1440, width=10),
            _enum("location_type", "Work location type", "نوع موقع العمل", "location_type"),
            F("location_note", "Location note", "ملاحظة الموقع", max_len=200),
            _enum("ticket_purpose", "Ticket purpose", "غرض التذكرة", "ticket_purpose"),
            F("from_city", "From city", "من مدينة", max_len=80),
            F("to_city", "To city", "إلى مدينة", max_len=80),
            F("return_date", "Return date", "تاريخ العودة", "date"),
            _bool("round_trip", "Round trip", "ذهاب وعودة", True),
            F("travellers", "Travellers", "عدد المسافرين", "int", min=1, max=15, default=1, width=10),
            _enum("travel_class", "Travel class", "درجة السفر", "travel_class"),
            _money("estimated_cost", "Estimated cost", "التكلفة التقديرية"),
            F("booking_ref", "Booking ref", "رقم الحجز", max_len=60),
            _money("actual_cost", "Actual cost", "التكلفة الفعلية"),
            F("decision_note", "Decision note", "ملاحظة القرار", "text", width=30),
            F("decided_at", "Decided at", "تاريخ القرار", "datetime", readonly=True),
            _created(),
        ],
        display="number",
        unique=[("number",)],
        rules=[_hr_request_rule],
    ),
    Sheet(
        "hr_attendance", "Attendance", "Attendance (one row per employee per day)", "الحضور والانصراف", Attendance,
        [
            _id(),
            _ref("user_id", "Employee (user)", "الموظف (مستخدم)", "users", required=True),
            F("day", "Day", "اليوم", "date", required=True),
            F("check_in", "Check in", "الحضور", "time", width=10),
            F("check_out", "Check out", "الانصراف", "time", width=10),
            _enum("mode", "Mode", "نوع الحضور", "attendance_mode", required=True, default="office"),
            _enum("source", "Source", "المصدر", "attendance_source", required=True, default="manual"),
            F("note", "Note", "ملاحظة", max_len=300, width=30),
            F("away_minutes", "Minutes away from office", "دقائق خارج المقر", "int", min=0, max=1440, default=0, width=12),
        ],
        display="day",
        unique=[("user_id", "day")],
        rules=[_attendance_rule],
    ),
    # ══ Operations (التشغيل) ══
    Sheet(
        "work_orders", "Work orders", "Maintenance work orders", "طلبات الصيانة", WorkOrder,
        [
            _id(),
            F("number", "Work order no.", "رقم الطلب", required=True, max_len=20, width=14),
            _ref("building_id", "Property", "العقار", "buildings", required=True),
            _ref("unit_id", "Unit", "الوحدة", "units"),
            F("title", "Title", "العنوان", required=True, max_len=200, width=30),
            F("description", "Description", "الوصف", "text", width=36),
            _enum("category", "Category", "التصنيف", "wo_category", required=True, default="other"),
            _enum("priority", "Priority", "الأولوية", "wo_priority", required=True, default="normal"),
            _enum("status", "Status", "الحالة", "wo_status", required=True, default="new"),
            _enum("reported_by", "Reported by", "مصدر البلاغ", "reported_by", required=True, default="staff"),
            F("reporter_name", "Reporter name", "اسم المُبلّغ", max_len=120),
            F("reporter_phone", "Reporter phone", "جوال المُبلّغ", max_len=30, numeric_ok=False),
            _ref("assignee_id", "Assignee (user)", "المسؤول (مستخدم)", "users"),
            F("vendor_name", "Vendor", "المقاول / المورّد", max_len=160),
            F("vendor_phone", "Vendor phone", "جوال المورّد", max_len=30, numeric_ok=False),
            _money("estimate_amount", "Estimate", "التكلفة التقديرية"),
            _money("actual_cost", "Actual cost", "التكلفة الفعلية"),
            _enum("charge_to", "Charged to", "على حساب", "charge_to", required=True, default="owner"),
            F("due_at", "Due by", "موعد الاستحقاق", "datetime"),
            F("scheduled_for", "Scheduled for", "موعد الزيارة", "datetime"),
            F("completed_at", "Completed at", "تاريخ الإنجاز", "datetime"),
            F("resolution", "Resolution", "ما تم عمله", "text", width=30),
            F("rating", "Rating (1–5)", "التقييم (1–5)", "int", min=1, max=5, width=10),
            _created(),
        ],
        display="number",
        unique=[("number",)],
    ),
    Sheet(
        "lease_renewals", "Lease renewals", "Lease renewals pipeline", "متابعة تجديد العقود", LeaseRenewal,
        [
            _id(),
            _ref("contract_id", "Lease contract", "عقد الإيجار", "contracts", required=True),
            _ref("building_id", "Property", "العقار", "buildings"),
            _ref("unit_id", "Unit", "الوحدة", "units"),
            _ref("assignee_id", "Assignee (user)", "المسؤول (مستخدم)", "users"),
            _enum("stage", "Stage", "المرحلة", "renewal_stage", required=True, default="due"),
            _enum("tenant_intent", "Tenant intent", "نية المستأجر", "tenant_intent", required=True, default="unknown"),
            F("end_date", "Lease ends", "انتهاء العقد", "date", required=True),
            _money("current_rent", "Current annual rent", "الإيجار السنوي الحالي", required=True, default=0),
            _money("proposed_rent", "Proposed annual rent", "الإيجار السنوي المقترح"),
            F("next_follow_up", "Next follow-up", "المتابعة القادمة", "date"),
            _enum("lost_reason", "Reason not renewed", "سبب عدم التجديد", "lost_reason"),
            F("new_contract_number", "New contract no.", "رقم العقد الجديد", max_len=50),
            _created(),
        ],
        display="end_date",
        unique=[("contract_id",)],
    ),
    Sheet(
        "collection_actions", "Collection follow-ups", "Collection follow-ups", "متابعات التحصيل", CollectionAction,
        [
            _id(),
            _ref("payment_id", "Instalment (payment)", "الدفعة", "payments", required=True),
            F("at", "When", "التاريخ والوقت", "datetime", required=True),
            _enum("kind", "Action", "الإجراء", "collection_action", required=True),
            F("note", "Note", "ملاحظة", "text", width=40),
            F("promise_date", "Promised date", "تاريخ الوعد", "date"),
            _money("promise_amount", "Promised amount", "المبلغ الموعود"),
            F("actor", "By", "بواسطة", max_len=160, width=18),
            _ref("user_id", "By (user)", "بواسطة (مستخدم)", "users"),
        ],
        display="id",
    ),
]

SHEETS_BY_KEY: dict[str, Sheet] = {s.key: s for s in SHEETS}
SHEETS_BY_TITLE: dict[str, Sheet] = {s.title: s for s in SHEETS}


def _self_check() -> None:
    """Fail fast at import time if the spec drifts from the ORM models."""
    for sheet in SHEETS:
        assert len(sheet.title) <= 31, sheet.title
        cols = set(sheet.model.__table__.columns.keys())
        keys = [f_.key for f_ in sheet.fields]
        assert len(keys) == len(set(keys)), f"duplicate column in {sheet.key}"
        for f_ in sheet.fields:
            assert f_.key in cols, f"{sheet.key}.{f_.key} is not a column of {sheet.model.__name__}"
            if f_.lookup:
                assert f_.lookup in LOOKUPS, f_.lookup
            if f_.ref:
                assert f_.ref in SHEETS_BY_KEY, f_.ref
            if f_.fmt:
                assert f_.fmt in FORMATS, f_.fmt
        for group in sheet.unique:
            for k in group:
                sheet.get(k)


_self_check()
