"""Validate and apply an uploaded data-management workbook (استيراد البيانات).

The import is strict and all-or-nothing:

1. **Structure** — the file must be a Muktasabat data workbook (hidden
   ``_meta`` sheet), every sheet must carry exactly the expected column keys.
2. **Cells** — every value is checked against its column spec: type, required,
   length, numeric range, lookup membership and format (phone, IBAN, ID …).
   Nothing is coerced silently: a number Excel turned into a date, a phone that
   lost its leading zero, a lookup typed as its label — all are errors.
3. **References** — every ``…_id`` must point at an existing record or at a
   ``NEW-…`` row in the same file; existing row IDs must exist.
4. **Business rules** — uniqueness and cross-record rules are evaluated on the
   *final* state (database merged with the file), so a fix in one sheet that
   resolves a rule in another is understood.

Only when the whole workbook has zero errors does :func:`apply_workbook` write,
inside one transaction; any database error rolls everything back.
"""
from __future__ import annotations

import io
import math
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Any, Optional

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.services.data_io.export import FIRST_DATA_ROW, INFO_PREFIX, KEY_ROW
from api.services.data_io.spec import (
    FORMAT_VERSION,
    FORMATS,
    LOOKUPS,
    SHEETS,
    SHEETS_BY_KEY,
    SHEETS_BY_TITLE,
    F,
    Sheet,
)

MAX_ERRORS_RETURNED = 2000
NON_DATA_SHEETS = {"README", "Lookups", "Dictionary", "_meta"}
NEW_KEY_RE = re.compile(r"^NEW-[A-Za-z0-9_\-]{1,40}$", re.IGNORECASE)
INT_RE = re.compile(r"^-?\d+$")
NUM_RE = re.compile(r"^-?\d+(\.\d+)?$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TRUE_STRINGS, FALSE_STRINGS = {"true"}, {"false"}


# ══════════════════════════════════════════════════════════════════════════════
# Report
# ══════════════════════════════════════════════════════════════════════════════


@dataclass
class Issue:
    sheet: str
    row: Optional[int]
    column: Optional[str]
    value: Any
    message_en: str
    message_ar: str

    def as_dict(self) -> dict:
        sheet = SHEETS_BY_KEY.get(self.sheet)
        label_en = label_ar = None
        if sheet and self.column:
            try:
                f_ = sheet.get(self.column)
                label_en, label_ar = f_.en, f_.ar
            except KeyError:
                pass
        v = self.value
        if isinstance(v, (date, datetime)):
            v = v.isoformat()
        elif v is not None and not isinstance(v, (int, float, bool)):
            v = str(v)[:120]
        return {
            "sheet": self.sheet,
            "sheet_title": sheet.title if sheet else self.sheet,
            "sheet_ar": sheet.ar if sheet else self.sheet,
            "row": self.row,
            "column": self.column,
            "column_en": label_en,
            "column_ar": label_ar,
            "value": v,
            "message_en": self.message_en,
            "message_ar": self.message_ar,
        }


@dataclass
class ParsedRow:
    excel_row: int
    key: Any  # int (existing id) | "NEW-…" | "__row<N>" (blank id)
    values: dict[str, Any]
    is_new: bool


@dataclass
class Report:
    issues: list[Issue] = field(default_factory=list)
    rows: dict[str, list[ParsedRow]] = field(default_factory=dict)
    summary: dict[str, dict[str, int]] = field(default_factory=dict)

    def add(self, sheet: str, row: Optional[int], column: Optional[str], value: Any, en: str, ar: str) -> None:
        self.issues.append(Issue(sheet, row, column, value, en, ar))

    @property
    def ok(self) -> bool:
        return not self.issues

    def as_dict(self, *, applied: bool = False) -> dict:
        return {
            "ok": self.ok,
            "applied": applied,
            "error_count": len(self.issues),
            "errors": [i.as_dict() for i in self.issues[:MAX_ERRORS_RETURNED]],
            "truncated": len(self.issues) > MAX_ERRORS_RETURNED,
            "summary": [
                {"sheet": s.key, "title": s.title, "title_ar": s.ar, **self.summary.get(s.key, {})}
                for s in SHEETS
                if s.key in self.summary
            ],
        }


class FatalImportError(Exception):
    """The file is not a usable data workbook; nothing else is checked."""

    def __init__(self, en: str, ar: str):
        super().__init__(en)
        self.en, self.ar = en, ar


# ══════════════════════════════════════════════════════════════════════════════
# Cell parsing
# ══════════════════════════════════════════════════════════════════════════════


class CellError(Exception):
    def __init__(self, en: str, ar: str):
        super().__init__(en)
        self.en, self.ar = en, ar


def _blank(v: Any) -> bool:
    return v is None or (isinstance(v, str) and v.strip() == "")


def _number_to_code(v: float | int) -> str:
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v) or not v.is_integer():
            raise CellError("Expected text, found a decimal number", "القيمة المتوقعة نص وليست رقمًا عشريًا")
        v = int(v)
    return str(v)


def parse_ref(v: Any) -> Any:
    if isinstance(v, bool):
        raise CellError("Expected an ID number or NEW-… key", "المتوقع رقم معرّف أو مفتاح NEW-…")
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        if v.is_integer() and v > 0:
            return int(v)
        raise CellError("ID must be a whole number", "المعرّف يجب أن يكون رقمًا صحيحًا")
    if isinstance(v, str):
        s = v.strip()
        if INT_RE.match(s) and int(s) > 0:
            return int(s)
        if NEW_KEY_RE.match(s):
            return "NEW-" + s[4:]
    raise CellError("Expected an existing ID number or a NEW-… key (e.g. NEW-1)",
                    "المتوقع رقم معرّف موجود أو مفتاح جديد مثل NEW-1")


def parse_cell(f: F, raw: Any) -> Any:
    """Return the typed value for ``raw`` or raise :class:`CellError`."""
    if _blank(raw):
        if f.required and not f.has_default:
            raise CellError("Required value is missing", "قيمة إلزامية مفقودة")
        return f.default if f.has_default else None

    k = f.kind
    if k in ("str", "text"):
        if isinstance(raw, bool):
            raise CellError("Expected text, found TRUE/FALSE", "المتوقع نص وليس TRUE/FALSE")
        if isinstance(raw, (datetime, date, time)):
            raise CellError("Excel converted this value to a date — format the cell as Text and re-type it",
                            "حوّل Excel القيمة إلى تاريخ — اجعل تنسيق الخلية «نص» وأعد كتابتها")
        if isinstance(raw, (int, float)):
            if not f.numeric_ok:
                raise CellError("Must be typed as text (Excel removes the leading 0 from numbers) — format the cell as Text",
                                "يجب إدخالها كنص (يحذف Excel الصفر في البداية من الأرقام) — اجعل تنسيق الخلية «نص»")
            s = _number_to_code(raw)
        else:
            s = str(raw).strip()
        if "\n" in s and k == "str":
            raise CellError("Line breaks are not allowed in this column", "لا يُسمح بأسطر جديدة في هذا العمود")
        if f.max_len and len(s) > f.max_len:
            raise CellError(f"Too long: {len(s)} characters, maximum is {f.max_len}",
                            f"النص طويل: {len(s)} حرفًا والحد الأقصى {f.max_len}")
        if f.fmt and not FORMATS[f.fmt].regex.match(s):
            fmt = FORMATS[f.fmt]
            if f.fmt == "phone" and re.fullmatch(r"5\d{8}", s):
                raise CellError(f"Mobile number is missing its leading 0 — write it as 0{s} (cell formatted as Text)",
                                f"رقم الجوال ينقصه الصفر في البداية — اكتبه 0{s} (بتنسيق «نص»)")
            raise CellError(f"{fmt.en} (e.g. {fmt.example})", f"{fmt.ar} (مثال: {fmt.example})")
        return s

    if k == "int":
        if isinstance(raw, bool):
            raise CellError("Expected a whole number", "المتوقع رقم صحيح")
        if isinstance(raw, int):
            n = raw
        elif isinstance(raw, float) and raw.is_integer():
            n = int(raw)
        elif isinstance(raw, str) and INT_RE.match(raw.strip()):
            n = int(raw.strip())
        else:
            raise CellError("Expected a whole number", "المتوقع رقم صحيح")
        _check_range(f, n)
        return n

    if k == "float":
        if isinstance(raw, bool):
            raise CellError("Expected a number", "المتوقع رقم")
        if isinstance(raw, (int, float)):
            x = float(raw)
        elif isinstance(raw, str) and NUM_RE.match(raw.strip()):
            x = float(raw.strip())
        else:
            raise CellError("Expected a number (no currency symbols or thousands separators)",
                            "المتوقع رقم (بدون رمز العملة أو فواصل الآلاف)")
        if math.isnan(x) or math.isinf(x):
            raise CellError("Expected a number", "المتوقع رقم")
        _check_range(f, x)
        return round(x, 6)

    if k == "bool":
        if isinstance(raw, bool):
            return raw
        if isinstance(raw, str) and raw.strip().lower() in TRUE_STRINGS:
            return True
        if isinstance(raw, str) and raw.strip().lower() in FALSE_STRINGS:
            return False
        raise CellError("Must be TRUE or FALSE", "يجب أن تكون القيمة TRUE أو FALSE")

    if k in ("date", "datetime"):
        if isinstance(raw, datetime):
            if k == "date" and raw.time() != time(0, 0):
                raise CellError("Expected a date without a time", "المتوقع تاريخ بدون وقت")
            d = raw.date()
        elif isinstance(raw, date):
            d = raw
        elif isinstance(raw, str) and DATE_RE.match(raw.strip()):
            try:
                d = date.fromisoformat(raw.strip())
            except ValueError:
                raise CellError("Not a real calendar date", "التاريخ غير موجود في التقويم")
        else:
            raise CellError("Expected a date in the format YYYY-MM-DD (Gregorian)",
                            "المتوقع تاريخ ميلادي بصيغة YYYY-MM-DD")
        if not (1900 <= d.year <= 2100):
            raise CellError("Date is out of range (1900–2100) — Hijri dates must be converted to Gregorian",
                            "التاريخ خارج النطاق (1900–2100) — يجب تحويل التاريخ الهجري إلى ميلادي")
        return d

    if k == "enum":
        lk = LOOKUPS[f.lookup]
        allowed = lk.allowed
        if isinstance(allowed[0], int):
            v = None
            if isinstance(raw, int) and not isinstance(raw, bool):
                v = raw
            elif isinstance(raw, float) and raw.is_integer():
                v = int(raw)
            elif isinstance(raw, str) and INT_RE.match(raw.strip()):
                v = int(raw.strip())
            if v in allowed:
                return v
        else:
            s = str(raw).strip() if not isinstance(raw, (int, float, bool)) else None
            if s in allowed:
                return s
            for value, en, ar in lk.values:
                if s and s.lower() in (str(value).lower(), en.lower(), ar):
                    raise CellError(f"Use the lookup value '{value}' (not '{s}')",
                                    f"استخدم قيمة القائمة '{value}' بدلًا من '{s}'")
        vals = ", ".join(str(a) for a in allowed)
        raise CellError(f"Not in lookup '{lk.key}'. Allowed: {vals}",
                        f"القيمة غير موجودة في قائمة {lk.label_ar}. القيم المسموحة: {vals}")

    if k == "ref":
        return parse_ref(raw)

    raise CellError(f"Unsupported column type {k}", f"نوع عمود غير مدعوم {k}")


def _check_range(f: F, x: float) -> None:
    if f.min is not None and x < f.min:
        raise CellError(f"Must be ≥ {f.min:g}", f"يجب أن تكون ≥ {f.min:g}")
    if f.gt is not None and x <= f.gt:
        raise CellError(f"Must be greater than {f.gt:g}", f"يجب أن تكون أكبر من {f.gt:g}")
    if f.max is not None and x > f.max:
        raise CellError(f"Must be ≤ {f.max:g}", f"يجب أن تكون ≤ {f.max:g}")


# ══════════════════════════════════════════════════════════════════════════════
# Final-state context (database ⊕ file) for references and business rules
# ══════════════════════════════════════════════════════════════════════════════


class Context:
    def __init__(self, db: Session):
        self.db_rows: dict[str, dict[int, dict]] = {}
        for sheet in SHEETS:
            cols = [getattr(sheet.model, f_.key) for f_ in sheet.fields]
            rows = db.execute(select(*cols)).all()
            keys = [f_.key for f_ in sheet.fields]
            self.db_rows[sheet.key] = {r[0]: dict(zip(keys, r)) for r in rows}
        self.merged: dict[str, dict[Any, dict]] = {k: dict(v) for k, v in self.db_rows.items()}

    def overlay(self, sheet: str, key: Any, values: dict) -> None:
        self.merged[sheet][key] = {"id": key, **values}

    def exists(self, sheet: str, ref: Any) -> bool:
        return ref in self.merged[sheet]

    def record(self, sheet: str, ref: Any) -> Optional[dict]:
        if ref is None:
            return None
        return self.merged[sheet].get(ref)

    @staticmethod
    def same(a: Any, b: Any) -> Optional[bool]:
        if a is None or b is None:
            return None
        return a == b

    def children(self, sheet: str, fk: str, ref: Any) -> list[dict]:
        return [r for r in self.merged[sheet].values() if r.get(fk) == ref]


# ══════════════════════════════════════════════════════════════════════════════
# Validation
# ══════════════════════════════════════════════════════════════════════════════


def _open(data: bytes):
    try:
        return load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception:
        raise FatalImportError("The file is not a valid Excel workbook (.xlsx)",
                               "الملف ليس ملف Excel صالحًا (.xlsx)")


def _equal(a: Any, b: Any) -> bool:
    if isinstance(a, float) or isinstance(b, float):
        try:
            return a is not None and b is not None and abs(float(a) - float(b)) < 1e-6
        except (TypeError, ValueError):
            return False
    if isinstance(b, datetime) and isinstance(a, date) and not isinstance(a, datetime):
        return a == b.date()
    return a == b


def validate_workbook(db: Session, data: bytes) -> Report:
    report = Report()
    wb = _open(data)
    try:
        if "_meta" not in wb.sheetnames:
            raise FatalImportError(
                "This is not a Muktasabat data workbook. Download the export or template from Data management and edit that file.",
                "هذا ليس ملف بيانات مكتسبات. نزّل ملف التصدير أو القالب من إدارة البيانات وعدّل عليه.",
            )
        meta = {r[0]: r[1] for r in wb["_meta"].iter_rows(min_row=1, max_row=10, max_col=2, values_only=True) if r and r[0]}
        if meta.get("format") != FORMAT_VERSION:
            raise FatalImportError(
                f"Workbook format '{meta.get('format')}' is not supported (expected {FORMAT_VERSION}). Download a fresh export.",
                "إصدار الملف غير مدعوم. نزّل ملف تصدير جديد.",
            )

        for name in wb.sheetnames:
            if name not in NON_DATA_SHEETS and name not in SHEETS_BY_TITLE:
                report.add(name, None, None, None,
                           f"Unknown sheet '{name}' — remove it or restore its original name",
                           f"ورقة غير معروفة '{name}' — احذفها أو أعد اسمها الأصلي")

        ctx = Context(db)
        for sheet in SHEETS:
            if sheet.reference_only or sheet.title not in wb.sheetnames:
                continue
            _read_sheet(wb[sheet.title], sheet, ctx, report)
    finally:
        wb.close()

    _check_ids_and_refs(report, ctx)
    _check_unique(report, ctx)
    _check_rules(report, ctx)
    _summarise(report, ctx)
    report.issues.sort(key=lambda i: ([s.key for s in SHEETS].index(i.sheet) if i.sheet in SHEETS_BY_KEY else -1, i.row or 0))
    return report


def _read_sheet(ws, sheet: Sheet, ctx: Context, report: Report) -> None:
    rows_iter = ws.iter_rows(min_row=KEY_ROW, values_only=True)
    try:
        key_row = next(rows_iter)
    except StopIteration:
        report.add(sheet.key, None, None, None, "Sheet is empty — the column keys in row 2 are missing",
                   "الورقة فارغة — مفاتيح الأعمدة في الصف 2 مفقودة")
        return

    col_index: dict[str, int] = {}
    for i, k in enumerate(key_row):
        if _blank(k):
            continue
        k = str(k).strip()
        if k.startswith(INFO_PREFIX):
            continue
        if k in col_index:
            report.add(sheet.key, KEY_ROW, k, k, f"Column '{k}' appears twice", f"العمود '{k}' مكرر")
            continue
        try:
            sheet.get(k)
        except KeyError:
            report.add(sheet.key, KEY_ROW, k, k, f"Unknown column key '{k}' in row 2",
                       f"مفتاح عمود غير معروف '{k}' في الصف 2")
            continue
        col_index[k] = i
    missing = [f_.key for f_ in sheet.fields if f_.key not in col_index and (f_.kind == "id" or not f_.readonly)]
    for k in missing:
        report.add(sheet.key, KEY_ROW, k, None, f"Column '{k}' is missing from row 2",
                   f"العمود '{k}' مفقود من الصف 2")
    if missing or "id" not in col_index:
        return

    parsed: list[ParsedRow] = []
    seen_keys: dict[Any, int] = {}
    for offset, raw_row in enumerate(rows_iter):
        excel_row = KEY_ROW + 1 + offset
        if excel_row < FIRST_DATA_ROW:
            continue

        def cell(key: str) -> Any:
            idx = col_index[key]
            return raw_row[idx] if idx < len(raw_row) else None

        if all(_blank(cell(f_.key)) for f_ in sheet.importable) and _blank(cell("id")):
            continue

        # Row key
        raw_id = cell("id")
        if _blank(raw_id):
            key, is_new = f"__row{excel_row}", True
        else:
            try:
                key = parse_ref(raw_id)
                is_new = isinstance(key, str)
            except CellError as e:
                report.add(sheet.key, excel_row, "id", raw_id, e.en, e.ar)
                continue
            if key in seen_keys:
                report.add(sheet.key, excel_row, "id", raw_id,
                           f"Duplicate ID — also used on row {seen_keys[key]}",
                           f"معرّف مكرر — مستخدم أيضًا في الصف {seen_keys[key]}")
                continue
            if not is_new and key not in ctx.db_rows[sheet.key]:
                report.add(sheet.key, excel_row, "id", raw_id,
                           f"ID {key} does not exist in the system. Leave ID blank (or use NEW-…) for a new record",
                           f"المعرّف {key} غير موجود في النظام. اترك المعرّف فارغًا (أو استخدم NEW-…) للسجل الجديد")
                continue
            seen_keys[key] = excel_row

        values: dict[str, Any] = {}
        for f_ in sheet.importable:
            raw = cell(f_.key)
            try:
                values[f_.key] = parse_cell(f_, raw)
            except CellError as e:
                report.add(sheet.key, excel_row, f_.key, raw, e.en, e.ar)
                values[f_.key] = None
        parsed.append(ParsedRow(excel_row, key, values, is_new))
        ctx.overlay(sheet.key, key, values)
    report.rows[sheet.key] = parsed


def _check_ids_and_refs(report: Report, ctx: Context) -> None:
    for sheet in SHEETS:
        for row in report.rows.get(sheet.key, []):
            for f_ in sheet.importable:
                if f_.kind != "ref":
                    continue
                ref = row.values.get(f_.key)
                if ref is None:
                    continue
                target = SHEETS_BY_KEY[f_.ref]
                if isinstance(ref, str):
                    if ref not in ctx.merged[target.key]:
                        report.add(sheet.key, row.excel_row, f_.key, ref,
                                   f"No row with ID '{ref}' in sheet '{target.title}'",
                                   f"لا يوجد سجل بالمعرّف '{ref}' في ورقة {target.ar}")
                elif ref not in ctx.db_rows[target.key]:
                    report.add(sheet.key, row.excel_row, f_.key, ref,
                               f"{target.en} with ID {ref} does not exist",
                               f"لا يوجد سجل بالمعرّف {ref} في {target.ar}")


def _check_unique(report: Report, ctx: Context) -> None:
    for sheet in SHEETS:
        rows = report.rows.get(sheet.key)
        if not rows:
            continue
        for group in sheet.unique:
            owners: dict[tuple, list[Any]] = defaultdict(list)
            for key, rec in ctx.merged[sheet.key].items():
                vals = tuple(rec.get(k) for k in group)
                if vals[0] is None:
                    continue
                if len(group) == 1 and isinstance(vals[0], str):
                    vals = (vals[0].strip().lower(),)
                owners[vals].append(key)
            for row in rows:
                vals = tuple(row.values.get(k) for k in group)
                if vals[0] is None:
                    continue
                if len(group) == 1 and isinstance(vals[0], str):
                    vals = (vals[0].strip().lower(),)
                others = [k for k in owners.get(vals, []) if k != row.key]
                if others:
                    where = ", ".join(str(o) if not str(o).startswith("__row") else f"row {str(o)[5:]}" for o in others[:5])
                    cols = " + ".join(group)
                    report.add(sheet.key, row.excel_row, group[-1] if len(group) > 1 else group[0],
                               " / ".join(str(v) for v in vals),
                               f"Duplicate {cols} — already used by ID {where}",
                               f"قيمة مكررة ({cols}) — مستخدمة أيضًا في المعرّف {where}")


def _check_rules(report: Report, ctx: Context) -> None:
    for sheet in SHEETS:
        for row in report.rows.get(sheet.key, []):
            rec = ctx.record(sheet.key, row.key) or row.values
            for rule in sheet.rules:
                for col, en, ar in rule(rec, ctx):
                    report.add(sheet.key, row.excel_row, col, rec.get(col), en, ar)


def _summarise(report: Report, ctx: Context) -> None:
    for sheet in SHEETS:
        rows = report.rows.get(sheet.key)
        if rows is None:
            continue
        created = updated = unchanged = invalid = 0
        bad_rows = {i.row for i in report.issues if i.sheet == sheet.key and i.row is not None}
        for row in rows:
            if row.excel_row in bad_rows:
                invalid += 1
                continue
            if row.is_new:
                created += 1
                continue
            current = ctx.db_rows[sheet.key][row.key]
            if all(_equal(row.values[f_.key], current.get(f_.key)) for f_ in sheet.importable):
                unchanged += 1
            else:
                updated += 1
        errors = sum(1 for i in report.issues if i.sheet == sheet.key)
        report.summary[sheet.key] = {
            "rows": len(rows), "create": created, "update": updated, "unchanged": unchanged,
            "invalid_rows": invalid, "errors": errors,
        }


# ══════════════════════════════════════════════════════════════════════════════
# Apply
# ══════════════════════════════════════════════════════════════════════════════


def apply_workbook(db: Session, report: Report) -> None:
    """Write a validated report in one transaction (caller commits / rolls back)."""
    from api.contract_totals import compute_contract_totals
    from api.models import Contract, ManagementContract
    from api.routers.management import _apply_fee_totals

    assert report.ok, "refusing to apply a workbook with errors"
    key_map: dict[tuple[str, Any], int] = {}
    touched_contracts: set[int] = set()

    def resolve(target: str, ref: Any) -> Any:
        if isinstance(ref, str):
            return key_map[(target, ref)]
        return ref

    for sheet in SHEETS:
        for row in report.rows.get(sheet.key, []):
            values = {}
            for f_ in sheet.importable:
                v = row.values[f_.key]
                values[f_.key] = resolve(f_.ref, v) if f_.kind == "ref" and v is not None else v
            if row.is_new:
                obj = sheet.model(**values)
                db.add(obj)
                db.flush()
                key_map[(sheet.key, row.key)] = obj.id
            else:
                obj = db.get(sheet.model, row.key)
                for k, v in values.items():
                    if not _equal(v, getattr(obj, k)):
                        setattr(obj, k, v)
                db.flush()
            if sheet.key == "contracts":
                touched_contracts.add(obj.id)

    for cid in touched_contracts:
        c = db.get(Contract, cid)
        c.vat_rate, c.vat_amount, c.total_amount = compute_contract_totals(
            total_rent_amount=c.total_rent_amount,
            insurance_amount=c.insurance_amount,
            electricity_amount=c.electricity_amount,
            water_amount=c.water_amount,
            services_amount=c.services_amount,
            vat_rate=c.vat_rate,
        )
    db.flush()  # before expire_all below, which would otherwise discard these

    # Fees depend on contract terms, the managed portfolio and unit rents, any
    # of which the file may have changed — recompute every mandate.
    if any(report.rows.get(k) for k in ("management_contracts", "management_contract_properties", "units")):
        db.expire_all()
        for mc in db.scalars(select(ManagementContract)).all():
            _apply_fee_totals(db, mc)
    db.flush()
