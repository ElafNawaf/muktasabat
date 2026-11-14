"""Seed the six default roles on first startup.

Mirrors the prototype's `data.js` role definitions. `system` roles (admin, owner)
are immutable once seeded — the roles router enforces that. Re-running this is
safe: existing roles are left untouched, only missing rows are inserted.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.models import Role


_MODULES = [
    "dashboard",
    "properties",
    "contracts",
    "payments",
    "owners",
    "agents",
    "tenants",
    "expenses",
    "maintenance",
    "management_contracts",
    "company",
    "owner_portal",
    "users",
    "data",
    "website",
    # Support tickets: `edit` = support staff (sees all tickets, triages, replies).
    "support",
    # HR: view = see all employees; create = file on behalf; edit = profiles,
    # attendance, ticket bookings; approve = decide requests + HR settings.
    # Every staff account has self-service (My HR) without this module.
    "hr",
]
_ALL = {m: {"view": 1, "create": 1, "edit": 1, "delete": 1, "approve": 1} for m in _MODULES}


def _build(perms_per_module: dict[str, dict[str, int]]) -> dict:
    out: dict = {}
    for m in _MODULES:
        cell = perms_per_module.get(m, {})
        out[m] = {a: cell.get(a, 0) for a in ("view", "create", "edit", "delete", "approve")}
    return out


DEFAULT_ROLES: list[dict] = [
    {
        "code": "admin",
        "label_en": "Administrator",
        "label_ar": "مدير النظام",
        "description_en": "Full access to all modules and settings.",
        "description_ar": "صلاحيات كاملة على جميع الوحدات والإعدادات.",
        "color": "#7B1A1A",
        "system": True,
        "permissions": _ALL,
    },
    {
        "code": "manager",
        "label_en": "Property Manager",
        "label_ar": "مدير عقارات",
        "description_en": "Manage assigned buildings, contracts and payments. Cannot delete users.",
        "description_ar": "إدارة المباني والعقود والمدفوعات. لا يمكنه حذف المستخدمين.",
        "color": "#2563EB",
        "system": False,
        "permissions": _build(
            {
                "dashboard": {"view": 1},
                "properties": {"view": 1, "create": 1, "edit": 1, "approve": 1},
                "contracts": {"view": 1, "create": 1, "edit": 1, "approve": 1},
                "management_contracts": {"view": 1, "create": 1, "edit": 1, "approve": 1},
                "maintenance": {"view": 1, "create": 1, "edit": 1, "delete": 1, "approve": 1},
                "company": {"view": 1},
                "owner_portal": {"view": 1, "create": 1, "edit": 1},
                "payments": {"view": 1, "create": 1, "edit": 1, "approve": 1},
                "owners": {"view": 1, "create": 1, "edit": 1},
                "agents": {"view": 1, "create": 1, "edit": 1},
                "tenants": {"view": 1, "create": 1, "edit": 1, "delete": 1},
                "expenses": {"view": 1, "create": 1, "edit": 1},
                "users": {"view": 1},
            }
        ),
    },
    {
        "code": "accountant",
        "label_en": "Accountant",
        "label_ar": "محاسب",
        "description_en": "Read access on properties; full access on payments and expenses.",
        "description_ar": "عرض العقارات؛ صلاحيات كاملة على المدفوعات والمصروفات.",
        "color": "#059669",
        "system": False,
        "permissions": _build(
            {
                "dashboard": {"view": 1},
                "properties": {"view": 1},
                "contracts": {"view": 1},
                "management_contracts": {"view": 1},
                "company": {"view": 1},
                "payments": {"view": 1, "create": 1, "edit": 1, "delete": 1, "approve": 1},
                "owners": {"view": 1},
                "agents": {"view": 1},
                "tenants": {"view": 1},
                "expenses": {"view": 1, "create": 1, "edit": 1, "delete": 1, "approve": 1},
            }
        ),
    },
    {
        "code": "agent",
        "label_en": "Leasing Agent",
        "label_ar": "وكيل تأجير",
        "description_en": "Create new contracts and tenants. Limited financial access.",
        "description_ar": "إنشاء عقود ومستأجرين جدد. صلاحية مالية محدودة.",
        "color": "#D97706",
        "system": False,
        "permissions": _build(
            {
                "dashboard": {"view": 1},
                "properties": {"view": 1},
                "contracts": {"view": 1, "create": 1, "edit": 1},
                "management_contracts": {"view": 1},
                "payments": {"view": 1},
                "owners": {"view": 1},
                "agents": {"view": 1},
                "tenants": {"view": 1, "create": 1, "edit": 1},
            }
        ),
    },
    {
        "code": "viewer",
        "label_en": "Viewer",
        "label_ar": "مُطّلع",
        "description_en": "Read-only access to properties, contracts and payments.",
        "description_ar": "وصول للقراءة فقط على العقارات والعقود والمدفوعات.",
        "color": "#6B7280",
        "system": False,
        "permissions": _build(
            {
                "dashboard": {"view": 1},
                "management_contracts": {"view": 1},
                "properties": {"view": 1},
                "contracts": {"view": 1},
                "payments": {"view": 1},
                "owners": {"view": 1},
                "agents": {"view": 1},
                "tenants": {"view": 1},
            }
        ),
    },
    {
        "code": "content_editor",
        "label_en": "Content Editor",
        "label_ar": "محرر المحتوى",
        "description_en": "Manages the public website: pages, projects, news, careers and enquiries.",
        "description_ar": "إدارة الموقع العام: الصفحات والمشاريع والأخبار والوظائف والاستفسارات.",
        "color": "#0F766E",
        "system": False,
        "permissions": _build(
            {
                "website": {"view": 1, "create": 1, "edit": 1},
            }
        ),
    },
    {
        "code": "hr_manager",
        "label_en": "HR manager",
        "label_ar": "مدير الموارد البشرية",
        "description_en": "Runs HR: employee records, attendance, and approves leave, permissions and travel tickets.",
        "description_ar": "يدير الموارد البشرية: سجلات الموظفين والحضور، ويعتمد الإجازات والاستئذانات وتذاكر السفر.",
        "color": "#2F6B5A",
        "system": False,
        "permissions": _build({"hr": {"view": 1, "create": 1, "edit": 1, "delete": 1, "approve": 1}}),
    },
    {
        "code": "hr_officer",
        "label_en": "HR officer",
        "label_ar": "أخصائي موارد بشرية",
        "description_en": "Maintains employee records and attendance and books approved tickets; cannot approve requests.",
        "description_ar": "يحدّث سجلات الموظفين والحضور ويحجز التذاكر المعتمدة، دون صلاحية الاعتماد.",
        "color": "#5A7D2F",
        "system": False,
        "permissions": _build({"hr": {"view": 1, "create": 1, "edit": 1}}),
    },
    {
        "code": "owner",
        "label_en": "Property Owner",
        "label_ar": "مالك",
        "description_en": "Owner portal access — view their own buildings, contracts and statements.",
        "description_ar": "بوابة المالك — عرض المباني والعقود والكشوفات الخاصة به.",
        "color": "#7C3AED",
        "system": True,
        "permissions": _build(
            {
                "properties": {"view": 1},
                "contracts": {"view": 1},
                "payments": {"view": 1},
                "tenants": {"view": 1},
                "expenses": {"view": 1},
            }
        ),
    },
]


def seed_default_roles(db: Session) -> None:
    for spec in DEFAULT_ROLES:
        if db.get(Role, spec["code"]) is not None:
            continue
        db.add(Role(**spec))
    db.commit()
    sync_missing_module_permissions(db)


_NONE = {a: 0 for a in ("view", "create", "edit", "delete", "approve")}


def _derive(module: str, perms: dict) -> dict:
    """Sensible starting value for a module a custom role has never seen,
    based on what that role could already do (admins can refine it later)."""
    get = lambda m: dict(_NONE, **(perms.get(m) or {}))  # noqa: E731
    if module == "management_contracts":
        return get("contracts")  # management contracts used to be governed by `contracts`
    if module == "owner_portal":
        # Owner logins are sensitive: only roles that can already edit owners.
        o = get("owners")
        return dict(_NONE, view=o["edit"], create=o["edit"], edit=o["edit"], delete=o["edit"])
    if module == "dashboard":
        # Company-wide finance figures: only roles that already see money or properties.
        return dict(_NONE, view=int(bool(get("payments")["view"] or get("properties")["view"])))
    if module == "maintenance":
        # Field work follows property permissions; approving spend stays with managers.
        p = get("properties")
        return dict(_NONE, view=p["view"], create=p["edit"], edit=p["edit"])
    if module == "hr":
        return dict(_NONE)  # employee data is sensitive: grant explicitly
    if module == "company":
        return dict(_NONE, view=get("contracts")["view"])
    return dict(_NONE)


def sync_missing_module_permissions(db: Session) -> None:
    """Merge new module permissions into existing roles without overwriting edits."""
    specs = {spec["code"]: spec["permissions"] for spec in DEFAULT_ROLES}
    changed = False
    for role in db.scalars(select(Role)).all():
        perms = dict(role.permissions or {})
        role_changed = False
        spec = specs.get(role.code)
        for module in _MODULES:
            if module in perms:
                continue
            if role.code == "admin":
                perms[module] = {a: 1 for a in _NONE}
            elif role.code == "owner":
                perms[module] = dict(_NONE)
            elif spec is not None and module in spec and any(spec[module].values()):
                perms[module] = spec[module]
            else:
                perms[module] = _derive(module, perms)
            role_changed = True
        if role_changed:
            role.permissions = perms
            changed = True
    if changed:
        db.commit()


def fix_rbac_defaults_v1(db: Session) -> None:
    """One-time correction (2026-11-14) of the first back-fill, which gave the
    content editor the finance dashboard and read-only roles owner-portal access.
    Recorded in cms_site_settings.private._migrations so it never runs twice."""
    from api.cms_models import SiteSettings

    row = db.get(SiteSettings, 1)
    done = set(((row.private or {}).get("_migrations") or [])) if row else set()
    if row is None or "rbac-fix-1" in done:
        return
    for role in db.scalars(select(Role)).all():
        if role.code in ("admin", "owner"):
            continue
        perms = dict(role.permissions or {})
        owners = perms.get("owners") or {}
        if not owners.get("edit"):
            perms["owner_portal"] = dict(_NONE)
        if not ((perms.get("payments") or {}).get("view") or (perms.get("properties") or {}).get("view")):
            perms["dashboard"] = dict(_NONE)
        role.permissions = perms
    private = dict(row.private or {})
    private["_migrations"] = sorted(done | {"rbac-fix-1"})
    row.private = private
    db.commit()
