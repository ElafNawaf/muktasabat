from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select

from api.deps import CurrentUser, DbSession
from api.permissions import Perm
from api.models import Building, BuildingDocument, BuildingImage, Owner, User
from api.schemas.building import (
    BuildingCreate,
    BuildingDocumentRead,
    BuildingImageRead,
    BuildingRead,
    BuildingUpdate,
)
from api.storage import StorageNotConfigured, delete_object, upload_document, upload_image

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


def _validate_assignee(db, assignee_id: int | None) -> None:
    if assignee_id is None:
        return
    if db.get(User, assignee_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignee user not found")


@router.post("", response_model=BuildingRead, status_code=status.HTTP_201_CREATED)
def create_building(payload: BuildingCreate, db: DbSession, _user: CurrentUser):
    if db.get(Owner, payload.owner_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Owner not found")
    _validate_assignee(db, payload.assignee_id)
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
    _validate_assignee(db, payload.assignee_id)
    for field, value in payload.model_dump().items():
        setattr(building, field, value)
    db.commit()
    db.refresh(building)
    return building


@router.delete("/{building_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_building(building_id: int, db: DbSession, _user: Perm("properties", "delete")):
    building = db.get(Building, building_id)
    if building is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Building not found")
    keys = [img.object_key for img in building.images if img.object_key]
    keys.extend(d.object_key for d in building.documents if d.object_key)
    db.delete(building)
    db.commit()
    for k in keys:
        delete_object(k)


# ---------- Image gallery ----------


@router.post(
    "/{building_id}/images",
    response_model=BuildingImageRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_building_image(
    building_id: int,
    db: DbSession,
    _user: CurrentUser,
    file: UploadFile = File(...),
):
    building = db.get(Building, building_id)
    if building is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Building not found")

    try:
        stored = upload_image(
            file.file,
            content_type=file.content_type or "application/octet-stream",
            prefix=f"buildings/{building_id}",
            original_filename=file.filename,
        )
    except StorageNotConfigured as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    next_order = (max((img.sort_order for img in building.images), default=-1)) + 1
    image = BuildingImage(
        building_id=building.id,
        url=stored.public_url,
        object_key=stored.object_key,
        sort_order=next_order,
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


@router.delete(
    "/{building_id}/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_building_image(
    building_id: int,
    image_id: int,
    db: DbSession,
    _user: Perm("properties", "delete"),
):
    image = db.get(BuildingImage, image_id)
    if image is None or image.building_id != building_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
    object_key = image.object_key
    db.delete(image)
    db.commit()
    delete_object(object_key)


# ---------- Document gallery (ملفات العقار) ----------


@router.post(
    "/{building_id}/documents",
    response_model=BuildingDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_building_document(
    building_id: int,
    db: DbSession,
    _user: CurrentUser,
    file: UploadFile = File(...),
):
    building = db.get(Building, building_id)
    if building is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Building not found")

    try:
        stored = upload_document(
            file.file,
            content_type=file.content_type or "application/octet-stream",
            prefix=f"buildings/{building_id}/documents",
            original_filename=file.filename,
        )
    except StorageNotConfigured as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    next_order = (max((doc.sort_order for doc in building.documents), default=-1)) + 1
    document = BuildingDocument(
        building_id=building.id,
        url=stored.public_url,
        object_key=stored.object_key,
        filename=file.filename or "document",
        file_type=file.content_type,
        sort_order=next_order,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.delete(
    "/{building_id}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_building_document(
    building_id: int,
    document_id: int,
    db: DbSession,
    _user: Perm("properties", "delete"),
):
    document = db.get(BuildingDocument, document_id)
    if document is None or document.building_id != building_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    object_key = document.object_key
    db.delete(document)
    db.commit()
    delete_object(object_key)
