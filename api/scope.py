"""Row-level data scope: a property manager sees only the properties assigned to them.

A role with ``data_scope == "assigned"`` (default for the Property Manager role) limits its
users to buildings whose ``assignee_id`` is them — and to everything hanging off those
buildings: units, leases, tenants on those leases, the owners, payments, collection
follow-ups, expenses, maintenance, renewals, management contracts, files.

The limit is applied centrally: get_current_user stores a ``Scope`` in the request session's
``info``; a ``do_orm_execute`` hook adds ``with_loader_criteria`` for every scoped entity to
every ORM SELECT / UPDATE / DELETE on that session (lists, ``db.get``, counts, relationship
loads, exports, approvals, notifications). Background jobs use their own sessions and are
never scoped. Administrators are never scoped.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from sqlalchemy import event, select
from sqlalchemy.orm import Session, with_loader_criteria

SCOPE_KEY = "data_scope"


@dataclass(frozen=True)
class Scope:
    user_id: int
    buildings: frozenset[int]
    units: frozenset[int]
    contracts: frozenset[int]
    tenants: frozenset[int]
    owners: frozenset[int]
    agents: frozenset[int]
    management_contracts: frozenset[int]


_cache: dict[tuple[int, str], tuple[float, Scope | None]] = {}
_TTL = 20.0  # seconds — assignment changes apply within this


def scope_for(db: Session, user) -> Scope | None:
    """None = unrestricted (admins, and roles with data_scope 'all')."""
    if user.is_admin:
        return None
    key = (user.id, user.role)
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < _TTL:
        return hit[1]
    from api.models import Building, Contract, ManagementContract, Owner, Role, Unit

    role = db.get(Role, user.role)
    if role is None or (getattr(role, "data_scope", None) or "all") != "assigned":
        sc = None
    else:
        b = frozenset(db.scalars(select(Building.id).where(Building.assignee_id == user.id)).all())
        u = frozenset(db.scalars(select(Unit.id).where(Unit.building_id.in_(b))).all()) if b else frozenset()
        rows = db.execute(select(Contract.id, Contract.tenant_id, Contract.agent_id).where(Contract.unit_id.in_(u))).all() if u else []
        o = frozenset(x for x in db.scalars(select(Building.owner_id).where(Building.id.in_(b))).all() if x) if b else frozenset()
        ag = {r.agent_id for r in rows if r.agent_id}
        if o:
            ag |= {x for x in db.scalars(select(Owner.agent_id).where(Owner.id.in_(o))).all() if x}
        mc = frozenset(db.scalars(select(ManagementContract.id).where(ManagementContract.owner_id.in_(o))).all()) if o else frozenset()
        sc = Scope(user.id, b, u, frozenset(r.id for r in rows), frozenset(r.tenant_id for r in rows if r.tenant_id), o, frozenset(ag), mc)
    _cache[key] = (time.monotonic(), sc)
    return sc


def forget(user_id: int | None = None) -> None:
    """Drop cached scopes (after an assignment or role change)."""
    if user_id is None:
        _cache.clear()
    else:
        for k in [k for k in _cache if k[0] == user_id]:
            _cache.pop(k, None)


def _criteria(sc: Scope) -> list:
    from api.maintenance_models import WorkOrder, WorkOrderAttachment, WorkOrderEvent, WorkOrderTenant
    from api.models import (
        Agent, Building, BuildingDocument, BuildingImage, Contract, ContractAttachment, Expense,
        ManagementContract, ManagementContractAttachment, ManagementContractProperty, Owner, Payment,
        PaymentAlertLog, PaymentSplit, Tenant, TenantCompanion, Unit, UnitImage,
    )
    from api.renewal_models import LeaseRenewal, LeaseRenewalEvent
    from api.routers.collections import CollectionAction

    B, U, C, T, O, A, M = (list(x) for x in (sc.buildings, sc.units, sc.contracts, sc.tenants, sc.owners, sc.agents, sc.management_contracts))
    pay_ids = select(Payment.id).where(Payment.contract_id.in_(C)).scalar_subquery()
    wo_ids = select(WorkOrder.id).where(WorkOrder.building_id.in_(B)).scalar_subquery()
    ren_ids = select(LeaseRenewal.id).where(LeaseRenewal.contract_id.in_(C)).scalar_subquery()
    pairs = [
        (Building, Building.id.in_(B)), (BuildingImage, BuildingImage.building_id.in_(B)), (BuildingDocument, BuildingDocument.building_id.in_(B)),
        (Unit, Unit.building_id.in_(B)), (UnitImage, UnitImage.unit_id.in_(U)),
        (Contract, Contract.unit_id.in_(U)), (ContractAttachment, ContractAttachment.contract_id.in_(C)),
        (Payment, Payment.contract_id.in_(C)), (PaymentSplit, PaymentSplit.payment_id.in_(pay_ids)), (PaymentAlertLog, PaymentAlertLog.payment_id.in_(pay_ids)),
        (CollectionAction, CollectionAction.payment_id.in_(pay_ids)),
        (Tenant, Tenant.id.in_(T)), (TenantCompanion, TenantCompanion.tenant_id.in_(T)),
        (Owner, Owner.id.in_(O)), (Agent, Agent.id.in_(A)),
        (ManagementContract, ManagementContract.id.in_(M)), (ManagementContractAttachment, ManagementContractAttachment.management_contract_id.in_(M)),
        (ManagementContractProperty, ManagementContractProperty.management_contract_id.in_(M)),
        (Expense, Expense.building_id.in_(B) | Expense.unit_id.in_(U)),
        (WorkOrder, WorkOrder.building_id.in_(B)), (WorkOrderEvent, WorkOrderEvent.work_order_id.in_(wo_ids)),
        (WorkOrderTenant, WorkOrderTenant.work_order_id.in_(wo_ids)), (WorkOrderAttachment, WorkOrderAttachment.work_order_id.in_(wo_ids)),
        (LeaseRenewal, LeaseRenewal.contract_id.in_(C)), (LeaseRenewalEvent, LeaseRenewalEvent.renewal_id.in_(ren_ids)),
    ]
    return [with_loader_criteria(ent, crit, include_aliases=True) for ent, crit in pairs]


@event.listens_for(Session, "do_orm_execute")
def _apply_scope(state) -> None:
    if state.execution_options.get("skip_data_scope"):
        return
    uid = state.session.info.pop("scope_reload_user", None)
    if uid is not None:  # scope dropped after a commit that created records → rebuild it
        from api.models import User

        u = state.session.get(User, uid, execution_options={"skip_data_scope": True})
        state.session.info[SCOPE_KEY] = scope_for(state.session, u) if u else None
    sc = state.session.info.get(SCOPE_KEY)
    if sc is None:
        return
    if state.is_select or state.is_update or state.is_delete:
        state.statement = state.statement.options(*_criteria(sc))


def _deny() -> None:
    from fastapi import HTTPException, status

    raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found in the properties assigned to you")


@event.listens_for(Session, "before_flush")
def _guard_writes(session: Session, _ctx, _instances) -> None:
    """New or changed records must hang off one of the user's properties."""
    sc: Scope | None = session.info.get(SCOPE_KEY)
    if sc is None:
        return
    from api.maintenance_models import WorkOrder
    from api.models import (
        BuildingDocument, BuildingImage, Contract, ContractAttachment, Expense, ManagementContract, Payment, Unit, UnitImage,
    )

    new_ids = {id(o) for o in session.new}

    created: dict = session.info.get("scope_created", {})

    def parent_ok(obj, fk: str, rel: str, allowed: frozenset[int]) -> bool:
        val = getattr(obj, fk, None)
        if val is not None:
            parent_cls = type(getattr(obj, rel, None)).__name__ if getattr(obj, rel, None) is not None else None
            return val in allowed or val in created.get(rel, set()) or (parent_cls is not None and val in created.get(parent_cls, set()))
        parent = getattr(obj, rel, None)  # linked by relationship to a record created in this request
        return parent is not None and id(parent) in new_ids

    for obj in list(session.new) + list(session.dirty):
        ok = True
        if isinstance(obj, Unit):
            ok = parent_ok(obj, "building_id", "building", sc.buildings)
        elif isinstance(obj, Contract):
            ok = parent_ok(obj, "unit_id", "unit", sc.units)
        elif isinstance(obj, Payment):
            ok = parent_ok(obj, "contract_id", "contract", sc.contracts)
        elif isinstance(obj, WorkOrder):
            ok = parent_ok(obj, "building_id", "building", sc.buildings)
        elif isinstance(obj, Expense):
            if obj.building_id is not None or obj.unit_id is not None:
                ok = (obj.building_id in sc.buildings) or (obj.unit_id in sc.units)
            else:
                ok = obj.owner_id in sc.owners
        elif isinstance(obj, ManagementContract):
            ok = parent_ok(obj, "owner_id", "owner", sc.owners)
        elif isinstance(obj, ContractAttachment):
            ok = parent_ok(obj, "contract_id", "contract", sc.contracts)
        elif isinstance(obj, (BuildingImage, BuildingDocument)):
            ok = parent_ok(obj, "building_id", "building", sc.buildings)
        elif isinstance(obj, UnitImage):
            ok = parent_ok(obj, "unit_id", "unit", sc.units)
        if not ok:
            _deny()
    if session.new:
        session.info["scope_changed"] = True  # new lease/unit → refresh the scope after commit


@event.listens_for(Session, "after_flush")
def _remember_created(session: Session, _ctx) -> None:
    """Ids created in this request count as in scope (a new lease, then its payments)."""
    if session.info.get(SCOPE_KEY) is None and "scope_reload_user" not in session.info:
        return
    from api.models import Building, Contract, Owner, Unit

    created = session.info.setdefault("scope_created", {})
    rel = {Building: "building", Unit: "unit", Contract: "contract", Owner: "owner"}
    for obj in session.new:
        for cls, key in rel.items():
            if isinstance(obj, cls) and obj.id is not None:
                created.setdefault(key, set()).add(obj.id)


@event.listens_for(Session, "after_commit")
def _refresh_after_commit(session: Session) -> None:
    sc: Scope | None = session.info.get(SCOPE_KEY)
    if sc is not None and session.info.pop("scope_changed", False):
        forget(sc.user_id)
        # keep this request's scope current too (e.g. a lease created then its payments)
        session.info[SCOPE_KEY] = None
        session.info["scope_reload_user"] = sc.user_id
