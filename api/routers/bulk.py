"""Bulk actions on list pages (select many rows → delete).

Each record goes through its module's own delete endpoint function, so the same rules
(permission, linked-record checks, file clean-up, audit) apply as deleting one by one.
Records that can't be deleted are reported back; the rest are still deleted.
"""

from __future__ import annotations

from typing import Callable

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from api.deps import CurrentUser, DbSession
from api.permissions import has_permission

router = APIRouter(prefix="/bulk", tags=["bulk"])


def _registry() -> dict[str, tuple[str, Callable]]:
    from api.routers import agents, buildings, contracts, expenses, management, owners, tenants

    return {
        "tenants": ("tenants", tenants.delete_tenant),
        "owners": ("owners", owners.delete_owner),
        "agents": ("agents", agents.delete_agent),
        "contracts": ("contracts", contracts.delete_contract),
        "management_contracts": ("management_contracts", management.delete_management_contract),
        "expenses": ("expenses", expenses.delete_expense),
        "buildings": ("properties", buildings.delete_building),
    }


def _blocker(entity: str, db, rid: int, ar: bool) -> str | None:
    """Records that must not disappear in a bulk delete (their history would go with them)."""
    from sqlalchemy import func, select

    from api.models import Building, Contract, ManagementContract, Payment

    n = lambda q: db.scalar(select(func.count()).select_from(q.subquery())) or 0  # noqa: E731
    if entity == "tenants":
        c = n(select(Contract.id).where(Contract.tenant_id == rid))
        if c:
            return f"لديه {c} عقد إيجار — احذف العقود أو انقلها أولًا" if ar else f"Has {c} lease(s) — delete or reassign them first"
    if entity == "owners":
        b = n(select(Building.id).where(Building.owner_id == rid))
        m = n(select(ManagementContract.id).where(ManagementContract.owner_id == rid))
        if b or m:
            return (f"يملك {b} عقار و{m} عقد إدارة — انقلها أو احذفها أولًا" if ar
                    else f"Owns {b} propert(ies) and {m} management contract(s) — move or delete them first")
    if entity == "contracts":
        p = n(select(Payment.id).where(Payment.contract_id == rid, Payment.status == "paid"))
        if p:
            return (f"عليه {p} دفعة مسدّدة بسندات — أنهِ العقد بدل حذفه" if ar
                    else f"Has {p} paid instalment(s) with receipts — end the lease instead of deleting it")
    if entity == "buildings":
        c = n(select(Contract.id).join(Contract.unit).where(Contract.unit.has(building_id=rid)))
        if c:
            return f"عليه {c} عقد إيجار — لا يُحذف عقار له عقود" if ar else f"Has {c} lease(s) — a property with leases can't be deleted"
    return None


class BulkIds(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)


@router.post("/{entity}/delete")
def bulk_delete(entity: str, body: BulkIds, db: DbSession, user: CurrentUser, locale: str = "ar"):
    reg = _registry()
    if entity not in reg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown list")
    module, delete = reg[entity]
    if not has_permission(db, user, module, "delete"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Permission denied: {module}.delete")
    ar = locale == "ar"
    deleted: list[int] = []
    failed: list[dict] = []
    for rid in dict.fromkeys(body.ids):  # unique, keep order
        why = _blocker(entity, db, rid, ar)
        if why:
            failed.append({"id": rid, "error": why})
            continue
        try:
            delete(rid, db, user)
            deleted.append(rid)
        except HTTPException as e:
            db.rollback()
            failed.append({"id": rid, "error": str(e.detail)})
        except IntegrityError:
            db.rollback()
            failed.append({"id": rid, "error": "مرتبط بسجلات أخرى (عقود أو دفعات…) — احذفها أو انقلها أولًا" if ar
                           else "Linked to other records (leases, payments…) — remove or move those first"})
        except Exception as e:  # noqa: BLE001
            db.rollback()
            failed.append({"id": rid, "error": type(e).__name__})
    return {"deleted": deleted, "failed": failed}
