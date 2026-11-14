#!/bin/bash
# Read-only: account/support/super-admin/email-log health. Prints names & status only; emails are masked by the workflow.
echo "deployed: $(cat /home/ubuntu/muktasabat/.last_deployed_sha)"
cd /home/ubuntu/muktasabat
echo "--- mail settings (set / empty) ---"
for k in SES_REGION SES_FROM_EMAIL WEB_BASE_URL SUPPORT_EMAIL PAYMENT_ALERTS_CC PAYMENT_ALERTS_ENABLED; do v=$(grep -E "^$k=" .env | cut -d= -f2-); [ -n "$v" ] && echo "$k=set${v:+ (${#v} chars)}" || echo "$k=EMPTY"; done
grep -E '^WEB_BASE_URL=' .env
docker exec -i muktasabat-api-1 python - <<'PY'
from datetime import datetime, timedelta
from sqlalchemy import select, func
from api.database import SessionLocal
from api.models import User, EmailLog
with SessionLocal() as db:
    print("--- admins ---")
    for u in db.scalars(select(User).where(User.role == "admin")).all():
        print(f"#{u.id} {u.username} active={u.is_active_user} super={u.is_super_admin} email={u.email} verified={u.email_verified} last_login={u.last_login_at}")
    print("super admins:", db.scalar(select(func.count()).select_from(User).where(User.is_super_admin.is_(True))))
    print("--- email log: totals (all time) ---")
    for st, n in db.execute(select(EmailLog.status, func.count()).group_by(EmailLog.status)).all():
        print(f"{st}: {n}")
    print("--- email log: failures by reason ---")
    for r, n in db.execute(select(EmailLog.error, func.count()).where(EmailLog.status=="failed").group_by(EmailLog.error)).all():
        print(f"{r}: {n}")
    print("--- email log: last 40 ---")
    for r in db.scalars(select(EmailLog).order_by(EmailLog.id.desc()).limit(40)).all():
        print(f"{r.created_at:%m-%d %H:%M} {r.category:<14} {r.status:<7} {r.error or '':<34} to={r.to_email} cc={r.cc_emails or ''} | {r.subject[:60]}")
PY
echo "--- SES account (sandbox / quota) ---"
docker exec -i muktasabat-api-1 python - <<'PY'
import os
try:
    import boto3
    c = boto3.client("sesv2", region_name=os.environ.get("SES_REGION"))
    a = c.get_account()
    print("production_access:", a.get("ProductionAccessEnabled"), "sending:", a.get("SendingEnabled"), "quota:", a.get("SendQuota"))
    ids = c.list_email_identities().get("EmailIdentities", [])
    print("verified identities:", [(i["IdentityName"], i.get("VerificationStatus")) for i in ids])
except Exception as e:
    print("SES check failed:", type(e).__name__, str(e)[:200])
PY
echo "--- crawl new pages as super admin (or admin) ---"
TOK=$(docker exec -i muktasabat-api-1 python - <<'PY'
from sqlalchemy import select
from api.database import SessionLocal
from api.models import User
from api.security import create_token
with SessionLocal() as db:
    u = db.scalar(select(User).where(User.is_super_admin.is_(True))) or db.scalar(select(User).where(User.username == "admin")) or db.scalar(select(User).where(User.role == "admin"))
    print(create_token(u.id, "access", version=u.token_version or 0))
PY
)
for loc in ar en; do for p in account "account?tab=security" "account?tab=preferences" support users email-log dashboard; do
  body=$(curl -s -b "mk_access=$TOK" -w '\n%{http_code}' "http://127.0.0.1:3000/$loc/$p")
  code=$(echo "$body" | tail -1); flag=$(echo "$body" | grep -q "Application error\|server-side exception" && echo APP-ERROR || echo ok)
  echo "$code $flag /$loc/$p"
done; done
echo "--- api errors (60m) ---"
docker logs muktasabat-api-1 --since 60m 2>&1 | grep -E 'Traceback|"level": "ERROR"' | head -20
docker logs muktasabat-api-1 --since 60m 2>&1 | grep -A20 Traceback | head -60
echo "--- web errors (60m) ---"
docker logs muktasabat-web-1 --since 60m 2>&1 | grep -iE "error|digest" | head -20
