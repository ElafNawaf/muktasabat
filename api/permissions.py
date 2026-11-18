"""RBAC permission checks backed by the roles permission matrix."""
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.database import get_db, release_connection
from api.deps import get_current_user
from api.models import Role, User

DbSession = Annotated[Session, Depends(get_db)]


def has_permission(db: Session, user: User, module: str, action: str) -> bool:
    if user.is_admin:
        return True
    # Per-person extras win over the role (granted = 1, taken away = 0).
    ov = ((getattr(user, "permission_overrides", None) or {}).get(module) or {})
    if action in ov and ov[action] is not None:
        return bool(ov[action])
    role = db.get(Role, user.role)
    if role is None:
        return False
    mod = (role.permissions or {}).get(module)
    if not isinstance(mod, dict):
        return False
    return bool(mod.get(action))


def require_permission(module: str, action: str):
    def checker(user: Annotated[User, Depends(get_current_user)], db: DbSession) -> User:
        if not has_permission(db, user, module, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {module}.{action}",
            )
        release_connection(db)
        return user

    return checker


def Perm(module: str, action: str) -> type:
    """Shorthand: `Annotated[User, Depends(require_permission(...))]`."""
    return Annotated[User, Depends(require_permission(module, action))]


def PermAny(*rules: str) -> type:
    """Allowed if the user has ANY of the given "module.action" permissions.

    For shared lists (properties, units, leases, owners, tenants, agents) that other
    modules use as pickers: a maintenance coordinator needs the building list to log
    a work order, but someone with no relevant permission gets nothing."""
    pairs = [tuple(r.split(".", 1)) for r in rules]

    def checker(user: Annotated[User, Depends(get_current_user)], db: DbSession) -> User:
        if any(has_permission(db, user, m, a) for m, a in pairs):
            release_connection(db)
            return user
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Permission denied: {pairs[0][0]}.{pairs[0][1]}")

    return Annotated[User, Depends(checker)]


ACTIONS = ("view", "create", "edit", "delete", "approve")


def effective_permissions(db: Session, user: User) -> dict:
    """The full module × action matrix this person actually has (role + extras)."""
    from api.bootstrap_roles import _MODULES

    return {m: {a: 1 if has_permission(db, user, m, a) else 0 for a in ACTIONS} for m in _MODULES}
