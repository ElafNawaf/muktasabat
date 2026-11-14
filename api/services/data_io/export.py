"""Build the admin data-management workbook (تصدير البيانات إلى Excel).

Layout of every entity sheet:

* row 1 — bilingual column label (``*`` marks a required column),
* row 2 — machine column key; the importer matches columns by this row, so
  columns may be reordered but these keys must not be edited,
* row 3+ — one record per row.

Reference columns (``owner_id``, ``unit_id`` …) hold the system ID of the
related record (or the ``NEW-…`` key of a row added in the same file) and get a
drop-down of valid IDs plus a read-only helper column (``~owner_id``) that shows
the related record's name live, so a wrong link is visible while editing.

Lookup columns get a drop-down from the ``Lookups`` sheet. Every other column
gets Excel data validation for its type, range and length, so most mistakes are
blocked while typing; the importer re-checks everything regardless.
"""
from __future__ import annotations

import io
from datetime import date, datetime
from typing import Any, Optional, Iterable

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter, quote_sheetname
from openpyxl.worksheet.datavalidation import DataValidation
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.services.data_io.spec import (
    FORMAT_VERSION,
    FORMATS,
    LOOKUPS,
    SHEETS,
    SHEETS_BY_KEY,
    F,
    Sheet,
)

HEADER_ROW, KEY_ROW, FIRST_DATA_ROW = 1, 2, 3
EMPTY_ROWS_FOR_NEW_DATA = 1000

BRAND = "7B1A1A"  # Muktasabat primary (web --color-primary)
FILL_HEADER = PatternFill("solid", fgColor=BRAND)
FILL_REQUIRED = PatternFill("solid", fgColor="B7791F")
FILL_READONLY_HDR = PatternFill("solid", fgColor="7F8C8D")
FILL_READONLY = PatternFill("solid", fgColor="EEF0F1")
FILL_INFO = PatternFill("solid", fgColor="F6F8FA")
FILL_KEY = PatternFill("solid", fgColor="F4ECEC")
FONT_HDR = Font(bold=True, color="FFFFFF", size=10)
FONT_KEY = Font(color="5A6B73", size=8, name="Consolas")
FONT_INFO = Font(italic=True, color="6B7280", size=9)
THIN = Side(style="thin", color="D0D7DB")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

INFO_PREFIX = "~"

NUMBER_FORMATS = {
    "date": "yyyy-mm-dd",
    "datetime": "yyyy-mm-dd hh:mm",
    "int": "0",
    "float": "#,##0.00",
    "str": "@",
    "text": "@",
    "ref": "0",
    "id": "@",
}


# ── Column layout ────────────────────────────────────────────────────────────


def sheet_columns(sheet: Sheet) -> list[tuple[str, Optional[F]]]:
    """(key, field) per Excel column; helper columns have field=None."""
    cols: list[tuple[str, Optional[F]]] = []
    for f in sheet.fields:
        cols.append((f.key, f))
        if f.kind == "ref":
            cols.append((INFO_PREFIX + f.key, None))
    return cols


def _col_letter(sheet: Sheet, key: str) -> str:
    for i, (k, _f) in enumerate(sheet_columns(sheet), start=1):
        if k == key:
            return get_column_letter(i)
    raise KeyError(key)


def _label(f: F) -> str:
    star = " *" if f.required else ""
    ro = "  🔒" if f.readonly else ""
    return f"{f.ar}{star}\n{f.en}{star}{ro}"


def _hint(f: F) -> str:
    """Cell comment on the header: what the column accepts."""
    parts: list[str] = []
    if f.kind == "id":
        parts.append(
            "Existing rows: keep the number.\nNew rows: leave blank, or write NEW-1, NEW-2… "
            "when other sheets must reference this row.\n"
            "السجلات الحالية: لا تغيّر الرقم. السجل الجديد: اتركه فارغًا أو اكتب NEW-1 …"
        )
    if f.readonly:
        parts.append("Read-only — calculated or managed by the system; ignored on upload.\nللاطلاع فقط — يتم تجاهله عند الرفع.")
    if f.required:
        parts.append("Required / إلزامي")
    if f.kind == "ref":
        target = SHEETS_BY_KEY[f.ref]
        parts.append(f"ID from sheet '{target.title}' (or a NEW-… key there).\nرقم من ورقة {target.ar}")
    if f.lookup and f.kind in ("enum", "bool"):
        lk = LOOKUPS[f.lookup]
        values = ", ".join("TRUE" if v is True else "FALSE" if v is False else str(v) for v in lk.allowed)
        parts.append(f"Allowed: {values}\n(see sheet 'Lookups' / انظر ورقة القوائم)")
    if f.kind == "date":
        parts.append("Date: YYYY-MM-DD")
    if f.max_len:
        parts.append(f"Max {f.max_len} characters")
    if f.kind in ("int", "float"):
        rng = []
        if f.min is not None:
            rng.append(f"≥ {f.min:g}")
        if f.gt is not None:
            rng.append(f"> {f.gt:g}")
        if f.max is not None:
            rng.append(f"≤ {f.max:g}")
        parts.append(("Whole number " if f.kind == "int" else "Number ") + " ".join(rng))
    if f.fmt:
        fmt = FORMATS[f.fmt]
        parts.append(f"{fmt.en} — e.g. {fmt.example}\n{fmt.ar}")
    return "\n".join(parts)


# ── Values ───────────────────────────────────────────────────────────────────


def _cell_value(f: F, value: Any) -> Any:
    if value is None:
        return None
    if f.kind == "datetime" and isinstance(value, datetime):
        return value.replace(microsecond=0, tzinfo=None)
    if f.kind == "date" and isinstance(value, datetime):
        return value.date()
    if isinstance(value, (dict, list)):
        return str(value)
    return value


def _rows(db: Session, sheet: Sheet) -> list[dict]:
    """Only the spec's columns are read, so unrelated model columns never matter."""
    keys = [f.key for f in sheet.fields]
    stmt = select(*(getattr(sheet.model, k) for k in keys)).order_by(sheet.model.id)
    return [dict(zip(keys, r)) for r in db.execute(stmt).all()]


# ── Validation helpers ───────────────────────────────────────────────────────


def _dv_for(f: F, lookup_ranges: dict[str, str], last_row: int) -> Optional[DataValidation]:
    common = dict(allow_blank=not f.required, showErrorMessage=True, errorStyle="stop")
    err_title = "Invalid value / قيمة غير صحيحة"
    if f.kind in ("enum", "bool") and f.lookup:
        dv = DataValidation(type="list", formula1=lookup_ranges[f.lookup], **common)
        dv.error = "Choose a value from the list (sheet 'Lookups').\nاختر قيمة من القائمة."
    elif f.kind == "ref":
        target = SHEETS_BY_KEY[f.ref]
        rng = f"{quote_sheetname(target.title)}!$A${FIRST_DATA_ROW}:$A${last_row}"
        dv = DataValidation(type="list", formula1=rng, **common)
        dv.error = f"Use an ID from sheet '{target.title}'.\nاستخدم رقمًا من ورقة {target.ar}."
    elif f.kind == "int":
        lo = f.min if f.min is not None else -2147483648
        hi = f.max if f.max is not None else 2147483647
        dv = DataValidation(type="whole", operator="between", formula1=str(int(lo)), formula2=str(int(hi)), **common)
        dv.error = f"Whole number between {lo:g} and {hi:g}.\nرقم صحيح بين {lo:g} و {hi:g}."
    elif f.kind == "float":
        lo = f.gt if f.gt is not None else (f.min if f.min is not None else -1e15)
        hi = f.max if f.max is not None else 1e15
        op = "between"
        dv = DataValidation(type="decimal", operator=op, formula1=repr(float(lo)), formula2=repr(float(hi)), **common)
        dv.error = "Enter a number in the allowed range.\nأدخل رقمًا ضمن النطاق المسموح."
    elif f.kind == "date":
        dv = DataValidation(type="date", operator="between", formula1="DATE(1900,1,2)", formula2="DATE(2100,12,31)", **common)
        dv.error = "Enter a valid date (YYYY-MM-DD).\nأدخل تاريخًا صحيحًا."
    elif f.kind in ("str", "text") and f.max_len:
        dv = DataValidation(type="textLength", operator="lessThanOrEqual", formula1=str(f.max_len), **common)
        dv.error = f"Maximum {f.max_len} characters.\nالحد الأقصى {f.max_len} حرفًا."
    else:
        return None
    dv.errorTitle = err_title
    return dv


# ── Workbook ─────────────────────────────────────────────────────────────────


def plan_sheets(keys: Optional[Iterable[str]]) -> tuple[list[Sheet], set[str]]:
    """Sheets to write for a selection, and which of them are only reference copies.

    A selected sheet links to other sheets (a unit → its property); those are added
    as locked reference copies so the ID drop-downs and the ↳ name columns keep
    working. Reference copies are ignored on import, so uploading the file only
    changes what the user chose to export."""
    if not keys:
        return list(SHEETS), set()
    chosen = {k for k in keys if k in SHEETS_BY_KEY}
    if not chosen:
        raise ValueError("Choose at least one sheet to export.")
    deps: set[str] = set()
    for k in chosen:
        for f in SHEETS_BY_KEY[k].fields:
            if f.kind == "ref" and f.ref and f.ref not in chosen:
                deps.add(f.ref)
    out = [sh for sh in SHEETS if sh.key in chosen or sh.key in deps]
    return out, {d for d in deps if not SHEETS_BY_KEY[d].reference_only}


def build_workbook(db: Session, *, template: bool = False, exported_by: str = "", keys: Optional[Iterable[str]] = None) -> bytes:
    sheets, ref_copies = plan_sheets(keys)
    wb = Workbook()
    readme = wb.active
    readme.title = "README"

    # Reference copies always carry data (the drop-downs need real IDs), even in a template.
    data_rows = {sh.key: ([] if template and not sh.reference_only and sh.key not in ref_copies else _rows(db, sh)) for sh in sheets}
    last_row = FIRST_DATA_ROW + max([len(r) for r in data_rows.values()] + [0]) + EMPTY_ROWS_FOR_NEW_DATA

    # Lookups sheet first (validations reference it).
    lookup_ws = wb.create_sheet("Lookups")
    lookup_ranges = _write_lookups(lookup_ws)

    for sheet in sheets:
        ws = wb.create_sheet(sheet.title)
        _write_entity_sheet(ws, sheet, data_rows[sheet.key], lookup_ranges, last_row, ref_copy=sheet.key in ref_copies)

    dictionary = wb.create_sheet("Dictionary")
    _write_dictionary(dictionary, [sh for sh in sheets if sh.key not in ref_copies])
    _write_readme(readme, data_rows, template, sheets, ref_copies, partial=bool(keys))

    # Tab order: README, entity sheets, Lookups, Dictionary.
    wb.move_sheet("Lookups", offset=wb.sheetnames.index("Dictionary") - 1 - wb.sheetnames.index("Lookups"))

    meta = wb.create_sheet("_meta")
    meta["A1"], meta["B1"] = "format", FORMAT_VERSION
    meta["A2"], meta["B2"] = "exported_at", datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    meta["A3"], meta["B3"] = "exported_by", exported_by
    meta["A4"], meta["B4"] = "template", "yes" if template else "no"
    meta["A5"], meta["B5"] = "reference_sheets", ",".join(sorted(ref_copies))
    meta["A6"], meta["B6"] = "sheets", ",".join(sh.key for sh in sheets if sh.key not in ref_copies)
    meta.sheet_state = "veryHidden"

    wb.calculation.fullCalcOnLoad = True  # helper ↳ columns are formulas
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _write_lookups(ws) -> dict[str, str]:
    ws.sheet_view.showGridLines = False
    ranges: dict[str, str] = {}
    col = 1
    for lk in LOOKUPS.values():
        c_val, c_en, c_ar = col, col + 1, col + 2
        ws.cell(row=1, column=c_val, value=f"{lk.label_ar} — {lk.label_en}").font = Font(bold=True, color=BRAND)
        ws.cell(row=2, column=c_val, value=lk.key).font = FONT_KEY
        for c, txt in ((c_val, "value / القيمة"), (c_en, "English"), (c_ar, "العربية")):
            cell = ws.cell(row=3, column=c, value=txt)
            cell.font, cell.fill = FONT_HDR, FILL_HEADER
        for i, (value, en, ar) in enumerate(lk.values, start=4):
            ws.cell(row=i, column=c_val, value=value).border = BORDER
            ws.cell(row=i, column=c_en, value=en).border = BORDER
            ws.cell(row=i, column=c_ar, value=ar).border = BORDER
        letter = get_column_letter(c_val)
        ranges[lk.key] = f"{quote_sheetname(ws.title)}!${letter}$4:${letter}${3 + len(lk.values)}"
        ws.column_dimensions[letter].width = 20
        ws.column_dimensions[get_column_letter(c_en)].width = 22
        ws.column_dimensions[get_column_letter(c_ar)].width = 22
        ws.column_dimensions[get_column_letter(col + 3)].width = 3
        col += 4
    ws.freeze_panes = "A4"
    return ranges


def _write_entity_sheet(ws, sheet: Sheet, rows: list[dict], lookup_ranges: dict[str, str], last_row: int, ref_copy: bool = False) -> None:
    cols = sheet_columns(sheet)
    locked = sheet.reference_only or ref_copy
    ws.sheet_properties.tabColor = "7F8C8D" if locked else BRAND

    for idx, (key, f) in enumerate(cols, start=1):
        letter = get_column_letter(idx)
        h = ws.cell(row=HEADER_ROW, column=idx)
        k = ws.cell(row=KEY_ROW, column=idx, value=key)
        k.font, k.fill, k.border = FONT_KEY, FILL_KEY, BORDER
        h.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
        h.border = BORDER
        if f is None:  # helper column
            target_key = key[len(INFO_PREFIX):]
            target = SHEETS_BY_KEY[sheet.get(target_key).ref]
            h.value = f"↳ {target.ar}\n↳ {target.en} (auto)"
            h.font, h.fill = FONT_HDR, FILL_READONLY_HDR
            ws.column_dimensions[letter].width = 26
            continue
        h.value = _label(f)
        h.font = FONT_HDR
        h.fill = FILL_READONLY_HDR if (f.readonly or locked) else (FILL_REQUIRED if f.required else FILL_HEADER)
        hint = _hint(f)
        if hint:
            h.comment = Comment(hint, "Muktasabat", width=320, height=160)
        ws.column_dimensions[letter].width = f.width

    ws.row_dimensions[HEADER_ROW].height = 46
    ws.freeze_panes = ws.cell(row=FIRST_DATA_ROW, column=2)
    ws.auto_filter.ref = f"A{KEY_ROW}:{get_column_letter(len(cols))}{KEY_ROW + max(len(rows), 1)}"

    # Data
    for r, obj in enumerate(rows, start=FIRST_DATA_ROW):
        for c, (key, f) in enumerate(cols, start=1):
            if f is None:
                continue
            cell = ws.cell(row=r, column=c, value=_cell_value(f, obj[key]))
            if f.readonly or locked:
                cell.fill = FILL_READONLY

    if locked:
        ws.protection.sheet = True  # nothing to edit here
        return

    # Number formats + validations, applied to existing rows and the empty rows below.
    for c, (key, f) in enumerate(cols, start=1):
        letter = get_column_letter(c)
        rng = f"{letter}{FIRST_DATA_ROW}:{letter}{last_row}"
        if f is None:
            target_field = sheet.get(key[len(INFO_PREFIX):])
            target = SHEETS_BY_KEY[target_field.ref]
            src = get_column_letter(c - 1)
            disp = _col_letter(target, target.display)
            tq = quote_sheetname(target.title)
            for r in range(FIRST_DATA_ROW, last_row + 1):
                cell = ws.cell(
                    row=r,
                    column=c,
                    value=(
                        f'=IF({src}{r}="","",IFERROR(INDEX({tq}!${disp}:${disp},'
                        f'MATCH({src}{r},{tq}!$A:$A,0)),"⚠ not found / غير موجود"))'
                    ),
                )
                cell.font, cell.fill = FONT_INFO, FILL_INFO
            continue
        fmt = NUMBER_FORMATS.get(f.kind)
        if f.kind in ("enum",) and f.lookup and isinstance(LOOKUPS[f.lookup].allowed[0], int):
            fmt = "0"
        if fmt:
            for r in range(FIRST_DATA_ROW, last_row + 1):
                ws.cell(row=r, column=c).number_format = fmt
        if f.readonly or f.kind == "id":
            continue
        dv = _dv_for(f, lookup_ranges, last_row)
        if dv is not None:
            ws.add_data_validation(dv)
            dv.add(rng)


def _write_dictionary(ws, sheets: Optional[list[Sheet]] = None) -> None:
    headers = ["Sheet / الورقة", "Column key", "العمود", "Column", "Required / إلزامي",
               "Type", "Lookup / Reference", "Rules / القواعد"]
    for c, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=c, value=h)
        cell.font, cell.fill = FONT_HDR, FILL_HEADER
    r = 2
    for sheet in sheets or SHEETS:
        for f in sheet.fields:
            link = ""
            if f.lookup and f.kind != "bool":
                link = f"Lookups → {f.lookup}"
            elif f.kind == "bool":
                link = "TRUE / FALSE"
            elif f.ref:
                link = f"→ {SHEETS_BY_KEY[f.ref].title}.id"
            rules = _hint(f).replace("\n", " · ")
            values = [
                f"{sheet.title} — {sheet.ar}", f.key, f.ar, f.en,
                "yes / نعم" if f.required else "",
                "read-only" if (f.readonly or sheet.reference_only) else f.kind,
                link, rules,
            ]
            for c, v in enumerate(values, start=1):
                cell = ws.cell(row=r, column=c, value=v)
                cell.border = BORDER
                cell.alignment = Alignment(wrap_text=c == 8, vertical="top")
            r += 1
    for c, w in enumerate([28, 28, 26, 30, 12, 10, 26, 80], start=1):
        ws.column_dimensions[get_column_letter(c)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:H{r - 1}"


def _write_readme(ws, data_rows: dict[str, list[Any]], template: bool, sheets: Optional[list[Sheet]] = None,
                  ref_copies: Optional[set[str]] = None, partial: bool = False) -> None:
    sheets = sheets or list(SHEETS)
    ref_copies = ref_copies or set()
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 34
    ws.column_dimensions["C"].width = 34
    ws.column_dimensions["D"].width = 12
    ws.column_dimensions["E"].width = 70
    ws["B2"] = "Muktasabat — Data management workbook"
    ws["B2"].font = Font(bold=True, size=16, color=BRAND)
    ws["B3"] = "شركة مكتسبات العقارية — ملف إدارة البيانات"
    ws["B3"].font = Font(bold=True, size=14, color=BRAND)
    ws["B4"] = f"Generated {datetime.utcnow():%Y-%m-%d %H:%M} UTC · {('empty template' if template else 'export') + (' · selected sheets' if partial else ' · all sheets')} · {FORMAT_VERSION}"
    ws["B4"].font = Font(color="6B7280", size=9)

    steps = [
        ("1", "Edit the rows you need to fix, or add new rows at the bottom of a sheet.",
         "عدّل السجلات المطلوبة أو أضف سجلات جديدة أسفل الورقة."),
        ("2", "Do not change row 2 (column keys) or the ID of an existing row.",
         "لا تعدّل الصف 2 (مفاتيح الأعمدة) ولا رقم المعرّف للسجلات الحالية."),
        ("3", "New row: leave ID blank — or write NEW-1, NEW-2… and use that key in other sheets to link to it (e.g. a new owner, then its property).",
         "السجل الجديد: اترك المعرّف فارغًا، أو اكتب NEW-1 ، NEW-2 … واستخدمه في الأوراق الأخرى للربط (مثل مالك جديد ثم عقاره)."),
        ("4", "Link columns (…_id) take the ID from the related sheet. The grey ↳ column next to it shows the linked name — '⚠ not found' means the link is wrong.",
         "أعمدة الربط (…_id) تأخذ المعرّف من الورقة المرتبطة، والعمود الرمادي بجانبها يعرض اسم السجل المرتبط — '⚠ غير موجود' يعني أن الربط خاطئ."),
        ("5", "Lookup columns accept only the values in sheet 'Lookups' (use the drop-down). Yes/No columns take TRUE / FALSE. Dates are YYYY-MM-DD.",
         "أعمدة القوائم تقبل القيم الموجودة في ورقة Lookups فقط (استخدم القائمة المنسدلة). أعمدة نعم/لا تقبل TRUE / FALSE. التواريخ بصيغة YYYY-MM-DD."),
        ("6", "Orange headers are required. Grey columns are read-only (calculated by the system) and are ignored on upload.",
         "العناوين البرتقالية إلزامية. الأعمدة الرمادية للاطلاع فقط (يحسبها النظام) ويتم تجاهلها عند الرفع."),
        ("7", "Upload in Admin → Data management. Click Validate first: the whole file is checked and every error is listed with sheet, row and column. Nothing is saved until the file has zero errors and you click Apply.",
         "ارفع الملف من الإدارة ← إدارة البيانات. اضغط «تحقق» أولًا: يُفحص الملف كاملًا وتظهر كل الأخطاء بالورقة والصف والعمود. لا يُحفظ أي شيء حتى يصبح الملف خاليًا من الأخطاء وتضغط «تطبيق»."),
        ("8", "The upload is all-or-nothing. Rows you delete from the file are NOT deleted from the system. Sheets you remove from the file are skipped.",
         "الرفع يتم كاملًا أو لا يتم. حذف صف من الملف لا يحذفه من النظام. الأوراق المحذوفة من الملف يتم تجاهلها."),
        ("9", "Photos, documents and attachments are managed in the portal, not in this file. Users and passwords are managed in User Management.",
         "الصور والمستندات والمرفقات تُدار من البوابة وليس من هذا الملف. المستخدمون وكلمات المرور تُدار من إدارة المستخدمين."),
    ]
    r = 6
    ws.cell(row=r, column=2, value="How to use / طريقة الاستخدام").font = Font(bold=True, size=12, color=BRAND)
    r += 1
    for n, en, ar in steps:
        for text, rtl in ((en, False), (ar, True)):
            num = ws.cell(row=r, column=1, value=n if not rtl else None)
            num.font = Font(bold=True, color=BRAND)
            num.alignment = Alignment(vertical="top")
            cell = ws.cell(row=r, column=2, value=text)
            ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=5)
            cell.alignment = Alignment(
                wrap_text=True, vertical="top",
                horizontal="right" if rtl else "left", readingOrder=2 if rtl else 1,
            )
            if rtl:
                cell.font = Font(color="374151")
            ws.row_dimensions[r].height = 32 if len(text) > 110 else 18
            r += 1
    r += 1
    ws.cell(row=r, column=2, value="Sheets / الأوراق").font = Font(bold=True, size=12, color=BRAND)
    r += 1
    for c, h in enumerate(["Sheet", "الورقة", "Rows / السجلات", "Notes"], start=2):
        cell = ws.cell(row=r, column=c, value=h)
        cell.font, cell.fill = FONT_HDR, FILL_HEADER
    r += 1
    for sheet in sheets:
        ws.cell(row=r, column=2, value=sheet.title).hyperlink = f"#{quote_sheetname(sheet.title)}!A1"
        ws.cell(row=r, column=2).font = Font(color="1D4ED8", underline="single")
        ws.cell(row=r, column=3, value=sheet.ar)
        ws.cell(row=r, column=4, value=len(data_rows[sheet.key]))
        ws.cell(row=r, column=5, value=(
            "Reference only — not imported / للاطلاع فقط" if sheet.reference_only
            else "Included for ID look-ups only — locked, not imported / مرجعية للربط فقط — مقفلة ولا تُستورد" if sheet.key in ref_copies
            else sheet.en))
        r += 1
    for extra, ar, note in (("Lookups", "القوائم المرجعية", "Allowed values for every drop-down"),
                            ("Dictionary", "قاموس البيانات", "Every column: type, required, rules")):
        ws.cell(row=r, column=2, value=extra).hyperlink = f"#{quote_sheetname(extra)}!A1"
        ws.cell(row=r, column=2).font = Font(color="1D4ED8", underline="single")
        ws.cell(row=r, column=3, value=ar)
        ws.cell(row=r, column=5, value=note)
        r += 1
