#!/bin/bash
# Pass 10 — password-reset email for elaf.nawaf7@gmail.com
docker exec muktasabat-api-1 python -c "
from sqlalchemy import select, func
from api.database import SessionLocal
from api.models import User
with SessionLocal() as db:
    us=db.scalars(select(User).where(func.lower(User.email).like('%elaf.nawaf7%'))).all()
    print('matching users:', [(u.id, u.username, u.email, u.role, u.is_active_user) for u in us])
"
echo '--- email log lines (2h) ---'
docker logs muktasabat-api-1 --since 2h 2>&1 | grep -iE 'email|ses|forgot|reset' | grep -v '\"path\": \"/api/v1/auth/me\"' | tail -15 | cut -c1-330
