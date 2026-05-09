from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select

from api.deps import CurrentUser, DbSession
from api.models import Building, Unit, UnitImage
from api.schemas.unit import UnitCreate, UnitImageRead, UnitRead, UnitUpdate
from api.storage import StorageNotConfigured, delete_object, upload_image

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
    keys = [img.object_key for img in unit.images if img.object_key]
    db.delete(unit)
    db.commit()
    for k in keys:
        delete_object(k)


# ---------- Image gallery ----------


@router.post(
    "/{unit_id}/images",
    response_model=UnitImageRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_unit_image(
    unit_id: int,
    db: DbSession,
    _user: CurrentUser,
    file: UploadFile = File(...),
):
    unit = db.get(Unit, unit_id)
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unit not found")

    try:
        stored = upload_image(
            file.file,
            content_type=file.content_type or "application/octet-stream",
            prefix=f"units/{unit_id}",
            original_filename=file.filename,
        )
    except StorageNotConfigured as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    next_order = (max((img.sort_order for img in unit.images), default=-1)) + 1
    image = UnitImage(
        unit_id=unit.id,
        url=stored.public_url,
        object_key=stored.object_key,
        sort_order=next_order,
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


@router.delete(
    "/{unit_id}/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_unit_image(unit_id: int, image_id: int, db: DbSession, _user: CurrentUser):
    image = db.get(UnitImage, image_id)
    if image is None or image.unit_id != unit_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
    object_key = image.object_key
    db.delete(image)
    db.commit()
    delete_object(object_key)
