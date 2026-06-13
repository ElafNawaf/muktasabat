from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.deps import CurrentUser, DbSession
from api.permissions import Perm
from api.models import Tenant, TenantCompanion
from api.schemas.tenant import TenantCompanionBase, TenantCreate, TenantRead, TenantUpdate

router = APIRouter(prefix="/tenants", tags=["tenants"])


def _load_tenant(db: DbSession, tenant_id: int) -> Tenant | None:
    return db.scalar(
        select(Tenant)
        .options(selectinload(Tenant.companions))
        .where(Tenant.id == tenant_id)
    )


def _sync_companions(
    tenant: Tenant, companions: list[TenantCompanionBase], tenant_type: str
) -> None:
    tenant.companions.clear()
    if tenant_type != "individual":
        return
    for item in companions:
        name = item.name.strip()
        national_id = item.national_id.strip()
        if not name or not national_id:
            continue
        tenant.companions.append(
            TenantCompanion(
                name=name,
                national_id=national_id,
                date_of_birth=item.date_of_birth,
            )
        )


@router.get("", response_model=list[TenantRead])
def list_tenants(db: DbSession, _user: CurrentUser):
    return db.scalars(
        select(Tenant)
        .options(selectinload(Tenant.companions))
        .order_by(Tenant.name)
    ).all()


@router.get("/{tenant_id}", response_model=TenantRead)
def get_tenant(tenant_id: int, db: DbSession, _user: CurrentUser):
    tenant = _load_tenant(db, tenant_id)
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    return tenant


@router.post("", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
def create_tenant(payload: TenantCreate, db: DbSession, _user: CurrentUser):
    data = payload.model_dump(exclude={"companions"})
    tenant = Tenant(**data)
    _sync_companions(tenant, payload.companions, payload.tenant_type)
    db.add(tenant)
    db.commit()
    return _load_tenant(db, tenant.id)


@router.put("/{tenant_id}", response_model=TenantRead)
def update_tenant(
    tenant_id: int,
    payload: TenantUpdate,
    db: DbSession,
    _user: CurrentUser,
):
    tenant = _load_tenant(db, tenant_id)
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    for field, value in payload.model_dump(exclude={"companions"}).items():
        setattr(tenant, field, value)
    _sync_companions(tenant, payload.companions, payload.tenant_type)
    db.commit()
    return _load_tenant(db, tenant_id)


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant(tenant_id: int, db: DbSession, _user: Perm("tenants", "delete")):
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    db.delete(tenant)
    db.commit()
