"""Generic branded export: the portal sends a table it already shows
(owners list, tenants list, import errors…) and gets it back as a
Muktasabat-branded Excel file, so every download has the same look."""
from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from api.deps import CurrentUser
from api.services.branded_xlsx import details_line, table_workbook, xlsx_response

router = APIRouter(prefix="/exports", tags=["exports"])


class TableIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    filename: str = Field(default="muktasabat-export", pattern=r"^[A-Za-z0-9._-]{1,80}$")
    header: list[str] = Field(min_length=1, max_length=60)
    rows: list[list[Any]] = Field(default_factory=list, max_length=20000)
    locale: str = Field(default="ar", pattern="^(ar|en)$")
    details: Optional[str] = Field(default=None, max_length=300)


@router.post("/table.xlsx")
def table(payload: TableIn, user: CurrentUser):
    who = (user.full_name_ar if payload.locale == "ar" else user.full_name) or user.full_name or user.username
    rows = [[("" if v is None else v) if isinstance(v, (str, int, float, bool)) or v is None else str(v) for v in r[:60]] for r in payload.rows]
    extra = [payload.details] if payload.details else []
    extra.append(f"عدد السجلات: {len(rows)}" if payload.locale == "ar" else f"Records: {len(rows)}")
    data = table_workbook(payload.title, payload.header, rows, payload.locale, details=details_line(payload.locale, who, extra))
    return xlsx_response(data, payload.filename)
