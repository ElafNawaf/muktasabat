#!/usr/bin/env bash
# Delete the bootstrap "admin" user using the app's own delete logic. Prints IDs/flags only.
set -eu
echo "== DISABLE_BOOTSTRAP_ADMIN on server: $(grep -E '^DISABLE_BOOTSTRAP_ADMIN=' /home/ubuntu/muktasabat/.env | cut -d= -f2 || echo unset)"
docker exec -i muktasabat-api-1 python - <<'PY'
from sqlalchemy import select, func
from api.database import SessionLocal
from api.models import User
from api.routers.auth import delete_user
db = SessionLocal()
admin = db.scalar(select(User).where(User.username == "admin"))
if admin is None:
    print("no user named admin — nothing to do"); raise SystemExit
others = db.scalars(select(User).where(User.role == "admin", User.is_active_user.is_(True), User.id != admin.id)).all()
print(f"admin id={admin.id} super={admin.is_super_admin} active={admin.is_active_user}; other active admins={[u.id for u in others]}")
actor = next((u for u in others if "elaf" in f"{u.username} {u.full_name or ''} {u.email}".lower()), None)
if actor is None:
    print("ABORT: no other active admin account for Elaf found"); raise SystemExit(1)
print(f"acting as user id={actor.id}")
if admin.is_super_admin:
    admin.is_super_admin = False; actor.is_super_admin = True; db.commit()
    print(f"super admin moved to id={actor.id}")
try:
    delete_user(admin.id, db, actor)
    print("deleted admin:", db.scalar(select(func.count()).select_from(User).where(User.username == "admin")) == 0)
except Exception as e:
    db.rollback()
    print("FAILED:", type(e).__name__, str(e)[:300].replace("\n", " "))
print("users now:", db.scalar(select(func.count()).select_from(User)), "active admins:", db.scalar(select(func.count()).select_from(User).where(User.role == "admin", User.is_active_user.is_(True))))
PY
