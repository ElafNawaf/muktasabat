"""Approval workflow engine (محرك مسارات الاعتماد).

Modules call three functions:

* ``start(db, key, entity_id, ctx)``  — the request enters approval. Builds the
  chain of applicable steps from the policy (conditions are matched against
  ``ctx``); returns the tasks (empty list = nothing to approve → auto-approved).
* ``decide(db, key, entity_id, user, approve, note)`` — the current step's
  approver decides. Returns ``("pending", next_task)`` while steps remain,
  ``("approved", None)`` after the last step, ``("rejected", None)`` on a no.
* ``current(db, key, entity_id)`` — the step waiting for a decision.

Approver types
  owner         the property owner (owner portal); staff with the module's
                *approve* permission may decide on the owner's behalf
  role          everyone with a role (value = role code)
  user          one named person (value = user id)
  permission    everyone with a permission (value = "module.action")
  line_manager  the requester's direct manager (HR profile)
  hr_approver   the approver chosen in HR settings (else HR managers, else admins)

Conditions (``when``) a step can carry — the step runs only if all match
  min_amount / max_amount, charge_to, above_owner_limit, kinds, min_days,
  categories, paid_by
Nobody approves their own request. Administrators can decide any step.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from html import escape
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.models import OwnerUser, User
from api.permissions import has_permission
from api.workflow_models import ApprovalTask, WorkflowPolicy

log = logging.getLogger(__name__)

APPROVER_TYPES = ("owner", "role", "user", "permission", "line_manager", "hr_approver")

# ── Workflow catalogue ─────────────────────────────────────────────────────────
# Configurable workflows: the admin edits their steps. `module` is the
# permission module whose *approve* right lets staff act for the owner.
DEFS: dict[str, dict[str, Any]] = {
    "maintenance_cost": {
        "ar": "اعتماد تكلفة الصيانة", "en": "Maintenance cost approval", "module": "maintenance", "icon": "handyman",
        "desc_ar": "يبدأ عند تسجيل تكلفة تقديرية لطلب صيانة. المبلغ = التكلفة التقديرية.",
        "desc_en": "Starts when a work order gets a cost estimate. Amount = the estimate.",
        "amount_ar": "التكلفة التقديرية", "amount_en": "Estimate",
        "conditions": ["min_amount", "max_amount", "charge_to", "above_owner_limit"],
        "approvers": ["owner", "role", "user", "permission"],
        "href": "maintenance?open={id}",
        "default": [{
            "key": "owner", "label_ar": "مالك العقار", "label_en": "Property owner",
            "approver": {"type": "owner"}, "when": {"charge_to": ["owner"], "above_owner_limit": True}, "sla_hours": 48,
        }],
    },
    "renewal_offer": {
        "ar": "اعتماد عرض تجديد بإيجار أقل", "en": "Renewal offer below current rent", "module": "contracts", "icon": "autorenew",
        "desc_ar": "يبدأ عندما يكون الإيجار المقترح عند التجديد أقل من الحالي. المبلغ = قيمة التخفيض السنوي.",
        "desc_en": "Starts when a renewal offer is below the current rent. Amount = the yearly reduction.",
        "amount_ar": "التخفيض السنوي", "amount_en": "Yearly reduction",
        "conditions": ["min_amount", "max_amount"],
        "approvers": ["owner", "role", "user", "permission"],
        "href": "renewals?open={id}",
        "default": [{
            "key": "owner", "label_ar": "مالك العقار", "label_en": "Property owner",
            "approver": {"type": "owner"}, "when": {}, "sla_hours": 72,
        }],
    },
    "hr_request": {
        "ar": "طلبات الموظفين", "en": "Employee requests", "module": "hr", "icon": "badge",
        "desc_ar": "إجازات واستئذانات وتذاكر سفر وطلبات العمل عن بُعد أو الميداني. المبلغ = تكلفة التذكرة التقديرية.",
        "desc_en": "Leave, permissions, travel tickets and remote / field-work requests. Amount = estimated ticket cost.",
        "amount_ar": "تكلفة التذكرة", "amount_en": "Ticket cost",
        "conditions": ["kinds", "min_days", "min_amount"],
        "approvers": ["line_manager", "hr_approver", "role", "user", "permission"],
        "href": "approvals",
        "default": [{
            "key": "hr", "label_ar": "معتمد الموارد البشرية", "label_en": "HR approver",
            "approver": {"type": "hr_approver"}, "when": {}, "sla_hours": 24,
        }],
    },
    "bank_change": {
        "ar": "تغيير الحساب البنكي للراتب", "en": "Salary bank account change", "module": "hr", "icon": "account_balance",
        "desc_ar": "يبدأ عندما يطلب الموظف تغيير الآيبان الذي يُحوَّل عليه راتبه.",
        "desc_en": "Starts when an employee asks to change the IBAN their salary is paid to.",
        "amount_ar": None, "amount_en": None,
        "conditions": [],
        "approvers": ["hr_approver", "role", "user", "permission"],
        "href": "hr/people/{id}",
        "default": [{
            "key": "hr", "label_ar": "معتمد الموارد البشرية", "label_en": "HR approver",
            "approver": {"type": "hr_approver"}, "when": {}, "sla_hours": 48,
        }],
    },
    "expense": {
        "ar": "اعتماد المصروفات", "en": "Expense approval", "module": "expenses", "icon": "receipt_long",
        "desc_ar": "المصروفات التي تتجاوز الحد لا تُحتسب في التقارير والأرصدة حتى تُعتمد. المبلغ = قيمة المصروف.",
        "desc_en": "Expenses over the limit don't count in reports and balances until approved. Amount = the expense.",
        "amount_ar": "قيمة المصروف", "amount_en": "Expense amount",
        "conditions": ["min_amount", "max_amount", "categories", "paid_by"],
        "approvers": ["role", "user", "permission"],
        "href": "expenses?open={id}",
        "default": [
            {"key": "finance", "label_ar": "المسؤول المالي", "label_en": "Finance approver",
             "approver": {"type": "permission", "value": "expenses.approve"}, "when": {"min_amount": 5000}, "sla_hours": 48},
            {"key": "ceo", "label_ar": "الرئيس التنفيذي", "label_en": "CEO",
             "approver": {"type": "role", "value": "executive"}, "when": {"min_amount": 50000}, "sla_hours": 72},
        ],
    },
}

# Fixed flows: shown in the admin screen for completeness, not step-configurable.
FIXED: dict[str, dict[str, str]] = {
    "owner_payout": {
        "ar": "تحويل حصة المالك", "en": "Owner payout", "icon": "payments",
        "who_ar": "من لديه صلاحية «المدفوعات ← اعتماد» يسجّل التحويل ويرفق إيصال الحوالة.",
        "who_en": "Anyone with Payments → Approve records the transfer and attaches the bank slip.",
    },
    "tenant_payment_report": {
        "ar": "بلاغ سداد من المستأجر", "en": "Tenant payment report", "icon": "fact_check",
        "who_ar": "من لديه صلاحية «المدفوعات ← تعديل» يؤكد البلاغ أو يرفضه بعد مطابقة الإيصال.",
        "who_en": "Anyone with Payments → Edit confirms or rejects it after checking the receipt.",
    },
    "employment_contract": {
        "ar": "قبول عقد العمل", "en": "Employment contract acceptance", "icon": "contract",
        "who_ar": "يصدره من لديه «الموارد البشرية ← اعتماد»، ويصبح سارياً بعد قبول الموظف وتوقيعه.",
        "who_en": "Issued by HR → Approve; becomes active once the employee accepts and signs.",
    },
}

HR_KINDS = ("leave", "permission", "ticket", "work_location")


# ── Policies ───────────────────────────────────────────────────────────────────


def policy(db: Session, key: str) -> dict:
    row = db.get(WorkflowPolicy, key)
    d = DEFS[key]
    if row is None:
        return {"key": key, "enabled": True, "steps": [dict(s) for s in d["default"]], "notify_emails": None, "updated_at": None, "updated_by": None, "customised": False}
    return {"key": key, "enabled": row.enabled, "steps": list(row.steps or []), "notify_emails": row.notify_emails,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None, "updated_by": row.updated_by, "customised": True}


def clean_steps(key: str, steps: list[dict]) -> list[dict]:
    """Validate an admin-edited chain; raises 422 with a readable message."""
    d = DEFS[key]
    out = []
    for i, s in enumerate(steps or []):
        ap = s.get("approver") or {}
        t = ap.get("type")
        if t not in d["approvers"]:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Step {i + 1}: approver type '{t}' isn't allowed for this workflow")
        if t in ("role", "user", "permission") and not ap.get("value"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Step {i + 1}: choose who approves")
        when = {k: v for k, v in (s.get("when") or {}).items() if k in d["conditions"] and v not in (None, "", [])}
        for k in ("min_amount", "max_amount", "min_days"):
            if k in when:
                try:
                    when[k] = float(when[k])
                except (TypeError, ValueError):
                    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Step {i + 1}: {k} must be a number")
        esc = s.get("escalate_to") or None
        if esc and esc.get("type") not in ("role", "user", "permission"):
            esc = None
        sla = s.get("sla_hours")
        out.append({
            "key": (s.get("key") or f"s{i + 1}")[:40],
            "label_ar": (s.get("label_ar") or "").strip()[:120] or None,
            "label_en": (s.get("label_en") or "").strip()[:120] or None,
            "approver": {"type": t, **({"value": ap["value"]} if ap.get("value") not in (None, "") else {})},
            "when": when,
            "sla_hours": int(sla) if sla not in (None, "", 0, "0") else None,
            "escalate_to": esc,
        })
    if len(out) > 8:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A workflow can have at most 8 steps")
    return out


def _matches(when: dict, ctx: dict) -> bool:
    amt = ctx.get("amount")
    if "min_amount" in when and (amt is None or amt < when["min_amount"]):
        return False
    if "max_amount" in when and (amt is not None and amt > when["max_amount"]):
        return False
    if "charge_to" in when and ctx.get("charge_to") not in when["charge_to"]:
        return False
    if when.get("above_owner_limit") and not ctx.get("above_owner_limit"):
        return False
    if "kinds" in when and ctx.get("kind") not in when["kinds"]:
        return False
    if "min_days" in when and (ctx.get("days") or 0) < when["min_days"]:
        return False
    if "categories" in when and ctx.get("category") not in when["categories"]:
        return False
    if "paid_by" in when and ctx.get("paid_by") not in when["paid_by"]:
        return False
    return True


# ── Chains ─────────────────────────────────────────────────────────────────────


def _latest_round(db: Session, key: str, entity_id: int) -> int:
    return db.scalar(select(func.max(ApprovalTask.round)).where(ApprovalTask.workflow == key, ApprovalTask.entity_id == entity_id)) or 0


def chain(db: Session, key: str, entity_id: int) -> list[ApprovalTask]:
    r = _latest_round(db, key, entity_id)
    if not r:
        return []
    return list(db.scalars(select(ApprovalTask).where(ApprovalTask.workflow == key, ApprovalTask.entity_id == entity_id, ApprovalTask.round == r).order_by(ApprovalTask.step_index)).all())


def current(db: Session, key: str, entity_id: int) -> Optional[ApprovalTask]:
    return next((t for t in chain(db, key, entity_id) if t.status == "pending"), None)


def cancel(db: Session, key: str, entity_id: int) -> None:
    for t in chain(db, key, entity_id):
        if t.status in ("pending", "waiting"):
            t.status = "cancelled"


def _activate(t: ApprovalTask) -> None:
    t.status = "pending"
    t.activated_at = datetime.utcnow()
    sla = (t.context or {}).get("_sla_hours")
    t.due_at = t.activated_at + timedelta(hours=sla) if sla else None


def start(db: Session, key: str, entity_id: int, ctx: dict) -> list[ApprovalTask]:
    """Open a new approval round. Empty list → nothing needs approval."""
    p = policy(db, key)
    cancel(db, key, entity_id)
    if not p["enabled"]:
        return []
    steps = [s for s in p["steps"] if _matches(s.get("when") or {}, ctx)]
    if not steps:
        return []
    rnd = _latest_round(db, key, entity_id) + 1
    tasks = []
    for i, s in enumerate(steps):
        t = ApprovalTask(
            workflow=key, entity_id=entity_id, round=rnd, step_index=i, step_key=s.get("key"),
            label_ar=s.get("label_ar"), label_en=s.get("label_en"), approver=s.get("approver") or {},
            escalate_to=s.get("escalate_to"), context={**ctx, "_sla_hours": s.get("sla_hours")},
            amount=ctx.get("amount"), requester_id=ctx.get("requester_id"), status="waiting",
        )
        db.add(t)
        tasks.append(t)
    _activate(tasks[0])
    db.flush()
    return tasks


def ensure(db: Session, key: str, entity_id: int, ctx_fn) -> Optional[ApprovalTask]:
    """Requests that were already pending before workflows existed get a chain
    lazily, the first time someone looks at or decides on them."""
    t = current(db, key, entity_id)
    if t is None and not chain(db, key, entity_id):
        tasks = start(db, key, entity_id, ctx_fn())
        db.commit()
        t = tasks[0] if tasks else None
    return t


# ── Who may act ────────────────────────────────────────────────────────────────


def _hr_approvers(db: Session) -> list[User]:
    from api.routers.hr import _approvers

    return _approvers(db)


def resolve(db: Session, spec: Optional[dict], ctx: dict) -> list[User]:
    """Staff users an approver spec points to (owners are resolved separately)."""
    if not spec:
        return []
    t, v = spec.get("type"), spec.get("value")
    users: list[User] = []
    if t == "role" and v:
        users = list(db.scalars(select(User).where(User.role == v)).all())
    elif t == "user" and v:
        u = db.get(User, int(v))
        users = [u] if u else []
    elif t == "permission" and v and "." in str(v):
        mod, act = str(v).split(".", 1)
        users = [u for u in db.scalars(select(User)).all() if u.role not in ("owner", "tenant") and has_permission(db, u, mod, act)]
    elif t == "line_manager":
        from api.hr_models import HrProfile

        p = db.scalar(select(HrProfile).where(HrProfile.user_id == ctx.get("requester_id")))
        if p and p.manager_user_id:
            u = db.get(User, p.manager_user_id)
            users = [u] if u else []
        if not users:  # no manager on file → HR approver decides
            users = _hr_approvers(db)
    elif t == "hr_approver":
        users = _hr_approvers(db)
    return [u for u in users if u is not None and u.is_active_user]


def _owner_ids_for(db: Session, user: User) -> set[int]:
    return {ou.owner_id for ou in db.scalars(select(OwnerUser).where(OwnerUser.user_id == user.id)).all()}


def can_act(db: Session, user: User, t: ApprovalTask) -> tuple[bool, bool]:
    """(may decide, deciding on someone's behalf)."""
    if t.status != "pending":
        return False, False
    ctx = t.context or {}
    module = DEFS.get(t.workflow, {}).get("module")
    if (t.approver or {}).get("type") != "owner" and user.id == t.requester_id:
        return False, False  # nobody approves their own request (internal steps)
    if (t.approver or {}).get("type") == "owner":
        if ctx.get("owner_id") and ctx["owner_id"] in _owner_ids_for(db, user):
            return True, False
        if user.role not in ("owner", "tenant") and module and has_permission(db, user, module, "approve"):
            return True, True
        return (user.is_admin, user.is_admin)
    ids = {u.id for u in resolve(db, t.approver, ctx)}
    if t.escalated_at and t.escalate_to:
        ids |= {u.id for u in resolve(db, t.escalate_to, ctx)}
    if user.id in ids:
        return True, False
    if user.is_admin:
        return True, True
    return False, False


def decide(db: Session, key: str, entity_id: int, user: User, approve: bool, note: Optional[str], ctx_fn=None,
           owner_ok: bool = False) -> tuple[str, Optional[ApprovalTask]]:
    """``owner_ok``: the caller already verified the user is the item's owner."""
    t = ensure(db, key, entity_id, ctx_fn) if ctx_fn else current(db, key, entity_id)
    if t is None:
        # Nothing configured (workflow off / no step matches) → the decision applies
        # directly, but only for someone who could approve in that module anyway.
        module = DEFS.get(key, {}).get("module")
        if not (owner_ok or user.is_admin or (module and has_permission(db, user, module, "approve"))):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't decide on this request.")
        return ("approved" if approve else "rejected"), None
    ok, behalf = can_act(db, user, t)
    if not ok and user.id == t.requester_id and (t.approver or {}).get("type") != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You raised this request, so someone else has to approve it.")
    if not ok:
        who = describe(db, t.approver, "en")
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"This step is waiting for: {who}.")
    t.status = "approved" if approve else "rejected"
    t.decided_by_id, t.decided_by_name = user.id, (getattr(user, "full_name", None) or user.username)
    t.decided_at, t.note, t.on_behalf = datetime.utcnow(), note, behalf
    if not approve:
        for x in chain(db, key, entity_id):
            if x.status == "waiting":
                x.status = "skipped"
        db.flush()
        return "rejected", None
    nxt = next((x for x in chain(db, key, entity_id) if x.status == "waiting"), None)
    if nxt is None:
        db.flush()
        return "approved", None
    _activate(nxt)
    db.flush()
    return "pending", nxt


# ── Presentation & notifications ───────────────────────────────────────────────


def describe(db: Session, spec: Optional[dict], locale: str = "ar") -> str:
    if not spec:
        return "—"
    ar = locale == "ar"
    t, v = spec.get("type"), spec.get("value")
    if t == "owner":
        return "مالك العقار" if ar else "Property owner"
    if t == "line_manager":
        return "المدير المباشر" if ar else "Line manager"
    if t == "hr_approver":
        return "معتمد الموارد البشرية" if ar else "HR approver"
    if t == "role":
        from api.models import Role

        r = db.get(Role, v)
        return ((r.label_ar if ar else r.label_en) if r else str(v)) + (" (دور)" if ar else " (role)")
    if t == "user":
        u = db.get(User, int(v)) if v else None
        return (getattr(u, "full_name", None) or u.username) if u else "—"
    if t == "permission":
        return (f"صلاحية {v}" if ar else f"Permission {v}")
    return str(t)


def task_json(db: Session, t: ApprovalTask, locale: str = "ar") -> dict:
    ar = locale == "ar"
    return {
        "id": t.id, "step": t.step_index + 1, "key": t.step_key,
        "label": (t.label_ar if ar else t.label_en) or (t.label_en if ar else t.label_ar) or describe(db, t.approver, locale),
        "approver": describe(db, t.approver, locale), "approver_type": (t.approver or {}).get("type"),
        "status": t.status, "decided_by": t.decided_by_name, "on_behalf": t.on_behalf,
        "decided_at": t.decided_at.isoformat() if t.decided_at else None, "note": t.note,
        "due_at": t.due_at.isoformat() if t.due_at else None,
        "overdue": bool(t.status == "pending" and t.due_at and t.due_at < datetime.utcnow()),
        "escalated": bool(t.escalated_at),
    }


def chain_json(db: Session, key: str, entity_id: int, locale: str = "ar") -> list[dict]:
    return [task_json(db, t, locale) for t in chain(db, key, entity_id) if t.status != "cancelled"]


def notify(db: Session, t: ApprovalTask, subject_ar: str, subject_en: str, body_ar: str, body_en: str, url: str, extra: Optional[list[User]] = None) -> None:
    """E-mail the people who can act on a staff step (owner steps are e-mailed by their module)."""
    if (t.approver or {}).get("type") == "owner":
        return
    from api.routers.maintenance import _mail

    sent = set()
    for u in resolve(db, t.approver, t.context or {}) + (extra or []):
        if u.id == t.requester_id or not u.email or u.email in sent:
            continue
        sent.add(u.email)
        step = f" — {'الخطوة' } {t.step_index + 1}"
        _mail(u.email, f"{subject_ar}{step} | {subject_en} — step {t.step_index + 1}", body_ar, body_en, url, "مراجعة واعتماد", "Review & decide")


def notify_final(db: Session, key: str, subject: str, body_ar: str, body_en: str, url: str) -> None:
    p = policy(db, key)
    from api.routers.maintenance import _mail

    for e in [x.strip() for x in (p.get("notify_emails") or "").replace(";", ",").split(",") if x.strip()]:
        _mail(e, subject, body_ar, body_en, url, "عرض", "Open")


def escalate_due(db: Session) -> int:
    """Pending steps past their response time: notify the escalation contact
    (and the approvers again) once. Returns how many were escalated."""
    from api.config import get_settings

    now = datetime.utcnow()
    n = 0
    base = get_settings().web_base_url.rstrip("/")
    for t in db.scalars(select(ApprovalTask).where(ApprovalTask.status == "pending", ApprovalTask.due_at.is_not(None), ApprovalTask.due_at < now, ApprovalTask.escalated_at.is_(None))).all():
        d = DEFS.get(t.workflow, {})
        t.escalated_at = now
        extra = resolve(db, t.escalate_to, t.context or {}) if t.escalate_to else []
        hours = int((now - (t.activated_at or now)).total_seconds() // 3600)
        notify(db, t, f"تأخر اعتماد: {d.get('ar', t.workflow)}", f"Approval overdue: {d.get('en', t.workflow)}",
               f"<p>طلب بانتظار الاعتماد منذ {hours} ساعة وتجاوز المهلة المحددة. الخطوة: <strong>{escape(t.label_ar or describe(db, t.approver, 'ar'))}</strong>.</p>",
               f"<p>A request has been waiting {hours} hours, past its response time. Step: <strong>{escape(t.label_en or describe(db, t.approver, 'en'))}</strong>.</p>",
               f"{base}/ar/approvals", extra=extra)
        n += 1
    if n:
        db.commit()
    return n


async def escalation_loop() -> None:
    import asyncio

    from api.database import SessionLocal

    def _run() -> None:
        with SessionLocal() as db:
            escalate_due(db)

    await asyncio.sleep(180)  # not during the deploy preflight
    while True:
        try:
            await asyncio.to_thread(_run)  # never block the event loop with database work
        except Exception:  # noqa: BLE001
            log.exception("workflow escalation failed")
        await asyncio.sleep(900)
