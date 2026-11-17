#!/usr/bin/env bash
# Requested: move user #66 (self-registered "viewer") to "pending" and sign it out everywhere.
set -eu
docker exec -i muktasabat-api-1 python - <<'PY'
from sqlalchemy import select
from api.database import SessionLocal
from api.models import User
db = SessionLocal()
u = db.get(User, 66)
assert u is not None and u.role == "viewer", "user 66 is not a viewer any more — nothing changed"
u.role = "pending"
if hasattr(u, "token_version"):
    u.token_version = (u.token_version or 0) + 1  # existing sessions stop working
db.commit()
print("user 66 role:", db.get(User, 66).role, "| sessions revoked:", hasattr(u, "token_version"))
PY
