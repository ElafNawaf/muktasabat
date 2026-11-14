#!/bin/bash
# Read-only: check the insights dashboard and key pages on real data. Output email-masked; no personal data printed.
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
curl -s -H "Authorization: Bearer $TOK" "http://127.0.0.1:8000/api/v1/analytics/insights?locale=ar" -o /tmp/ins.json -w "insights HTTP %{http_code}\n"
python3 -c "import json;d=json.load(open('/tmp/ins.json'));k=d.get('kpis',{});print('kpis:',{x:k.get(x) for x in ['units','occupancy','collection_rate','overdue_count','expiring_90','buildings']});print('alerts:',len(d.get('alerts',[])),'buildings:',len(d.get('buildings',[])))" 2>&1 | head -3
rm -f /tmp/ins.json
docker exec -i muktasabat-api-1 python - <<'PY'
from sqlalchemy import select
from api.database import SessionLocal
from api.models import Role
with SessionLocal() as db:
    for r in db.scalars(select(Role)).all():
        p = r.permissions or {}
        print("role", r.code, "| modules:", len(p), "| new:", {m: (p.get(m) or {}).get("view") for m in ["dashboard","management_contracts","owner_portal","company","data"]})
PY
for p in dashboard properties payments management-contracts owner-access website/texts users; do
  body=$(curl -s -b "mk_access=$TOK" -w '\n%{http_code}' "http://127.0.0.1:3000/ar/$p"); code=$(echo "$body" | tail -1)
  echo "$code $(echo "$body" | grep -q 'تعذّر عرض هذه الصفحة\|Application error' && echo ERROR-PAGE || echo ok) /ar/$p"
done
docker logs muktasabat-api-1 --since 10m 2>&1 | grep -c Traceback
