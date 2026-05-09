from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from api.deps import CurrentUser, DbSession
from api.models import Expense
from api.schemas.expense import ExpenseCategory, ExpenseCreate, ExpenseRead

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.get("", response_model=list[ExpenseRead])
def list_expenses(
    db: DbSession,
    _user: CurrentUser,
    category: ExpenseCategory | None = Query(default=None),
):
    stmt = select(Expense)
    if category is not None:
        stmt = stmt.where(Expense.category == category)
    return db.scalars(stmt.order_by(Expense.expense_date.desc())).all()


@router.get("/{expense_id}", response_model=ExpenseRead)
def get_expense(expense_id: int, db: DbSession, _user: CurrentUser):
    expense = db.get(Expense, expense_id)
    if expense is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")
    return expense


@router.post("", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
def create_expense(payload: ExpenseCreate, db: DbSession, _user: CurrentUser):
    expense = Expense(**payload.model_dump())
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: int, db: DbSession, _user: CurrentUser):
    expense = db.get(Expense, expense_id)
    if expense is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")
    db.delete(expense)
    db.commit()
