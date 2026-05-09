from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from api.deps import CurrentUser, DbSession
from api.models import Building, Unit
from api.schemas.unit import UnitCreate, UnitRead, UnitUpdate

router = APIRouter(prefix="/units", tags=["units"])


@router.get("", response_model=list[UnitRead])
def list_units(
    db: DbSession,
    _user: CurrentUser,
    building_id: int | None = Query(default=None),
    available_only: bool = Query(default=False),
):
    stmt = select(Unit)
    if building_id is not None:
        stmt = stmt.where(Unit.building_id == building_id)
    if available_only:
        stmt = stmt.where(Unit.is_available.is_(True))
    return db.scalars(stmt.order_by(Unit.building_id, Unit.number)).all()


@router.get("/{unit_id}", response_model=UnitRead)
def get_unit(unit_id: int, db: DbSession, _user: CurrentUser):
    unit = db.get(Unit, unit_id)
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unit not found")
    return unit


@router.post("", response_model=UnitRead, status_code=status.HTTP_201_CREATED)
def create_unit(payload: UnitCreate, db: DbSession, _user: CurrentUser):
    if db.get(Building, payload.building_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Building not found")
    unit = Unit(**payload.model_dump())
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return unit


@router.put("/{unit_id}", response_model=UnitRead)
def update_unit(unit_id: int, payload: UnitUpdate, db: DbSession, _user: CurrentUser):
    unit = db.get(Unit, unit_id)
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unit not found")
    if db.get(Building, payload.building_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Building not found")
    for field, value in payload.model_dump().items():
        setattr(unit, field, value)
    db.commit()
    db.refresh(unit)
    return unit


@router.delete("/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_unit(unit_id: int, db: DbSession, _user: CurrentUser):
    unit = db.get(Unit, unit_id)
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unit not found")
    db.delete(unit)
    db.commit()
