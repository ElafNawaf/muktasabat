"""RBAC permission checks backed by the roles permission matrix."""
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.database import get_db
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
        return user

    return checker


def Perm(module: str, action: str) -> type:
    """Shorthand: `Annotated[User, Depends(require_permission(...))]`."""
    return Annotated[User, Depends(require_permission(module, action))]


ACTIONS = ("view", "create", "edit", "delete", "approve")


def effective_permissions(db: Session, user: User) -> dict:
    """The full module × action matrix this person actually has (role + extras)."""
    from api.bootstrap_roles import _MODULES

    return {m: {a: 1 if has_permission(db, user, m, a) else 0 for a in ACTIONS} for m in _MODULES}
