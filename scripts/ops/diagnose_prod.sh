#!/usr/bin/env bash
# Read-only: data scope per role, property managers and their assigned properties (ids/counts only).
set -u
docker exec -i muktasabat-api-1 python - <<'PY'
from collections import Counter
from sqlalchemy import select, func
from api.database import SessionLocal
from api.models import Building, Role, User
db = SessionLocal()
print("roles with scope 'assigned':", [r.code for r in db.scalars(select(Role).where(Role.data_scope == "assigned"))])
print("buildings total:", db.scalar(select(func.count()).select_from(Building)), "| without a responsible employee:", db.scalar(select(func.count()).select_from(Building).where(Building.assignee_id.is_(None))))
for u in db.scalars(select(User).where(User.role == "manager")).all():
    n = db.scalar(select(func.count()).select_from(Building).where(Building.assignee_id == u.id))
    print(f"  manager user id={u.id} active={u.is_active_user} assigned_properties={n}")
by = Counter(db.scalars(select(Building.assignee_id)).all())
print("properties per responsible user id:", dict(by))
print("roles of those users:", {uid: db.get(User, uid).role for uid in by if uid})
PY
