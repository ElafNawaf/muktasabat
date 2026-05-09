from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from api.deps import AdminUser, CurrentUser, DbSession
from api.models import Employee, Owner, User
from api.schemas.employee import EmployeeCreate, EmployeeRead, EmployeeUpdate

router = APIRouter(prefix="/employees", tags=["employees"])


def _to_read(employee: Employee) -> EmployeeRead:
    return EmployeeRead(
        id=employee.id,
        user_id=employee.user_id,
        name=employee.name,
        name_en=employee.name_en,
        name_ar=employee.name_ar,
        phone=employee.phone,
        created_at=employee.created_at,
        owner_ids=[o.id for o in employee.owners],
    )


@router.get("", response_model=list[EmployeeRead])
def list_employees(db: DbSession, _user: CurrentUser):
    employees = db.scalars(select(Employee).order_by(Employee.name)).all()
    return [_to_read(e) for e in employees]


@router.get("/{employee_id}", response_model=EmployeeRead)
def get_employee(employee_id: int, db: DbSession, _user: CurrentUser):
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    return _to_read(employee)


@router.post("", response_model=EmployeeRead, status_code=status.HTTP_201_CREATED)
def create_employee(payload: EmployeeCreate, db: DbSession, _admin: AdminUser):
    if db.get(User, payload.user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if db.scalar(select(Employee).where(Employee.user_id == payload.user_id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "User is already linked to an employee")

    employee = Employee(
        user_id=payload.user_id,
        name=payload.name,
        name_en=payload.name_en,
        name_ar=payload.name_ar,
        phone=payload.phone,
    )
    for oid in payload.owner_ids:
        owner = db.get(Owner, oid)
        if owner:
            employee.owners.append(owner)
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return _to_read(employee)


@router.put("/{employee_id}", response_model=EmployeeRead)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: DbSession,
    _admin: AdminUser,
):
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")

    employee.name = payload.name
    employee.name_en = payload.name_en
    employee.name_ar = payload.name_ar
    employee.phone = payload.phone
    employee.owners.clear()
    for oid in payload.owner_ids:
        owner = db.get(Owner, oid)
        if owner:
            employee.owners.append(owner)
    db.commit()
    db.refresh(employee)
    return _to_read(employee)
