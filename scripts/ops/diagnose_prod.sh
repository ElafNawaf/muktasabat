#!/bin/bash
# 1) Inspect the account owner's login record (masked). 2) Re-invite all users except 'admin'.
cat /home/ubuntu/muktasabat/.last_deployed_sha
docker exec -i muktasabat-api-1 python - <<'PY'
from sqlalchemy import func, select
from api.database import SessionLocal
from api.models import User
from api.services.reinvite import reinvite_users
with SessionLocal() as db:
    users = db.scalars(select(User).order_by(User.id)).all()
    print("USERS", len(users), "| roles:", {r: sum(1 for u in users if u.role == r) for r in {u.role for u in users}})
    me = db.scalar(select(User).where(func.lower(User.email) == "elaf.nawaf7@gmail.com"))
    if me:
        print("OWNER-ACCOUNT id", me.id, "role", me.role, "active", me.is_active_user,
              "| username==email:", me.username.lower() == me.email.lower(),
              "| username has capitals:", me.username != me.username.lower(),
              "| reset link pending:", bool(me.password_reset_token))
    else:
        print("OWNER-ACCOUNT not found by email")
    rep = reinvite_users(db, exclude_usernames={"admin"})
    for k in ("sent", "failed", "skipped"):
        print(k.upper(), len(rep[k]))
        for line in rep[k]:
            print("   ", line)
PY
