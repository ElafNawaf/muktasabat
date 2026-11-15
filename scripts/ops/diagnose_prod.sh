#!/usr/bin/env bash
# 1) Elaf (id 4) = the super admin. 2) Dry run: which rows still reference user "admin". IDs/counts only.
set -eu
docker exec -i muktasabat-api-1 python - <<'PY'
from sqlalchemy import select, func, text
from api.database import SessionLocal, engine
from api.models import User
import api.main  # register every model
from api.database import Base
db = SessionLocal()
elaf = db.get(User, 4); admin = db.scalar(select(User).where(User.username == "admin"))
assert elaf and "elaf" in f"{elaf.username} {elaf.full_name or ''} {elaf.email}".lower(), "user 4 is not Elaf"
for u in db.scalars(select(User).where(User.is_super_admin.is_(True))).all():
    u.is_super_admin = False
elaf.is_super_admin = True; elaf.role = "admin"; elaf.is_active_user = True
db.commit()
print("super admin now id=4:", db.get(User, 4).is_super_admin, "role:", db.get(User, 4).role)
if admin is None: print("no admin user"); raise SystemExit
print("references to admin (id=%d):" % admin.id)
for t in Base.metadata.sorted_tables:
    for c in t.columns:
        for fk in c.foreign_keys:
            if fk.column.table.name == "users":
                n = db.scalar(select(func.count()).select_from(t).where(c == admin.id))
                if n: print(f"  {t.name}.{c.name} rows={n} nullable={c.nullable} ondelete={fk.ondelete}")
PY
