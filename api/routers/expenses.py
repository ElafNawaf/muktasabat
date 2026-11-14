"""Expenses.

Large expenses go through the configurable ``expense`` approval workflow
(api/services/workflows.py): until every step approves, the expense is
``pending`` and is left out of every report, balance and owner statement
(api/services/expense_scope.py). A rejected expense stays on file, marked
rejected, and still doesn't count.
"""
from html import escape
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.deps import CurrentUser, DbSession
from api.models import Expense, User
from api.permissions import Perm
from api.schemas.expense import ExpenseCategory, ExpenseCreate, ExpenseRead
from api.services import workflows as wf

router = APIRouter(prefix="/expenses", tags=["expenses"])

ALL = {"all_expenses": True}


def _get(db: Session, expense_id: int) -> Expense:
    e = db.scalars(select(Expense).where(Expense.id == expense_id).execution_options(**ALL)).first()
    if e is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")
    return e


def _ctx(e: Expense, requester_id: Optional[int] = None) -> dict:
    return {"amount": float(e.amount or 0), "category": e.category, "paid_by": e.paid_by,
            "requester_id": requester_id or e.created_by_id, "owner_id": e.owner_id}


def _who(u: Optional[User]) -> str:
    return (getattr(u, "full_name", None) or u.username) if u else "—"


def _base() -> str:
    from api.routers.maintenance import _base as b

    return b()


def _notify_step(db: Session, e: Expense, t) -> None:
    amount = f"{float(e.amount):,.2f}"
    wf.notify(db, t, f"اعتماد مصروف {amount} ر.س", f"Expense approval — SAR {amount}",
              f"<p>مصروف بقيمة <strong>{amount} ر.س</strong> بانتظار اعتمادك: {escape(e.description or '')}"
              f"{(' — ' + escape(e.vendor_name)) if e.vendor_name else ''}.</p>",
              f"<p>An expense of <strong>SAR {amount}</strong> is waiting for your approval: {escape(e.description_en or e.description or '')}"
              f"{(' — ' + escape(e.vendor_name)) if e.vendor_name else ''}.</p>",
              f"{_base()}/ar/approvals")


def _start(db: Session, e: Expense, requester_id: Optional[int] = None) -> None:
    # Whoever raised or created the amount can't be the one who approves it.
    tasks = wf.start(db, "expense", e.id, _ctx(e, requester_id))
    e.approval_status = "pending" if tasks else "approved"
    db.commit()
    if tasks:
        _notify_step(db, e, tasks[0])


def _out(db: Session, e: Expense) -> dict:
    d = ExpenseRead.model_validate(e).model_dump(mode="json")
    if e.approval_status != "approved" or wf.chain(db, "expense", e.id):
        d["approval_chain"] = wf.chain_json(db, "expense", e.id)
    return d


@router.get("", response_model=list[ExpenseRead])
def list_expenses(
    db: DbSession,
    _user: Perm("expenses", "view"),
    category: ExpenseCategory | None = Query(default=None),
    approval: Optional[str] = Query(default=None, pattern="^(approved|pending|rejected)$"),
):
    stmt = select(Expense).execution_options(**ALL)
    if category is not None:
        stmt = stmt.where(Expense.category == category)
    if approval:
        stmt = stmt.where(Expense.approval_status == approval)
    return db.scalars(stmt.order_by(Expense.expense_date.desc())).all()


@router.get("/{expense_id}")
def get_expense(expense_id: int, db: DbSession, _user: Perm("expenses", "view")):
    return _out(db, _get(db, expense_id))


@router.post("", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
def create_expense(payload: ExpenseCreate, db: DbSession, user: Perm("expenses", "create")):
    expense = Expense(**payload.model_dump(), created_by_id=user.id)
    db.add(expense)
    db.flush()
    _start(db, expense)
    db.refresh(expense)
    return expense


@router.put("/{expense_id}", response_model=ExpenseRead)
def update_expense(expense_id: int, payload: ExpenseCreate, db: DbSession, user: Perm("expenses", "edit")):
    expense = _get(db, expense_id)
    before = (float(expense.amount or 0), expense.category, expense.paid_by)
    for field, value in payload.model_dump().items():
        setattr(expense, field, value)
    after = (float(expense.amount or 0), expense.category, expense.paid_by)
    # Raising the amount (or changing what decides the chain) needs approval again;
    # lowering an approved amount does not.
    st = expense.approval_status
    needs = st == "rejected" or (st == "pending" and after != before) or (
        st == "approved" and (after[0] > before[0] or after[1:] != before[1:]))
    if needs:
        if not expense.created_by_id:
            expense.created_by_id = user.id
        _start(db, expense, requester_id=user.id)
    else:
        db.commit()
    db.refresh(expense)
    return expense


class DecisionIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=1000)


def workflow_decide(db: Session, e: Expense, user: User, approve: bool, note: Optional[str]) -> str:
    if e.approval_status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This expense isn't waiting for approval.")
    result, nxt = wf.decide(db, "expense", e.id, user, approve, note, ctx_fn=lambda: _ctx(e))
    if result == "pending":
        db.commit()
        _notify_step(db, e, nxt)
        return result
    e.approval_status = result
    db.commit()
    creator = db.get(User, e.created_by_id) if e.created_by_id else None
    from api.routers.maintenance import _mail

    amount = f"{float(e.amount):,.2f}"
    ok_ar, ok_en = ("اعتُمد", "approved") if result == "approved" else ("رُفض", "rejected")
    body_ar = f"<p>{ok_ar} المصروف ({amount} ر.س): {escape(e.description or '')} — بواسطة {escape(_who(user))}.</p>" + (f"<p>{escape(note)}</p>" if note else "")
    body_en = f"<p>The expense (SAR {amount}) was {ok_en}: {escape(e.description_en or e.description or '')} — by {escape(_who(user))}.</p>" + (f"<p>{escape(note)}</p>" if note else "")
    url = f"{_base()}/ar/expenses"
    if creator and creator.email and creator.id != user.id:
        _mail(creator.email, f"{ok_ar} المصروف | Expense {ok_en}", body_ar, body_en, url, "المصروفات", "Expenses")
    wf.notify_final(db, "expense", f"{ok_ar} مصروف {amount} ر.س | Expense SAR {amount} {ok_en}", body_ar, body_en, url)
    return result


@router.post("/{expense_id}/decision")
def decide_expense(expense_id: int, payload: DecisionIn, db: DbSession, user: CurrentUser):
    e = _get(db, expense_id)
    return {"ok": True, "result": workflow_decide(db, e, user, payload.approve, payload.note), "approval_status": e.approval_status}


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: int, db: DbSession, _user: Perm("expenses", "delete")):
    expense = _get(db, expense_id)
    wf.cancel(db, "expense", expense.id)
    db.delete(expense)
    db.commit()
