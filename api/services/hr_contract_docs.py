"""Employment-contract documents: placeholder rendering and the starter template.

Templates are plain text with {{placeholders}}. The rendered text is stored on the
contract (`HrContract.body`) and frozen once the employee accepts, so later template
edits never change a contract someone already agreed to.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.hr_models import HrProfile
from api.hr_people_models import HrCompany, HrContract, HrContractTemplate, HrPersonal
from api.models import User

# key → (Arabic label, English label, sample value)
PLACEHOLDERS: dict[str, tuple[str, str, str]] = {
    "contract_number": ("رقم العقد", "Contract number", "MK-EC-0012"),
    "today": ("تاريخ اليوم", "Today's date", "2026-11-14"),
    "company_name": ("اسم الشركة (عربي)", "Company name (Arabic)", "شركة مكتسبات العقارية"),
    "company_name_en": ("اسم الشركة (إنجليزي)", "Company name (English)", "Muktasabat Real Estate"),
    "company_cr": ("السجل التجاري للشركة", "Company CR number", "1010xxxxxx"),
    "employee_name": ("اسم الموظف (عربي)", "Employee name (Arabic)", "سارة محمد القحطاني"),
    "employee_name_en": ("اسم الموظف (إنجليزي)", "Employee name (English)", "Sara Alqahtani"),
    "id_type": ("نوع الهوية", "ID type", "هوية وطنية"),
    "id_number": ("رقم الهوية / الإقامة", "ID / Iqama number", "10xxxxxxxx"),
    "nationality": ("الجنسية", "Nationality", "سعودية"),
    "employee_no": ("الرقم الوظيفي", "Employee number", "MK-0007"),
    "job_title": ("المسمى الوظيفي", "Job title", "محاسبة"),
    "contract_type": ("نوع العقد", "Contract type", "محدد المدة"),
    "start_date": ("تاريخ بداية العقد", "Start date", "2026-12-01"),
    "end_date": ("تاريخ نهاية العقد", "End date", "2027-11-30"),
    "probation_end": ("نهاية فترة التجربة", "Probation end", "2027-02-28"),
    "probation_days": ("مدة التجربة (يوم)", "Probation (days)", "90"),
    "basic_salary": ("الراتب الأساسي", "Basic salary", "8,000"),
    "housing_allowance": ("بدل السكن", "Housing allowance", "2,000"),
    "transport_allowance": ("بدل النقل", "Transport allowance", "800"),
    "other_allowance": ("بدلات أخرى", "Other allowance", "0"),
    "other_allowance_label": ("وصف البدلات الأخرى", "Other allowance label", "بدل اتصال"),
    "total_salary": ("إجمالي الراتب الشهري", "Monthly total", "10,800"),
    "working_hours_week": ("ساعات العمل الأسبوعية", "Hours per week", "48"),
    "annual_leave_days": ("الإجازة السنوية (يوم)", "Annual leave (days)", "21"),
    "notice_days": ("فترة الإشعار (يوم)", "Notice period (days)", "60"),
}

_CTYPE = {"fixed": ("محدد المدة", "Fixed term"), "unlimited": ("غير محدد المدة", "Open-ended"),
          "part_time": ("دوام جزئي", "Part time"), "temporary": ("مؤقت", "Temporary")}
_ID = {"national_id": ("هوية وطنية", "National ID"), "iqama": ("إقامة", "Iqama")}
_TOKEN = re.compile(r"\{\{\s*([a-z_]+)\s*\}\}")


def _money(v: Optional[float]) -> str:
    v = v or 0
    return f"{v:,.2f}".rstrip("0").rstrip(".") if v % 1 else f"{v:,.0f}"


def context(db: Session, c: HrContract) -> dict[str, str]:
    """Values for every placeholder, from the contract and the employee's file. Missing → '—'."""
    u = db.get(User, c.user_id)
    per = db.scalar(select(HrPersonal).where(HrPersonal.user_id == c.user_id))
    prof = db.scalar(select(HrProfile).where(HrProfile.user_id == c.user_id))
    comp = db.get(HrCompany, c.company_id) if c.company_id else None
    name_ar = " ".join(x for x in (per and per.first_name_ar, per and per.father_name_ar, per and per.family_name_ar) if x) if per else ""
    name_en = " ".join(x for x in (per and per.first_name_en, per and per.family_name_en) if x) if per else ""
    total = (c.basic_salary or 0) + (c.housing_allowance or 0) + (c.transport_allowance or 0) + (c.other_allowance or 0)
    probation = (c.probation_end - c.start_date).days if c.probation_end and c.start_date else None
    d = lambda v: v.isoformat() if isinstance(v, date) else None  # noqa: E731
    vals = {
        "contract_number": c.number if c.number and not c.number.startswith("tmp-") else None,
        "today": date.today().isoformat(),
        "company_name": comp.name_ar if comp else None,
        "company_name_en": (comp.name_en or comp.name_ar) if comp else None,
        "company_cr": comp.cr_number if comp else None,
        "employee_name": name_ar or (u and (u.full_name_ar or u.full_name)) or None,
        "employee_name_en": name_en or (u and (u.full_name or u.full_name_ar)) or None,
        "id_type": _ID.get(per.id_type, (None,))[0] if per and per.id_type else None,
        "id_number": per.id_number if per else None,
        "nationality": prof.nationality if prof else None,
        "employee_no": prof.employee_no if prof else None,
        "job_title": c.job_title,
        "contract_type": _CTYPE.get(c.contract_type, (c.contract_type,))[0],
        "start_date": d(c.start_date),
        "end_date": d(c.end_date) or "غير محدد",
        "probation_end": d(c.probation_end),
        "probation_days": str(probation) if probation is not None else None,
        "basic_salary": _money(c.basic_salary),
        "housing_allowance": _money(c.housing_allowance),
        "transport_allowance": _money(c.transport_allowance),
        "other_allowance": _money(c.other_allowance),
        "other_allowance_label": c.other_allowance_label,
        "total_salary": _money(total),
        "working_hours_week": str(c.working_hours_week) if c.working_hours_week else None,
        "annual_leave_days": str(c.annual_leave_days) if c.annual_leave_days is not None else None,
        "notice_days": str(c.notice_days) if c.notice_days is not None else None,
    }
    return {k: (str(v) if v not in (None, "") else "—") for k, v in vals.items()}


def render(text: str, ctx: dict[str, str]) -> str:
    return _TOKEN.sub(lambda m: ctx.get(m.group(1), m.group(0)), text or "")


def unknown_tokens(text: str) -> list[str]:
    return sorted({m.group(1) for m in _TOKEN.finditer(text or "") if m.group(1) not in PLACEHOLDERS})


def render_contract(db: Session, c: HrContract) -> Optional[str]:
    """Text of the contract from its template (Arabic, then the English version if the template has one)."""
    t = db.get(HrContractTemplate, c.template_id) if c.template_id else None
    if t is None:
        return None
    ctx = context(db, c)
    out = render(t.body_ar, ctx)
    if t.body_en and t.body_en.strip():
        ctx_en = dict(ctx, contract_type=_CTYPE.get(c.contract_type, ("", c.contract_type))[1],
                      end_date=ctx["end_date"] if c.end_date else "Open-ended",
                      id_type=_ID.get((db.scalar(select(HrPersonal.id_type).where(HrPersonal.user_id == c.user_id)) or ""), ("", ctx["id_type"]))[1])
        out += "\n\n────────────────────────────\n\n" + render(t.body_en, ctx_en)
    return out


def refresh_body(db: Session, c: HrContract) -> None:
    """Re-render unless HR wrote custom text for this employee or the contract is already accepted."""
    if c.status in ("accepted", "terminated") or c.body_custom:
        return
    body = render_contract(db, c)
    if body is not None:
        c.body = body


def template_for(db: Session, company_id: Optional[int], contract_type: str) -> Optional[HrContractTemplate]:
    """Best match: company + type, company default, group + type, group default."""
    rows = db.scalars(select(HrContractTemplate).where(HrContractTemplate.active.is_(True))).all()
    for pick in (
        lambda t: t.company_id == company_id and t.contract_type == contract_type and t.is_default,
        lambda t: t.company_id == company_id and t.contract_type == contract_type,
        lambda t: t.company_id == company_id and t.is_default,
        lambda t: t.company_id is None and t.contract_type == contract_type,
        lambda t: t.company_id is None and t.is_default,
    ):
        for t in rows:
            if pick(t):
                return t
    return None


STARTER_AR = """عقد عمل {{contract_type}}
رقم العقد: {{contract_number}}

إنه في تاريخ {{today}} تم الاتفاق بين كل من:
الطرف الأول (صاحب العمل): {{company_name}}، سجل تجاري رقم {{company_cr}}.
الطرف الثاني (الموظف): {{employee_name}}، الجنسية: {{nationality}}، {{id_type}} رقم {{id_number}}.

البند (1) موضوع العقد
يعمل الطرف الثاني لدى الطرف الأول بوظيفة {{job_title}}، ويلتزم بأداء المهام المسندة إليه وفق الوصف الوظيفي وتعليمات الإدارة، وفي المقر الذي يحدده الطرف الأول.

البند (2) مدة العقد
يبدأ العقد في {{start_date}} وينتهي في {{end_date}}. ويخضع الطرف الثاني لفترة تجربة مدتها {{probation_days}} يومًا تنتهي في {{probation_end}}، ويحق لأي من الطرفين إنهاء العقد خلالها.

البند (3) الأجر
يتقاضى الطرف الثاني أجرًا شهريًا إجماليًا قدره {{total_salary}} ريال سعودي، تفصيله:
- الراتب الأساسي: {{basic_salary}} ريال
- بدل السكن: {{housing_allowance}} ريال
- بدل النقل: {{transport_allowance}} ريال
- بدلات أخرى: {{other_allowance}} ريال
ويُصرف الأجر في نهاية كل شهر ميلادي بالتحويل إلى حساب الطرف الثاني البنكي المسجل لدى الشركة.

البند (4) ساعات العمل والإجازات
ساعات العمل {{working_hours_week}} ساعة أسبوعيًا. يستحق الطرف الثاني إجازة سنوية مدفوعة الأجر مدتها {{annual_leave_days}} يومًا، وفق نظام العمل ولوائح الشركة.

البند (5) السرية والعُهد
يلتزم الطرف الثاني بالمحافظة على سرية معلومات الشركة وعملائها أثناء العمل وبعد انتهائه، وبإعادة جميع العُهد المسلّمة له عند انتهاء العلاقة التعاقدية.

البند (6) إنهاء العقد
يجوز لأي من الطرفين إنهاء العقد بإشعار كتابي مدته {{notice_days}} يومًا، مع مراعاة أحكام نظام العمل السعودي.

البند (7) أحكام عامة
يخضع هذا العقد لنظام العمل في المملكة العربية السعودية ولوائحه التنفيذية، وما لم يرد فيه نص تسري عليه أحكام النظام. حُرر هذا العقد من نسختين، بيد كل طرف نسخة للعمل بموجبها.

الطرف الأول: {{company_name}}            التوقيع: ____________
الطرف الثاني: {{employee_name}}            التوقيع: ____________"""

STARTER_EN = """Employment contract ({{contract_type}}) — No. {{contract_number}}

Employer: {{company_name_en}}, CR {{company_cr}}.
Employee: {{employee_name_en}}, nationality {{nationality}}, {{id_type}} {{id_number}}.

Position: {{job_title}}. Term: {{start_date}} to {{end_date}}; probation ends {{probation_end}}.
Monthly pay: {{total_salary}} SAR (basic {{basic_salary}}, housing {{housing_allowance}}, transport {{transport_allowance}}, other {{other_allowance}}).
Working hours: {{working_hours_week}} per week. Annual leave: {{annual_leave_days}} days. Notice period: {{notice_days}} days.
Governed by the Saudi Labor Law. If the Arabic and English texts differ, the Arabic text prevails.

Employer signature: ____________        Employee signature: ____________"""


def seed_templates(db: Session) -> None:
    """One group-wide starter template, so HR has something to adapt. Never overwrites edits."""
    if db.scalar(select(HrContractTemplate.id).limit(1)):
        return
    db.add(HrContractTemplate(
        company_id=None, name="عقد العمل الموحّد للمجموعة", contract_type="fixed", body_ar=STARTER_AR, body_en=STARTER_EN,
        probation_days=90, duration_months=12, working_hours_week=48, annual_leave_days=21, notice_days=60,
        requires_signed_copy=True, is_default=True, active=True, updated_by="system",
    ))
    db.commit()
