from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from api.deps import CurrentUser, DbSession
from api.permissions import Perm
from api.models import Agent, Owner
from api.schemas.owner import OwnerCreate, OwnerRead, OwnerUpdate

router = APIRouter(prefix="/owners", tags=["owners"])


def _validate_agent_id(db: DbSession, agent_id: int | None) -> None:
    if agent_id is not None and db.get(Agent, agent_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")


@router.get("", response_model=list[OwnerRead])
def list_owners(db: DbSession, _user: CurrentUser):
    return db.scalars(select(Owner).order_by(Owner.name)).all()


@router.get("/{owner_id}", response_model=OwnerRead)
def get_owner(owner_id: int, db: DbSession, _user: CurrentUser):
    owner = db.get(Owner, owner_id)
    if owner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Owner not found")
    return owner


@router.post("", response_model=OwnerRead, status_code=status.HTTP_201_CREATED)
def create_owner(payload: OwnerCreate, db: DbSession, _user: CurrentUser):
    _validate_agent_id(db, payload.agent_id)
    owner = Owner(**payload.model_dump())
    db.add(owner)
    db.commit()
    db.refresh(owner)
    return owner


@router.put("/{owner_id}", response_model=OwnerRead)
def update_owner(
    owner_id: int,
    payload: OwnerUpdate,
    db: DbSession,
    _user: CurrentUser,
):
    owner = db.get(Owner, owner_id)
    if owner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Owner not found")
    _validate_agent_id(db, payload.agent_id)
    for field, value in payload.model_dump().items():
        setattr(owner, field, value)
    db.commit()
    db.refresh(owner)
    return owner


@router.delete("/{owner_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_owner(owner_id: int, db: DbSession, _user: Perm("owners", "delete")):
    owner = db.get(Owner, owner_id)
    if owner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Owner not found")
    db.delete(owner)
    db.commit()
