#!/usr/bin/env bash
# Read-only: users per role; viewer accounts by id/created/verified (no names or emails).
set -eu
docker exec -i muktasabat-api-1 python - <<'PY'
from collections import Counter
from sqlalchemy import select
from api.database import SessionLocal
from api.models import User
db = SessionLocal()
us = db.scalars(select(User)).all()
print("roles:", dict(Counter(u.role for u in us)))
print("pending role exists:", db.execute(__import__("sqlalchemy").text("select count(*) from roles where code='pending'")).scalar())
for u in us:
    if u.role == "viewer":
        print(f"  viewer id={u.id} created={u.created_at:%Y-%m-%d} verified={u.email_verified} active={u.is_active_user} last_login={getattr(u,'last_login_at',None)}")
PY
