"""Dynamic forms: custom fields per entity, changed only through super-admin approval.

Safety rules (enforced here, not only in the UI):
* Built-in fields (the entity's own table columns — names, IDs, relations, amounts,
  Ejar data) are read-only: they're listed for reference and can't be removed or altered.
* Custom field values live in ``custom_field_values``, never in the core tables, so a
  form change can't break a relation or overwrite core data.
* A request changes nothing until a super admin approves it; approval re-checks the
  request against the live form so two requests can't overwrite each other.
* Removing a field archives it — its saved values are kept and it can be restored.
* A field's type can only change to a compatible type, and a choice can't be removed
  while records still use it.
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime
from html import escape
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from api.config import get_settings
from api.deps import CurrentUser, DbSession
from api.form_models import CustomFieldValue, FormChangeRequest, FormDefinition, FormVersion
from api.models import Agent, AuditLog, Building, Contract, Owner, Tenant, Unit, User
from api.permissions import has_permission

logger = logging.getLogger(__name__)
router = APIRouter(tags=["forms"])

ENTITIES: dict[str, dict[str, Any]] = {
    "owner": {"model": Owner, "module": "owners", "ar": "الملاك", "en": "Owners", "icon": "real_estate_agent"},
    "tenant": {"model": Tenant, "module": "tenants", "ar": "المستأجرون", "en": "Tenants", "icon": "person"},
    "building": {"model": Building, "module": "properties", "ar": "العقارات", "en": "Buildings", "icon": "apartment"},
    "unit": {"model": Unit, "module": "properties", "ar": "الوحدات", "en": "Units", "icon": "meeting_room"},
    "contract": {"model": Contract, "module": "contracts", "ar": "عقود الإيجار", "en": "Leases", "icon": "contract"},
    "agent": {"model": Agent, "module": "agents", "ar": "الوكلاء", "en": "Agents", "icon": "support_agent"},
}
TYPES = ("text", "textarea", "number", "date", "select", "multiselect", "checkbox", "phone", "email", "url")
# A field may only change between these families, so saved values stay meaningful.
FAMILY = {"text": "s", "textarea": "s", "phone": "s", "email": "s", "url": "s", "select": "c", "multiselect": "m",
          "number": "n", "date": "d", "checkbox": "b"}
KEY_RE = re.compile(r"^[a-z][a-z0-9_]{1,39}$")
MAX_FIELDS = 60
HIDDEN_COLS = {"id", "created_at", "updated_at"}

LABELS = {
    "name": ("الاسم", "Name"), "name_ar": ("الاسم بالعربية", "Name (Arabic)"), "name_en": ("الاسم بالإنجليزية", "Name (English)"),
    "phone": ("الجوال", "Mobile"), "email": ("البريد", "Email"), "national_id": ("رقم الهوية", "ID number"),
    "nationality": ("الجنسية", "Nationality"), "date_of_birth": ("تاريخ الميلاد", "Date of birth"), "iban": ("الآيبان", "IBAN"),
    "bank_name": ("البنك", "Bank"), "notes": ("ملاحظات", "Notes"), "owner_id": ("المالك (ربط)", "Owner (link)"),
    "agent_id": ("الوكيل (ربط)", "Agent (link)"), "tenant_id": ("المستأجر (ربط)", "Tenant (link)"),
    "building_id": ("العقار (ربط)", "Building (link)"), "unit_id": ("الوحدة (ربط)", "Unit (link)"),
    "management_contract_id": ("عقد الإدارة (ربط)", "Management contract (link)"), "assignee_id": ("الموظف المسؤول (ربط)", "Assignee (link)"),
    "contract_number": ("رقم العقد", "Contract number"), "ejar_contract_number": ("رقم عقد إيجار", "Ejar contract number"),
    "start_date": ("تاريخ البداية", "Start date"), "end_date": ("تاريخ النهاية", "End date"), "rent_amount": ("الإيجار", "Rent"),
    "total_amount": ("إجمالي العقد", "Contract total"), "status": ("الحالة", "Status"), "city": ("المدينة", "City"),
    "district": ("الحي", "District"), "number": ("رقم الوحدة", "Unit number"), "address": ("العنوان", "Address"),
}


# ═══════════════════════════ helpers ═══════════════════════════


def _actor(u: User) -> str:
    return getattr(u, "full_name", None) or u.username


def _is_super(u: User) -> bool:
    return bool(getattr(u, "is_super_admin", False))


def _can_request(db, u: User) -> bool:
    return _is_super(u) or u.role == "admin" or has_permission(db, u, "users", "edit")


def _entity(entity: str) -> dict:
    if entity not in ENTITIES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown form")
    return ENTITIES[entity]


def _definition(db, entity: str) -> FormDefinition:
    d = db.scalar(select(FormDefinition).where(FormDefinition.entity == entity))
    if d is None:
        d = FormDefinition(entity=entity, version=0, fields=[])
        db.add(d)
        db.flush()
    return d


def _system_fields(entity: str) -> list[dict]:
    model = ENTITIES[entity]["model"]
    out = []
    for c in model.__table__.columns:
        if c.name in HIDDEN_COLS:
            continue
        ar, en = LABELS.get(c.name, (c.name.replace("_", " "), c.name.replace("_", " ").capitalize()))
        kind = "relation" if c.foreign_keys else "core"
        out.append({"key": c.name, "label_ar": ar, "label_en": en, "kind": kind, "required": not c.nullable and c.default is None})
    return out


def _system_keys(entity: str) -> set[str]:
    return {c.name for c in ENTITIES[entity]["model"].__table__.columns}


class OptionIn(BaseModel):
    value: str = Field(min_length=1, max_length=60)
    ar: str = Field(min_length=1, max_length=120)
    en: Optional[str] = Field(default=None, max_length=120)


class FieldIn(BaseModel):
    key: str = Field(min_length=2, max_length=40)
    label_ar: str = Field(min_length=1, max_length=120)
    label_en: Optional[str] = Field(default=None, max_length=120)
    type: Literal["text", "textarea", "number", "date", "select", "multiselect", "checkbox", "phone", "email", "url"] = "text"
    required: bool = False
    options: list[OptionIn] = Field(default_factory=list, max_length=60)
    help_ar: Optional[str] = Field(default=None, max_length=300)
    help_en: Optional[str] = Field(default=None, max_length=300)
    section_ar: Optional[str] = Field(default=None, max_length=80)
    section_en: Optional[str] = Field(default=None, max_length=80)
    archived: bool = False


def _clean(fields: list[FieldIn]) -> list[dict]:
    out = []
    for i, f in enumerate(fields):
        d = f.model_dump()
        d["order"] = i
        d["options"] = [o.model_dump() for o in f.options] if f.type in ("select", "multiselect") else []
        out.append(d)
    return out


def _values_in_use(db, entity: str, key: str) -> list:
    return [r.value.get("v") if isinstance(r.value, dict) else None
            for r in db.scalars(select(CustomFieldValue).where(CustomFieldValue.entity == entity, CustomFieldValue.field_key == key)).all()]


def _validate(db, entity: str, current: list[dict], proposed: list[dict], locale: str = "ar") -> tuple[list[dict], list[str]]:
    L = lambda ar, en: ar if locale == "ar" else en  # noqa: E731
    """Return (proposed with archived carry-overs, changes as text). Raise 422 when unsafe."""
    problems: list[str] = []
    sys_keys = _system_keys(entity)
    seen: set[str] = set()
    for f in proposed:
        k = f["key"]
        if not KEY_RE.match(k):
            problems.append(L(f"«{f['label_ar']}»: المعرّف التقني يجب أن يكون بحروف إنجليزية صغيرة وأرقام و _ (مثل emergency_contact).", f"«{f['label_ar']}»: the field key must be lowercase letters, digits or _ (e.g. emergency_contact)."))
        if k in sys_keys:
            problems.append(L(f"«{k}» حقل أساسي في النظام ولا يمكن إعادة تعريفه.", f"«{k}» is a built-in field and can't be redefined."))
        if k in seen:
            problems.append(L(f"المعرّف «{k}» مستخدم مرتين.", f"The key «{k}» is used twice."))
        seen.add(k)
        if f["type"] in ("select", "multiselect"):
            if not f["options"]:
                problems.append(L(f"«{f['label_ar']}» يحتاج خياراً واحداً على الأقل.", f"«{f['label_ar']}» needs at least one choice."))
            vals = [o["value"] for o in f["options"]]
            if len(vals) != len(set(vals)):
                problems.append(L(f"«{f['label_ar']}» فيه خيارات مكررة.", f"«{f['label_ar']}» has duplicate choices."))
    if len([f for f in proposed if not f.get("archived")]) > MAX_FIELDS:
        problems.append(L(f"الحد الأقصى {MAX_FIELDS} حقلاً إضافياً للنموذج.", f"A form can have at most {MAX_FIELDS} custom fields."))

    cur = {f["key"]: f for f in current}
    prop = {f["key"]: f for f in proposed}
    changes: list[str] = []
    # Fields left out of the proposal are archived, never dropped — values stay.
    for k, f in cur.items():
        if k not in prop:
            if not f.get("archived"):
                changes.append(f"archive:{k}:{f['label_ar']}")
            proposed.append({**f, "archived": True, "order": len(proposed)})
    for f in proposed:
        k = f["key"]
        old = cur.get(k)
        if old is None:
            changes.append(f"add:{k}:{f['label_ar']}:{f['type']}")
            continue
        if old.get("archived") and not f.get("archived"):
            changes.append(f"restore:{k}:{f['label_ar']}")
        elif f.get("archived") and not old.get("archived"):
            changes.append(f"archive:{k}:{f['label_ar']}")
        if old["type"] != f["type"]:
            used = [v for v in _values_in_use(db, entity, k) if v not in (None, "", [])]
            if used and FAMILY[old["type"]] != FAMILY[f["type"]]:
                problems.append(L(f"«{f['label_ar']}» فيه {len(used)} قيمة محفوظة، لا يمكن تغيير نوعه من {old['type']} إلى {f['type']}. أضف حقلاً جديداً بدلاً من ذلك.", f"«{f['label_ar']}» has {len(used)} saved value(s); its type can't change from {old['type']} to {f['type']}. Add a new field instead."))
            changes.append(f"type:{k}:{f['label_ar']}:{old['type']}→{f['type']}")
        if old["type"] in ("select", "multiselect") and f["type"] in ("select", "multiselect"):
            gone = {o["value"] for o in old.get("options", [])} - {o["value"] for o in f.get("options", [])}
            if gone:
                used = _values_in_use(db, entity, k)
                flat = [x for v in used for x in (v if isinstance(v, list) else [v])]
                busy = sorted(g for g in gone if g in flat)
                if busy:
                    problems.append(L(f"«{f['label_ar']}»: الخيار ({', '.join(busy)}) مستخدم في سجلات محفوظة ولا يمكن حذفه.", f"«{f['label_ar']}»: the choice(s) {', '.join(busy)} are used by saved records and can't be removed."))
                changes.append(f"options:{k}:{f['label_ar']}")
            elif [o for o in old.get("options", [])] != [o for o in f.get("options", [])]:
                changes.append(f"options:{k}:{f['label_ar']}")
        for attr in ("label_ar", "label_en", "required", "help_ar", "help_en", "section_ar", "section_en"):
            if (old.get(attr) or None) != (f.get(attr) or None):
                changes.append(f"edit:{k}:{f['label_ar']}:{attr}")
    if problems:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, " · ".join(problems))
    for i, f in enumerate(proposed):
        f["order"] = i
    live_before = [f["key"] for f in sorted(current, key=lambda f: f.get("order", 0)) if not f.get("archived") and f["key"] in prop and not prop[f["key"]].get("archived")]
    live_after = [f["key"] for f in proposed if not f.get("archived") and f["key"] in live_before]
    if live_before != live_after:
        changes.append("order")
    return proposed, changes


def _req_json(r: FormChangeRequest, me: Optional[User] = None) -> dict:
    return {
        "id": r.id, "number": r.number, "entity": r.entity, "base_version": r.base_version, "fields": r.fields,
        "changes": r.changes, "reason": r.reason, "status": r.status, "requested_by": r.requested_by,
        "requested_by_id": r.requested_by_id, "created_at": r.created_at.isoformat(), "reviewed_by": r.reviewed_by,
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None, "review_note": r.review_note,
        "mine": bool(me and r.requested_by_id == me.id),
    }


def _mail(to: Optional[str], subject: str, ar: str, en: str, url: str, label_ar: str, label_en: str) -> None:
    if not to:
        return
    try:
        from api.email import EmailMessage, _branded, _button, send_email

        html = _branded(f"{ar}{_button(url, label_ar)}", f"{en}{_button(url, label_en)}", preheader=subject)
        send_email(EmailMessage(to=to, subject=subject, text_body=f"{subject}\n{url}", html_body=html, category="system"))
    except Exception:  # noqa: BLE001
        logger.exception("form workflow email failed")


def _base() -> str:
    return get_settings().web_base_url.rstrip("/")


# ═══════════════════════════ designer & workflow ═══════════════════════════


@router.get("/forms")
def list_forms(db: DbSession, user: CurrentUser):
    if not _can_request(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can design forms")
    pend = dict(db.execute(select(FormChangeRequest.entity, func.count()).where(FormChangeRequest.status == "pending").group_by(FormChangeRequest.entity)).all())
    out = []
    for k, e in ENTITIES.items():
        d = db.scalar(select(FormDefinition).where(FormDefinition.entity == k))
        fields = d.fields if d else []
        out.append({"entity": k, "ar": e["ar"], "en": e["en"], "icon": e["icon"], "version": d.version if d else 0,
                    "custom": len([f for f in fields if not f.get("archived")]), "archived": len([f for f in fields if f.get("archived")]),
                    "system": len(_system_fields(k)), "pending": pend.get(k, 0),
                    "updated_at": d.updated_at.isoformat() if d and d.version else None, "updated_by": d.updated_by if d else None})
    return {"forms": out, "is_super_admin": _is_super(user)}


@router.get("/forms/{entity}")
def get_form(entity: str, db: DbSession, user: CurrentUser):
    if not _can_request(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can design forms")
    e = _entity(entity)
    d = db.scalar(select(FormDefinition).where(FormDefinition.entity == entity))
    counts = dict(db.execute(select(CustomFieldValue.field_key, func.count()).where(CustomFieldValue.entity == entity).group_by(CustomFieldValue.field_key)).all())
    reqs = db.scalars(select(FormChangeRequest).where(FormChangeRequest.entity == entity).order_by(FormChangeRequest.id.desc()).limit(30)).all()
    versions = db.scalars(select(FormVersion).where(FormVersion.entity == entity).order_by(FormVersion.version.desc()).limit(20)).all()
    return {
        "entity": entity, "ar": e["ar"], "en": e["en"], "icon": e["icon"],
        "version": d.version if d else 0, "fields": d.fields if d else [], "system": _system_fields(entity),
        "value_counts": counts, "requests": [_req_json(r, user) for r in reqs],
        "versions": [{"version": v.version, "at": v.at.isoformat(), "approved_by": v.approved_by, "request_id": v.request_id, "fields": len([f for f in v.fields if not f.get("archived")])} for v in versions],
        "is_super_admin": _is_super(user),
    }


class RequestIn(BaseModel):
    fields: list[FieldIn] = Field(max_length=120)
    reason: str = Field(min_length=3, max_length=2000)


@router.post("/forms/{entity}/requests", status_code=status.HTTP_201_CREATED)
def request_change(entity: str, payload: RequestIn, db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    if not _can_request(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can request form changes")
    e = _entity(entity)
    d = _definition(db, entity)
    proposed, changes = _validate(db, entity, list(d.fields or []), _clean(payload.fields), locale)
    if not changes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "لا يوجد أي تغيير عن النموذج الحالي." if locale == "ar" else "Nothing changed compared with the live form.")
    seq = (db.scalar(select(func.max(FormChangeRequest.id))) or 0) + 1
    r = FormChangeRequest(number=f"FR-{seq:04d}", entity=entity, base_version=d.version, fields=proposed, changes=changes,
                          reason=payload.reason.strip(), requested_by_id=user.id, requested_by=_actor(user))
    db.add(r)
    db.add(AuditLog(user_id=user.id, username=user.username, action="form_change_requested", entity_type="form", entity_id=entity))
    db.commit()
    for su in db.scalars(select(User).where(User.is_super_admin.is_(True), User.is_active_user.is_(True))).all():
        if su.id == user.id:
            continue
        _mail(su.email, f"طلب تعديل نموذج {r.number} | Form change request {r.number}",
              f"<p>طلب <strong>{escape(r.requested_by or '')}</strong> تعديل نموذج <strong>{e['ar']}</strong> ({len(changes)} تغيير).</p><p>{escape(r.reason or '')}</p>",
              f"<p><strong>{escape(r.requested_by or '')}</strong> requested a change to the <strong>{e['en']}</strong> form ({len(changes)} change(s)).</p><p>{escape(r.reason or '')}</p>",
              f"{_base()}/ar/forms?entity={entity}&request={r.id}", "مراجعة الطلب", "Review request")
    return _req_json(r, user)


@router.get("/forms/requests/all")
def list_requests(db: DbSession, user: CurrentUser, state: Optional[str] = Query(None, max_length=12)):
    if not _can_request(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can see form requests")
    q = select(FormChangeRequest).order_by(FormChangeRequest.id.desc()).limit(100)
    if state:
        q = q.where(FormChangeRequest.status == state)
    return [_req_json(r, user) for r in db.scalars(q).all()]


class DecisionIn(BaseModel):
    note: Optional[str] = Field(default=None, max_length=2000)


def _get_req(db, rid: int) -> FormChangeRequest:
    r = db.get(FormChangeRequest, rid)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    return r


def _notify_requester(db, r: FormChangeRequest) -> None:
    u = db.get(User, r.requested_by_id) if r.requested_by_id else None
    if not u or not u.email:
        return
    ok = r.status == "approved"
    e = ENTITIES[r.entity]
    _mail(u.email, f"{'اعتُمد' if ok else 'رُفض'} طلب تعديل النموذج {r.number} | Form change {r.number} {'approved' if ok else 'rejected'}",
          f"<p>{'اعتُمد طلبك وأصبح نموذج' if ok else 'رُفض طلب تعديل نموذج'} <strong>{e['ar']}</strong>{' محدّثًا الآن' if ok else ''}.</p>" + (f"<p>{escape(r.review_note)}</p>" if r.review_note else ""),
          f"<p>Your change to the <strong>{e['en']}</strong> form was {'approved and is live now' if ok else 'rejected'}.</p>" + (f"<p>{escape(r.review_note)}</p>" if r.review_note else ""),
          f"{_base()}/ar/forms?entity={r.entity}", "فتح النماذج", "Open forms")


@router.post("/forms/requests/{rid}/approve")
def approve(rid: int, payload: DecisionIn, db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    if not _is_super(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a super admin can approve form changes")
    r = _get_req(db, rid)
    if r.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This request was already decided.")
    d = _definition(db, r.entity)
    # Re-check against the live form: another request may have been approved meanwhile.
    live_fields = [FieldIn(**{k: v for k, v in f.items() if k in FieldIn.model_fields}) for f in r.fields]
    proposed, changes = _validate(db, r.entity, list(d.fields or []), _clean(live_fields), locale)
    if not changes:
        raise HTTPException(status.HTTP_409_CONFLICT, "The live form already matches this request.")
    d.version += 1
    d.fields = proposed
    d.updated_at = datetime.utcnow()
    d.updated_by = _actor(user)
    r.status, r.reviewed_by_id, r.reviewed_by, r.reviewed_at, r.review_note = "approved", user.id, _actor(user), datetime.utcnow(), (payload.note or "").strip() or None
    r.changes = changes
    db.add(FormVersion(entity=r.entity, version=d.version, fields=proposed, request_id=r.id, approved_by=_actor(user)))
    db.add(AuditLog(user_id=user.id, username=user.username, action="form_change_approved", entity_type="form", entity_id=f"{r.entity}:v{d.version}"))
    db.commit()
    _notify_requester(db, r)
    return _req_json(r, user)


@router.post("/forms/requests/{rid}/reject")
def reject(rid: int, payload: DecisionIn, db: DbSession, user: CurrentUser):
    if not _is_super(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a super admin can reject form changes")
    r = _get_req(db, rid)
    if r.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This request was already decided.")
    if not (payload.note or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Write the reason — the requester sees it.")
    r.status, r.reviewed_by_id, r.reviewed_by, r.reviewed_at, r.review_note = "rejected", user.id, _actor(user), datetime.utcnow(), payload.note.strip()
    db.add(AuditLog(user_id=user.id, username=user.username, action="form_change_rejected", entity_type="form", entity_id=r.entity))
    db.commit()
    _notify_requester(db, r)
    return _req_json(r, user)


@router.post("/forms/requests/{rid}/cancel")
def cancel(rid: int, db: DbSession, user: CurrentUser):
    r = _get_req(db, rid)
    if r.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This request was already decided.")
    if r.requested_by_id != user.id and not _is_super(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the requester can withdraw it")
    r.status, r.reviewed_at, r.reviewed_by = "cancelled", datetime.utcnow(), _actor(user)
    db.commit()
    return _req_json(r, user)


# ═══════════════════════════ values ═══════════════════════════


def _live_fields(db, entity: str) -> list[dict]:
    d = db.scalar(select(FormDefinition).where(FormDefinition.entity == entity))
    return sorted([f for f in (d.fields if d else []) if not f.get("archived")], key=lambda f: f.get("order", 0))


def _check_record(db, entity: str, entity_id: int) -> None:
    if db.get(ENTITIES[entity]["model"], entity_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Record not found")


@router.get("/custom-fields/{entity}")
def schema(entity: str, db: DbSession, user: CurrentUser):
    e = _entity(entity)
    if not has_permission(db, user, e["module"], "view"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Permission denied")
    return {"fields": _live_fields(db, entity)}


@router.get("/custom-fields/{entity}/{entity_id}")
def get_values(entity: str, entity_id: int, db: DbSession, user: CurrentUser):
    e = _entity(entity)
    if not has_permission(db, user, e["module"], "view"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Permission denied")
    rows = db.scalars(select(CustomFieldValue).where(CustomFieldValue.entity == entity, CustomFieldValue.entity_id == entity_id)).all()
    return {"fields": _live_fields(db, entity), "values": {r.field_key: (r.value or {}).get("v") for r in rows}}


class ValuesIn(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)


def _coerce(f: dict, v: Any) -> Any:
    t = f["type"]
    if v in (None, "", []):
        return None
    if t in ("text", "textarea", "phone", "email", "url"):
        s = str(v).strip()[:5000 if t == "textarea" else 500]
        if t == "email" and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", s):
            raise ValueError("isn't a valid email")
        if t == "url" and not re.match(r"^https?://", s):
            raise ValueError("must start with http:// or https://")
        if t == "phone" and not re.match(r"^[0-9+\-\s()]{5,20}$", s):
            raise ValueError("isn't a valid phone number")
        return s
    if t == "number":
        return float(v)
    if t == "date":
        return date.fromisoformat(str(v)[:10]).isoformat()
    if t == "checkbox":
        return bool(v) if not isinstance(v, str) else v.lower() in ("1", "true", "yes", "on")
    allowed = {o["value"] for o in f.get("options", [])}
    if t == "select":
        if str(v) not in allowed:
            raise ValueError("isn't one of the choices")
        return str(v)
    if t == "multiselect":
        vals = [str(x) for x in (v if isinstance(v, list) else [v])]
        bad = [x for x in vals if x not in allowed]
        if bad:
            raise ValueError("has a value that isn't one of the choices")
        return vals
    return v


@router.put("/custom-fields/{entity}/{entity_id}")
def save_values(entity: str, entity_id: int, payload: ValuesIn, db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    e = _entity(entity)
    if not (has_permission(db, user, e["module"], "edit") or has_permission(db, user, e["module"], "create")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Permission denied")
    _check_record(db, entity, entity_id)
    fields = {f["key"]: f for f in _live_fields(db, entity)}
    errors = []
    clean: dict[str, Any] = {}
    for k, f in fields.items():
        raw = payload.values.get(k)
        try:
            v = _coerce(f, raw)
        except (ValueError, TypeError) as ex:
            errors.append(f"«{f['label_ar'] if locale == 'ar' else (f.get('label_en') or f['label_ar'])}»: " + ({"isn't a valid email": "بريد غير صحيح", "must start with http:// or https://": "الرابط يجب أن يبدأ بـ https://", "isn't a valid phone number": "رقم جوال غير صحيح", "isn't one of the choices": "قيمة ليست من الخيارات", "has a value that isn't one of the choices": "فيه قيمة ليست من الخيارات"}.get(str(ex), "قيمة غير صحيحة") if locale == "ar" else str(ex)))
            continue
        if f.get("required") and v in (None, "", []) and f["type"] != "checkbox":
            errors.append(f"«{f['label_ar']}» مطلوب" if locale == "ar" else f"«{f.get('label_en') or f['label_ar']}» is required")
        clean[k] = v
    if errors:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, " · ".join(errors))
    existing = {r.field_key: r for r in db.scalars(select(CustomFieldValue).where(CustomFieldValue.entity == entity, CustomFieldValue.entity_id == entity_id)).all()}
    who = _actor(user)
    for k, v in clean.items():
        row = existing.get(k)
        if v is None:
            if row is not None:
                db.delete(row)
            continue
        if row is None:
            db.add(CustomFieldValue(entity=entity, entity_id=entity_id, field_key=k, value={"v": v}, updated_by=who))
        elif (row.value or {}).get("v") != v:
            row.value, row.updated_by = {"v": v}, who
    db.commit()
    return get_values(entity, entity_id, db, user)
