"""Insight dashboards (لوحات المؤشرات) — finance, operations, people, growth.

The portfolio dashboard lives at /analytics/insights; these are the others.
Salary figures are only included for users who may approve HR (or admins).
"""
from fastapi import APIRouter, Query

from api.deps import DbSession
from api.permissions import Perm, has_permission
from api.services import dashboards as svc

router = APIRouter(prefix="/dashboards", tags=["dashboards"])

LocaleQ = Query("ar", pattern="^(ar|en)$")
MonthsQ = Query(12, ge=3, le=36)


def _can_see_pay(db, user) -> bool:
    return bool(getattr(user, "is_admin", False) or has_permission(db, user, "hr", "approve"))


@router.get("/finance")
def finance(db: DbSession, user: Perm("dashboard", "view"), locale: str = LocaleQ, months: int = MonthsQ):
    return svc.finance(db, locale, months, include_payroll=_can_see_pay(db, user))


@router.get("/operations")
def operations(db: DbSession, _user: Perm("dashboard", "view"), locale: str = LocaleQ, months: int = MonthsQ):
    return svc.operations(db, locale, months)


@router.get("/people")
def people(db: DbSession, user: Perm("hr", "view"), locale: str = LocaleQ):
    return svc.people(db, locale, include_pay=_can_see_pay(db, user))


@router.get("/growth")
def growth(db: DbSession, _user: Perm("dashboard", "view"), locale: str = LocaleQ, months: int = MonthsQ):
    return svc.growth(db, locale, months)
