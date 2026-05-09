from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from api.deps import CurrentUser, DbSession
from api.models import Building, Owner
from api.schemas.building import BuildingCreate, BuildingRead, BuildingUpdate

router = APIRouter(prefix="/buildings", tags=["buildings"])


@router.get("", response_model=list[BuildingRead])
def list_buildings(db: DbSession, _user: CurrentUser):
    return db.scalars(select(Building).order_by(Building.name)).all()


@router.get("/{building_id}", response_model=BuildingRead)
def get_building(building_id: int, db: DbSession, _user: CurrentUser):
    building = db.get(Building, building_id)
    if building is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Building not found")
    return building


@router.post("", response_model=BuildingRead, status_code=status.HTTP_201_CREATED)
def create_building(payload: BuildingCreate, db: DbSession, _user: CurrentUser):
    if db.get(Owner, payload.owner_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Owner not found")
    building = Building(**payload.model_dump())
    db.add(building)
    db.commit()
    db.refresh(building)
    return building


@router.put("/{building_id}", response_model=BuildingRead)
def update_building(
    building_id: int,
    payload: BuildingUpdate,
    db: DbSession,
    _user: CurrentUser,
):
    building = db.get(Building, building_id)
    if building is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Building not found")
    if db.get(Owner, payload.owner_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Owner not found")
    for field, value in payload.model_dump().items():
        setattr(building, field, value)
    db.commit()
    db.refresh(building)
    return building


@router.delete("/{building_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_building(building_id: int, db: DbSession, _user: CurrentUser):
    building = db.get(Building, building_id)
    if building is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Building not found")
    db.delete(building)
    db.commit()
