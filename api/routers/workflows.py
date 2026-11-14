"""Administration → Approval workflows (مسارات الاعتماد).

Admins see every approval flow in the system, switch the configurable ones on
or off and edit their ordered chain of steps (who approves, under which
conditions, response time and escalation). Fixed flows are listed read-only.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from api.bootstrap_roles import _MODULES
from api.deps import AdminUser, DbSession
from api.models import AuditLog, Role, User
from api.services import workflows as wf
from api.workflow_models import ApprovalTask, WorkflowPolicy

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _item(db, key: str, locale: str) -> dict:
    d = wf.DEFS[key]
    p = wf.policy(db, key)
    ar = locale == "ar"
    steps = []
    for s in p["steps"]:
        steps.append({**s, "approver_label": wf.describe(db, s.get("approver"), locale),
                      "escalate_label": wf.describe(db, s.get("escalate_to"), locale) if s.get("escalate_to") else None})
    pending = db.scalar(select(func.count(ApprovalTask.id)).where(ApprovalTask.workflow == key, ApprovalTask.status == "pending")) or 0
    overdue = db.scalar(select(func.count(ApprovalTask.id)).where(
        ApprovalTask.workflow == key, ApprovalTask.status == "pending", ApprovalTask.due_at.is_not(None), ApprovalTask.due_at < datetime.utcnow())) or 0
    return {
        "key": key, "configurable": True, "name": d["ar"] if ar else d["en"], "name_ar": d["ar"], "name_en": d["en"],
        "icon": d.get("icon"), "module": d.get("module"),
        "description": d.get("desc_ar") if ar else d.get("desc_en"),
        "amount_label": d.get("amount_ar") if ar else d.get("amount_en"),
        "conditions": d["conditions"], "approver_types": d["approvers"],
        "enabled": p["enabled"], "steps": steps, "notify_emails": p["notify_emails"],
        "customised": p["customised"], "updated_at": p["updated_at"], "updated_by": p["updated_by"],
        "pending": pending, "overdue": overdue,
    }


@router.get("")
def list_workflows(db: DbSession, _admin: AdminUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    ar = locale == "ar"
    users = db.scalars(select(User).where(User.role.not_in(["owner", "tenant"])).order_by(User.username)).all()
    roles = db.scalars(select(Role).order_by(Role.code)).all()
    return {
        "workflows": [_item(db, k, locale) for k in wf.DEFS],
        "fixed": [{"key": k, "configurable": False, "name": v["ar"] if ar else v["en"], "icon": v["icon"],
                   "who": v["who_ar"] if ar else v["who_en"]} for k, v in wf.FIXED.items()],
        "options": {
            "roles": [{"value": r.code, "label": r.label_ar if ar else r.label_en} for r in roles if r.code not in ("owner", "tenant")],
            "users": [{"value": u.id, "label": (getattr(u, "full_name", None) or u.username), "role": u.role}
                      for u in users if u.is_active_user],
            "modules": list(_MODULES),
            "kinds": list(wf.HR_KINDS),
        },
    }


class StepIn(BaseModel):
    key: Optional[str] = None
    label_ar: Optional[str] = None
    label_en: Optional[str] = None
    approver: dict[str, Any]
    when: dict[str, Any] = Field(default_factory=dict)
    sla_hours: Optional[int] = Field(default=None, ge=0, le=24 * 30)
    escalate_to: Optional[dict[str, Any]] = None


class PolicyIn(BaseModel):
    enabled: bool = True
    steps: list[StepIn] = Field(default_factory=list)
    notify_emails: Optional[str] = Field(default=None, max_length=500)


@router.put("/{key}")
def save_workflow(key: str, payload: PolicyIn, db: DbSession, admin: AdminUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    if key not in wf.DEFS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown workflow")
    steps = wf.clean_steps(key, [s.model_dump() for s in payload.steps])
    if payload.enabled and not steps:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Add at least one step, or switch the workflow off")
    row = db.get(WorkflowPolicy, key) or WorkflowPolicy(key=key)
    before = wf.policy(db, key)
    row.enabled, row.steps = payload.enabled, steps
    row.notify_emails = (payload.notify_emails or "").strip() or None
    row.updated_at, row.updated_by = datetime.utcnow(), (getattr(admin, "full_name", None) or admin.username)
    db.add(row)
    db.add(AuditLog(user_id=admin.id, username=admin.username, action="workflow_update", entity_type="workflow", entity_id=key,
                    details={"before": {"enabled": before["enabled"], "steps": before["steps"]}, "after": {"enabled": row.enabled, "steps": steps}}))
    db.commit()
    return _item(db, key, locale)


@router.post("/{key}/reset")
def reset_workflow(key: str, db: DbSession, admin: AdminUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    if key not in wf.DEFS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown workflow")
    row = db.get(WorkflowPolicy, key)
    if row:
        db.delete(row)
        db.add(AuditLog(user_id=admin.id, username=admin.username, action="workflow_reset", entity_type="workflow", entity_id=key))
        db.commit()
    return _item(db, key, locale)
