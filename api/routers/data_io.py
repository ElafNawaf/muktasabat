"""Admin data management (إدارة البيانات): bulk Excel export, validation and import.

    GET  /data-io/summary            record counts per entity sheet
    GET  /data-io/export             workbook (all entities, or ?sheets=a,b — linked sheets added as locked references)
    GET  /data-io/export?template=1  same workbook with no data rows
    POST /data-io/validate           check an edited workbook, write nothing
    POST /data-io/apply              re-validate and, only with zero errors, import

Admin only. The import is all-or-nothing (one transaction).
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse, Response
from sqlalchemy import func, select

from api.permissions import Perm
from api.deps import AdminUser, DbSession
from api.models import AuditLog
from api.services.data_io.export import build_workbook
from api.services.data_io.importer import FatalImportError, apply_workbook, validate_workbook
from api.services.data_io.spec import LOOKUPS, SHEETS

log = logging.getLogger(__name__)

router = APIRouter(prefix="/data-io", tags=["data-management"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _group(key: str) -> str:
    if key.startswith("hr_"):
        return "hr"
    if key in ("work_orders", "lease_renewals"):
        return "operations"
    if key in ("payments", "payment_splits", "expenses", "collection_actions"):
        return "finance"
    if key in ("users", "agents", "employees", "management_companies"):
        return "organisation"
    return "property"


@router.get("/summary")
def summary(db: DbSession, _admin: Perm("data", "view")):
    return {
        "sheets": [
            {
                "sheet": s.key,
                "group": _group(s.key),
                "title": s.title,
                "title_en": s.en,
                "title_ar": s.ar,
                "reference_only": s.reference_only,
                "count": db.scalar(select(func.count()).select_from(s.model)) or 0,
                "columns": len([f for f in s.fields if not f.readonly and f.kind != "id"]),
                "refs": sorted({f.ref for f in s.fields if f.kind == "ref" and f.ref}),
            }
            for s in SHEETS
        ],
        "lookups": [
            {"key": lk.key, "label_en": lk.label_en, "label_ar": lk.label_ar, "count": len(lk.values)}
            for lk in LOOKUPS.values()
        ],
    }


@router.get("/export")
def export(db: DbSession, admin: Perm("data", "view"), template: bool = False, sheets: Optional[str] = None):
    """`sheets` = comma-separated sheet keys to export (empty → every sheet)."""
    keys = [k.strip() for k in (sheets or "").split(",") if k.strip()] or None
    try:
        content = build_workbook(db, template=template, exported_by=admin.username, keys=keys)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M")
    part = "" if not keys else ("-" + "-".join(keys[:3]) + ("-more" if len(keys) > 3 else ""))
    name = f"muktasabat-{'template' if template else 'data'}{part}-{stamp}.xlsx"
    db.add(AuditLog(user_id=admin.id, username=admin.username, action="data_export",
                    entity_type="data_io", details={"template": template, "sheets": keys or "all"}))
    db.commit()
    return Response(
        content,
        media_type=XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"},
    )


async def _read_upload(file: UploadFile) -> bytes:
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Upload the .xlsx file exported from Data management")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is larger than 25 MB")
    return data


def _fatal(e: FatalImportError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "ok": False, "applied": False, "error_count": 1, "truncated": False, "summary": [],
            "errors": [{"sheet": None, "sheet_title": None, "sheet_ar": None, "row": None, "column": None,
                        "column_en": None, "column_ar": None, "value": None,
                        "message_en": e.en, "message_ar": e.ar}],
        },
    )


@router.post("/validate")
async def validate(db: DbSession, _admin: Perm("data", "create"), file: UploadFile = File(...)):
    data = await _read_upload(file)
    try:
        report = validate_workbook(db, data)
    except FatalImportError as e:
        return _fatal(e)
    return report.as_dict()


@router.post("/apply")
async def apply(request: Request, db: DbSession, admin: Perm("data", "create"), file: UploadFile = File(...)):
    data = await _read_upload(file)
    try:
        report = validate_workbook(db, data)
    except FatalImportError as e:
        return _fatal(e)
    if not report.ok:
        return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=report.as_dict())

    try:
        apply_workbook(db, report)
        db.add(AuditLog(
            user_id=admin.id, username=admin.username, action="data_import", entity_type="data_io",
            details={"file": file.filename, "summary": report.as_dict()["summary"]},
            ip_address=request.client.host if request.client else None,
        ))
        db.commit()
    except Exception as exc:  # roll back everything — the import is all-or-nothing
        db.rollback()
        log.exception("data import failed")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Import failed and was fully rolled back — no data was changed. ({type(exc).__name__}: {exc})"[:500],
        )
    return report.as_dict(applied=True)
