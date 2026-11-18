from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from api.deps import AdminUser, CurrentUser, DbSession
from api.models import Role
from api.permissions import Perm
from api.schemas.role import RoleCreate, RolePermissionsUpdate, RoleRead

router = APIRouter(prefix="/roles", tags=["roles"])

# Modules and actions a permission cell can describe.
# Every module in the matrix (the old 8-module list silently dropped the rest —
# dashboard, maintenance, hr, website… — whenever a role was saved).
from api.bootstrap_roles import _MODULES as _ALL_MODULES  # noqa: E402

MODULES = set(_ALL_MODULES)
ACTIONS = {"view", "create", "edit", "delete", "approve"}


def _normalize_permissions(perms: dict) -> dict:
    """Return a sanitized copy: drop unknown keys, coerce values to 0|1."""
    clean: dict = {}
    for module_id, mod in (perms or {}).items():
        if module_id not in MODULES or not isinstance(mod, dict):
            continue
        clean[module_id] = {
            action: 1 if mod.get(action) else 0 for action in ACTIONS
        }
    return clean


@router.get("", response_model=list[RoleRead])
def list_roles(db: DbSession, _user: CurrentUser):
    return db.scalars(select(Role).order_by(Role.system.desc(), Role.code)).all()


@router.put("/{code}/permissions", response_model=RoleRead)
def update_role_permissions(
    code: str,
    payload: RolePermissionsUpdate,
    db: DbSession,
    _admin: AdminUser,
):
    role = db.get(Role, code)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    if role.system:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "System role permissions cannot be edited")
    role.permissions = _normalize_permissions(payload.permissions)
    db.commit()
    db.refresh(role)
    from api.scope import forget

    forget()
    return role


class RoleScopeUpdate(BaseModel):
    data_scope: Literal["all", "assigned"]


@router.put("/{code}/scope", response_model=RoleRead)
def update_role_scope(code: str, payload: RoleScopeUpdate, db: DbSession, _admin: AdminUser):
    """'assigned' = users of this role see only the properties they're responsible for."""
    role = db.get(Role, code)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    if role.code in ("admin", "owner", "tenant", "pending"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This role's data scope can't be changed")
    role.data_scope = payload.data_scope
    db.commit()
    db.refresh(role)
    from api.scope import forget

    forget()
    return role


@router.post("", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
def create_role(payload: RoleCreate, db: DbSession, _admin: AdminUser):
    if db.get(Role, payload.code) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Role code already exists")
    role = Role(
        code=payload.code,
        label_en=payload.label_en,
        label_ar=payload.label_ar,
        description_en=payload.description_en,
        description_ar=payload.description_ar,
        color=payload.color,
        system=False,
        permissions=_normalize_permissions(payload.permissions),
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.delete("/{code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(code: str, db: DbSession, _user: Perm("users", "delete")):
    role = db.get(Role, code)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    if role.system:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "System roles cannot be deleted")
    db.delete(role)
    db.commit()


@router.get("/recommended")
def recommended_roles(_admin: AdminUser):
    """Business-domain recommended matrix per role, for side-by-side review."""
    from api.bootstrap_roles import RECOMMENDED_ROLES

    return RECOMMENDED_ROLES
