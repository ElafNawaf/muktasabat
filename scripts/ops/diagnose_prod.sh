#!/bin/bash
# Read-only crawl of the staff portal as the built-in admin, to reproduce a server-side exception.
# A 10-minute token is minted inside the API container and never printed. Output is email-masked.
cat /home/ubuntu/muktasabat/.last_deployed_sha
TOK=$(docker exec -i muktasabat-api-1 python - <<'PY'
from sqlalchemy import select
from api.database import SessionLocal
from api.models import User
from api.security import create_token
with SessionLocal() as db:
    u = db.scalar(select(User).where(User.username == "admin")) or db.scalar(select(User).where(User.role == "admin"))
    print(create_token(u.id, "access"))
PY
)
for loc in ar en; do for p in dashboard properties owners tenants agents contracts management-contracts payments expenses users owner-access data-management website website/leads website/applications website/settings website/listings website/services website/projects website/posts website/jobs website/testimonials website/partners; do
  body=$(curl -s -b "mk_access=$TOK" -w '\n%{http_code}' "http://127.0.0.1:3000/$loc/$p")
  code=$(echo "$body" | tail -1); flag=$(echo "$body" | grep -q "Application error\|server-side exception" && echo APP-ERROR || echo ok)
  [ "$code" != "200" -o "$flag" != "ok" ] && echo "$code $flag /$loc/$p"
done; done
echo "--- crawl done ---"
docker logs muktasabat-web-1 --since 5m 2>&1 | grep -v "^\s*$" | grep -B2 -A30 -iE "error|digest" | head -120
echo "--- api 5xx / tracebacks (5m) ---"
docker logs muktasabat-api-1 --since 5m 2>&1 | grep -E 'Traceback|"level": "ERROR"| 500 ' | head -20
docker logs muktasabat-api-1 --since 5m 2>&1 | grep -A25 Traceback | head -80
