"""Monthly attendance report as a branded Excel file (Muktasabat letterhead:
logo, company name, maroon header, RTL in Arabic, totals, print-ready)."""
from __future__ import annotations

import io
from datetime import date, datetime
from typing import Optional

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from api.services.branded_xlsx import BRAND, TINT, details_line, footer_note, letterhead, print_setup

AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]

# (key, Arabic, English, width, kind)  kind: text | int | hours | pct
COLUMNS = [
    ("name", "الموظف", "Employee", 26, "text"),
    ("company", "الشركة", "Company", 20, "text"),
    ("working_days", "أيام العمل", "Working days", 10, "int"),
    ("present", "الحضور", "Present", 9, "int"),
    ("late", "مرات التأخير", "Late", 9, "int"),
    ("late_minutes", "دقائق التأخير", "Late minutes", 10, "int"),
    ("absent", "الغياب", "Absent", 9, "int"),
    ("on_leave", "إجازة", "On leave", 9, "int"),
    ("remote_days", "عن بُعد", "Remote days", 9, "int"),
    ("field_days", "ميداني", "Field days", 9, "int"),
    ("early_leave_minutes", "دقائق الخروج المبكر", "Early leave minutes", 12, "int"),
    ("permission_minutes", "دقائق الاستئذان", "Permission minutes", 11, "int"),
    ("worked_hours", "الساعات المسجّلة", "Recorded hours", 11, "hours"),
    ("verified_hours", "الساعات الفعلية", "Actual hours", 11, "hours"),
    ("away_minutes", "دقائق الابتعاد", "Away minutes", 10, "int"),
    ("exceptions", "الملاحظات", "Exceptions", 9, "int"),
    ("refused_checkins", "تسجيلات مرفوضة", "Refused check-ins", 10, "int"),
    ("attendance_pct", "نسبة الحضور", "Attendance %", 10, "pct"),
]
SUM_KINDS = {"int", "hours"}


def build(rows: list[dict], month_first: date, month_last: date, locale: str,
          company_name: str, issued_by: str, now: Optional[datetime] = None) -> bytes:
    ar = locale == "ar"
    now = now or datetime.now()
    wb = Workbook()
    ws = wb.active
    ws.title = month_first.strftime("%Y-%m") if month_first.strftime("%Y-%m") == month_last.strftime("%Y-%m") else f"{month_first:%Y-%m} to {month_last:%Y-%m}"
    ws.sheet_view.rightToLeft = ar
    ws.sheet_view.showGridLines = False
    ncol = len(COLUMNS)
    last_col = get_column_letter(ncol)
    align = "right" if ar else "left"
    thin = Side(style="thin", color="E2D4D4")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    # Letterhead (shared Muktasabat look)
    def mlabel(d: date) -> str:
        return f"{AR_MONTHS[d.month - 1]} {d.year}" if ar else d.strftime("%B %Y")

    same = (month_first.year, month_first.month) == (month_last.year, month_last.month)
    month_label = mlabel(month_first) if same else f"{mlabel(month_first)} – {mlabel(month_last)}"
    title = (("تقرير الحضور الشهري — " if same else "تقرير الحضور — ") if ar else ("Monthly attendance report — " if same else "Attendance report — ")) + month_label
    period = (f"الفترة: {month_first.isoformat()} إلى {month_last.isoformat()}" if ar else f"Period: {month_first.isoformat()} to {month_last.isoformat()}")
    letterhead(ws, ncol, locale, title, details_line(locale, issued_by, [period], now), company=company_name)

    # Header
    hr = 6
    head_fill = PatternFill("solid", fgColor=BRAND)
    ws.row_dimensions[hr].height = 34
    for i, (_, a, e, w, _k) in enumerate(COLUMNS, start=1):
        c = ws.cell(row=hr, column=i, value=a if ar else e)
        c.font = Font(bold=True, color="FFFFFF", size=10)
        c.fill = head_fill
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = border
        ws.column_dimensions[get_column_letter(i)].width = w

    # Rows
    zebra = PatternFill("solid", fgColor=TINT)
    r = hr
    for idx, row in enumerate(rows):
        r += 1
        ws.row_dimensions[r].height = 20
        for i, (key, _a, _e, _w, kind) in enumerate(COLUMNS, start=1):
            v = row.get(key)
            if kind == "pct":
                v = (float(v) / 100) if v not in (None, "") else None
            elif kind in SUM_KINDS:
                v = v if v not in (None, "") else 0
            c = ws.cell(row=r, column=i, value=v if v is not None else "—")
            c.border = border
            if idx % 2:
                c.fill = zebra
            if kind == "text":
                c.alignment = Alignment(horizontal=align, vertical="center", readingOrder=2 if ar else 1)
                if key == "name":
                    c.font = Font(bold=True)
            else:
                c.alignment = Alignment(horizontal="center", vertical="center")
                c.number_format = {"pct": "0%", "hours": "0.0", "int": "0"}[kind]
    first_data, last_data = hr + 1, r

    # Totals
    r += 1
    ws.row_dimensions[r].height = 22
    total_fill = PatternFill("solid", fgColor="EFE3E3")
    for i, (key, _a, _e, _w, kind) in enumerate(COLUMNS, start=1):
        c = ws.cell(row=r, column=i)
        col = get_column_letter(i)
        if i == 1:
            c.value = "الإجمالي" if ar else "Total"
            c.alignment = Alignment(horizontal=align, vertical="center")
        elif kind in SUM_KINDS and last_data >= first_data:
            c.value = f"=SUM({col}{first_data}:{col}{last_data})"
            c.number_format = "0.0" if kind == "hours" else "0"
            c.alignment = Alignment(horizontal="center", vertical="center")
        elif kind == "pct" and last_data >= first_data:
            c.value = f"=IFERROR(AVERAGE({col}{first_data}:{col}{last_data}),0)"
            c.number_format = "0%"
            c.alignment = Alignment(horizontal="center", vertical="center")
        c.font = Font(bold=True, color=BRAND)
        c.fill = total_fill
        c.border = Border(left=thin, right=thin, bottom=thin, top=Side(style="medium", color=BRAND))

    # Attendance % colours
    if last_data >= first_data:
        pct = f"{last_col}{first_data}:{last_col}{last_data}"
        ws.conditional_formatting.add(pct, CellIsRule(operator="greaterThanOrEqual", formula=["0.95"], font=Font(bold=True, color="15803D")))
        ws.conditional_formatting.add(pct, CellIsRule(operator="between", formula=["0.8", "0.9499"], font=Font(bold=True, color="B45309")))
        ws.conditional_formatting.add(pct, CellIsRule(operator="lessThan", formula=["0.8"], font=Font(bold=True, color="B91C1C")))

    footer_note(ws, r + 2, ncol, locale)
    ws.freeze_panes = ws.cell(row=hr + 1, column=2)
    if last_data >= first_data:
        ws.auto_filter.ref = f"A{hr}:{last_col}{last_data}"
    print_setup(ws, hr, company_name, locale)

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
