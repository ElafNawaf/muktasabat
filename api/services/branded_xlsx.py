"""Muktasabat-branded Excel files: one look for every export.

Letterhead (logo + company name + title + details line) above a brand rule,
maroon header rows, zebra rows, thin warm borders, RTL in Arabic, frozen
header, filters, A4 landscape print setup and a page-number footer.
"""
from __future__ import annotations

import io
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Optional, Sequence

from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

BRAND = "7B1A1A"       # Muktasabat maroon (web --color-primary)
TINT = "F8F1F1"        # zebra rows
TOTAL = "EFE3E3"       # totals rows
INK = "1F2937"
MUTED = "6B7280"
LOGO = Path(__file__).resolve().parent.parent / "assets" / "logo.png"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
COMPANY = {"ar": "شركة مكتسبات العقارية", "en": "Muktasabat Real Estate"}

_thin = Side(style="thin", color="E2D4D4")
BORDER = Border(left=_thin, right=_thin, top=_thin, bottom=_thin)
_NUM = re.compile(r"^-?\d+(\.\d+)?$")


def _al(ar: bool, h: Optional[str] = None, **kw) -> Alignment:
    return Alignment(horizontal=h or ("right" if ar else "left"), vertical="center", readingOrder=2 if ar else 1, **kw)


def new_sheet(wb: Workbook, title: str, locale: str, first: bool = True):
    ws = wb.active if first else wb.create_sheet()
    ws.title = re.sub(r"[\[\]:*?/\\]", "-", title)[:31] or "Sheet"
    ws.sheet_view.rightToLeft = locale == "ar"
    ws.sheet_view.showGridLines = False
    return ws


def letterhead(ws, ncol: int, locale: str, title: str, details: str = "", company: Optional[str] = None) -> int:
    """Logo, company, title and a details line; returns the first free row (after a spacer)."""
    ar = locale == "ar"
    ncol = max(ncol, 4)
    company = company or COMPANY["ar" if ar else "en"]
    for r, h in ((1, 30), (2, 22), (3, 18), (4, 8)):
        ws.row_dimensions[r].height = h
    if LOGO.exists():
        img = XLImage(str(LOGO))
        img.width = img.height = 64
        ws.add_image(img, "A1")
    if (ws.column_dimensions["A"].width or 0) < 11:
        ws.column_dimensions["A"].width = 11
    for i, (text, font) in enumerate(((company, Font(bold=True, size=16, color=BRAND)),
                                      (title, Font(bold=True, size=12, color=INK)),
                                      (details, Font(size=10, color=MUTED))), start=1):
        ws.merge_cells(start_row=i, start_column=2, end_row=i, end_column=ncol)
        c = ws.cell(row=i, column=2, value=text)
        c.font, c.alignment = font, _al(ar)
    for col in range(1, ncol + 1):
        ws.cell(row=4, column=col).border = Border(bottom=Side(style="medium", color=BRAND))
    return 6


def details_line(locale: str, issued_by: Optional[str] = None, extra: Iterable[str] = (), now: Optional[datetime] = None) -> str:
    ar = locale == "ar"
    now = now or datetime.utcnow()
    parts = list(extra) + [(f"تاريخ الإصدار: {now:%Y-%m-%d %H:%M}" if ar else f"Issued: {now:%Y-%m-%d %H:%M}")]
    if issued_by:
        parts.append(f"أصدره: {issued_by}" if ar else f"By: {issued_by}")
    return "   ·   ".join(parts)


def header_row(ws, row: int, labels: Sequence[str], height: int = 30) -> None:
    ws.row_dimensions[row].height = height
    fill = PatternFill("solid", fgColor=BRAND)
    for i, label in enumerate(labels, start=1):
        c = ws.cell(row=row, column=i, value=label)
        c.font, c.fill, c.border = Font(bold=True, color="FFFFFF", size=10), fill, BORDER
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def section_title(ws, row: int, text: str, ncol: int, locale: str) -> None:
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=max(ncol, 1))
    c = ws.cell(row=row, column=1, value=text)
    c.font, c.alignment = Font(bold=True, size=12, color=BRAND), _al(locale == "ar")
    ws.row_dimensions[row].height = 22


def _value(v: Any) -> Any:
    if v is None:
        return ""
    if isinstance(v, str):
        s = v.strip()
        if _NUM.match(s) and not (len(s) > 1 and s.startswith("0") and not s.startswith("0.")) and len(s) < 15:
            return float(s) if "." in s else int(s)  # numbers stay numbers (phones/IDs with leading 0 stay text)
        return v
    return v


def data_rows(ws, start: int, rows: Sequence[Sequence[Any]], locale: str, bold_first: bool = True) -> int:
    """Writes rows from `start`; returns the last row written (start-1 when empty)."""
    ar = locale == "ar"
    zebra = PatternFill("solid", fgColor=TINT)
    r = start - 1
    for idx, row in enumerate(rows):
        r += 1
        for i, v in enumerate(row, start=1):
            v = _value(v)
            c = ws.cell(row=r, column=i, value=v)
            if isinstance(v, str) and v[:1] in ("=", "+", "-", "@"):
                c.data_type = "s"  # always text, never a formula (blocks spreadsheet formula injection)
            c.border = BORDER
            if idx % 2:
                c.fill = zebra
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                c.alignment = Alignment(horizontal="center", vertical="center")
                if isinstance(v, float):
                    c.number_format = "#,##0.00"
                elif abs(v) >= 1000:
                    c.number_format = "#,##0"
            else:
                c.alignment = _al(ar, wrap_text=isinstance(v, str) and len(v) > 40)
            if i == 1 and bold_first:
                c.font = Font(bold=True)
    return r


def totals_row(ws, row: int, values: Sequence[Any], locale: str) -> None:
    ar = locale == "ar"
    fill = PatternFill("solid", fgColor=TOTAL)
    for i, v in enumerate(values, start=1):
        c = ws.cell(row=row, column=i, value=v)
        c.font, c.fill = Font(bold=True, color=BRAND), fill
        c.border = Border(left=_thin, right=_thin, bottom=_thin, top=Side(style="medium", color=BRAND))
        c.alignment = Alignment(horizontal="center", vertical="center") if i > 1 else _al(ar)
        if isinstance(v, float) or (isinstance(v, str) and v.startswith("=")):
            c.number_format = "#,##0.00"


def autosize(ws, ncol: int, first_row: int, min_w: int = 9, max_w: int = 48) -> None:
    for i in range(1, ncol + 1):
        letter = get_column_letter(i)
        longest = 0
        for (cell,) in ws.iter_rows(min_row=first_row, min_col=i, max_col=i):
            if cell.value is not None:
                longest = max(longest, max(len(x) for x in str(cell.value).split("\n")))
        ws.column_dimensions[letter].width = max(min_w, min(max_w, longest * 1.1 + 2))


def footer_note(ws, row: int, ncol: int, locale: str) -> None:
    ar = locale == "ar"
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=max(ncol, 1))
    c = ws.cell(row=row, column=1, value=("أُعدّ هذا الملف آليًا من نظام مكتسبات." if ar else "Generated by the Muktasabat system."))
    c.font, c.alignment = Font(size=9, italic=True, color=MUTED), _al(ar)


def print_setup(ws, header_row_no: Optional[int], company: Optional[str], locale: str) -> None:
    ar = locale == "ar"
    if header_row_no:
        ws.print_title_rows = f"{header_row_no}:{header_row_no}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_options.horizontalCentered = True
    ws.page_margins.left = ws.page_margins.right = 0.4
    ws.oddFooter.center.text = "صفحة &P من &N" if ar else "Page &P of &N"
    ws.oddFooter.right.text = company or COMPANY["ar" if ar else "en"]


def table_workbook(title: str, header: Sequence[str], rows: Sequence[Sequence[Any]], locale: str = "ar",
                   details: str = "", sheet: Optional[str] = None, sum_cols: Iterable[int] = (),
                   sections: Optional[list[dict]] = None, summary: Optional[list[tuple[str, Any]]] = None) -> bytes:
    """A complete branded workbook. Either one table (header + rows) or several
    `sections` [{"title", "header", "rows", "sum_cols"}]; optional `summary`
    key/value pairs at the end (e.g. statement totals)."""
    wb = Workbook()
    ws = new_sheet(wb, sheet or title, locale)
    secs = sections if sections is not None else [{"title": None, "header": header, "rows": rows, "sum_cols": list(sum_cols)}]
    ncol = max([len(s["header"]) for s in secs] + [2])
    r = letterhead(ws, ncol, locale, title, details)
    first_header = None
    for s in secs:
        if s.get("title"):
            section_title(ws, r, s["title"], len(s["header"]), locale)
            r += 1
        header_row(ws, r, s["header"])
        first_header = first_header or r
        last = data_rows(ws, r + 1, s["rows"], locale)
        if s.get("sum_cols") and last > r:
            vals: list[Any] = ["الإجمالي" if locale == "ar" else "Total"] + [""] * (len(s["header"]) - 1)
            for ci in s["sum_cols"]:
                col = get_column_letter(ci)
                vals[ci - 1] = f"=SUM({col}{r + 1}:{col}{last})"
            last += 1
            totals_row(ws, last, vals, locale)
        if len(secs) == 1 and last > r:
            ws.auto_filter.ref = f"A{r}:{get_column_letter(len(s['header']))}{last}"
        r = last + 2
    if summary:
        for label, val in summary:
            totals_row(ws, r, [label, val], locale)
            r += 1
        r += 1
    autosize(ws, ncol, 6)
    ws.column_dimensions["A"].width = max(ws.column_dimensions["A"].width or 0, 11)
    footer_note(ws, r, ncol, locale)
    if len(secs) == 1 and first_header:
        ws.freeze_panes = ws.cell(row=first_header + 1, column=1)
    print_setup(ws, first_header, None, locale)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def xlsx_response(data: bytes, filename: str) -> Response:
    if not filename.endswith(".xlsx"):
        filename += ".xlsx"
    return Response(data, media_type=XLSX, headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})
