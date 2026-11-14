"""Only approved expenses count.

Every ORM query that touches ``Expense`` (lists, sums, owner statements,
dashboards, insights) silently gets ``approval_status = 'approved'`` added, so
an expense waiting for approval — or rejected — never moves a balance or a
report. Screens that must see them (the expenses list, the approvals inbox)
opt out with ``.execution_options(all_expenses=True)`` (or, for a whole
session such as a data import, ``db.info["all_expenses"] = True``).
"""
from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

from api.models import Expense

_installed = False


def install() -> None:
    global _installed
    if _installed:
        return
    _installed = True

    @event.listens_for(Session, "do_orm_execute")
    def _only_approved(state):  # noqa: ANN001
        if not state.is_select or state.execution_options.get("all_expenses") or state.session.info.get("all_expenses"):
            return
        state.statement = state.statement.options(
            with_loader_criteria(Expense, lambda cls: cls.approval_status == "approved", include_aliases=True)
        )
