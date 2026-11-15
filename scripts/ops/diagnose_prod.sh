#!/usr/bin/env bash
# Delete the "admin" user (requested): clear nullable links, then the app's delete_user as Elaf (id 4).
set -eu
docker exec -i muktasabat-api-1 python - <<'PY'
from sqlalchemy import select, func, update
from api.database import SessionLocal, Base
import api.main  # noqa
from api.models import User
from api.routers.auth import delete_user
db = SessionLocal()
admin = db.scalar(select(User).where(User.username == "admin")); actor = db.get(User, 4)
assert actor.is_super_admin and actor.role == "admin"
if admin is None:
    print("already gone"); raise SystemExit
for t in Base.metadata.sorted_tables:
    for c in t.columns:
        for fk in c.foreign_keys:
            if fk.column.table.name == "users" and (fk.ondelete or "").upper() not in ("CASCADE", "SET NULL") and c.nullable:
                db.execute(update(t).where(c == admin.id).values({c.name: None}))
db.flush()
try:
    delete_user(admin.id, db, actor)
    print("deleted:", db.scalar(select(User).where(User.username == "admin")) is None)
except Exception as e:
    db.rollback(); print("FAILED:", type(e).__name__, str(e)[:250].replace("\n", " "))
print("users:", db.scalar(select(func.count()).select_from(User)), "admins:", db.scalar(select(func.count()).select_from(User).where(User.role == "admin")), "super admin id:", db.scalar(select(User.id).where(User.is_super_admin.is_(True))))
PY
