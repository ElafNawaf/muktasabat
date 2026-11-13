#!/bin/bash
# Read-only production diagnostic. Prints names/booleans only, never secret values.
R=/home/ubuntu/muktasabat
echo "=== host ==="; uptime; free -m | head -2; df -h / | tail -1
echo "=== containers ==="; docker ps --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
echo "=== runtime compose (values of secret-looking keys redacted) ==="
sed -E 's/((KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL)[A-Z_]*[:=] *).*/\1<redacted>/I' $R/docker-compose.yml
echo "=== .env keys (names only) ==="; cut -d= -f1 $R/.env | grep -v '^#' | grep -v '^$'
echo "=== Caddy ==="; for f in /etc/caddy/Caddyfile $R/Caddyfile; do [ -f $f ] && { echo "-- $f"; cat $f; }; done; systemctl is-active caddy 2>/dev/null; docker ps --format '{{.Names}}' | grep -i caddy
echo "=== api env (names + empty/set) ==="
docker exec muktasabat-api-1 sh -c 'for v in SES_REGION SES_FROM_EMAIL SES_CONFIGURATION_SET WEB_BASE_URL S3_BUCKET S3_REGION S3_ENDPOINT_URL S3_PUBLIC_BASE_URL LOCAL_UPLOAD_DIR API_PUBLIC_BASE_URL AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION TRANSLATE_REGION DISABLE_BOOTSTRAP_ADMIN TURNSTILE_SECRET_KEY; do eval "x=\${$v}"; if [ -n "$x" ]; then case $v in SES_REGION|S3_REGION|TRANSLATE_REGION|AWS_DEFAULT_REGION|WEB_BASE_URL|S3_BUCKET|SES_FROM_EMAIL|LOCAL_UPLOAD_DIR|API_PUBLIC_BASE_URL|S3_PUBLIC_BASE_URL|DISABLE_BOOTSTRAP_ADMIN) echo "$v=$x";; *) echo "$v=<set>";; esac; else echo "$v=<EMPTY>"; fi; done'
echo "=== AWS checks from api container ==="
docker exec -i muktasabat-api-1 python - <<'PY'
import os, json
def p(*a): print(*a, flush=True)
try:
    import boto3
except Exception as e:
    p("boto3 import failed:", e); raise SystemExit
try:
    sts=boto3.client("sts", region_name=os.environ.get("SES_REGION") or "ap-south-1"); idn=sts.get_caller_identity(); p("identity:", idn["Arn"])
except Exception as e: p("sts:", type(e).__name__, str(e)[:200])
r=os.environ.get("SES_REGION")
if r:
    try:
        v2=boto3.client("sesv2", region_name=r); a=v2.get_account()
        p("ses production_access:", a.get("ProductionAccessEnabled"), "sending_enabled:", a.get("SendingEnabled"), "status:", a.get("EnforcementStatus"))
        q=a.get("SendQuota",{}); p("ses quota 24h:", q.get("Max24HourSend"), "sent:", q.get("SentLast24Hours"))
    except Exception as e: p("sesv2 get_account:", type(e).__name__, str(e)[:200])
    try:
        ses=boto3.client("ses", region_name=r); ids=ses.list_identities()["Identities"]
        st=ses.get_identity_verification_attributes(Identities=ids)["VerificationAttributes"] if ids else {}
        p("ses identities:", {k:v.get("VerificationStatus") for k,v in st.items()})
    except Exception as e: p("ses list_identities:", type(e).__name__, str(e)[:200])
b=os.environ.get("S3_BUCKET")
if b:
    try:
        s3=boto3.client("s3", region_name=os.environ.get("S3_REGION") or None, endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None)
        s3.head_bucket(Bucket=b); p("s3 head_bucket: OK")
        k="diag/healthcheck.txt"; s3.put_object(Bucket=b,Key=k,Body=b"ok"); p("s3 put: OK"); s3.delete_object(Bucket=b,Key=k); p("s3 delete: OK")
    except Exception as e: p("s3:", type(e).__name__, str(e)[:300])
else: p("s3: S3_BUCKET not set")
try:
    tr=boto3.client("translate", region_name=os.environ.get("TRANSLATE_REGION") or r or "us-east-1"); tr.translate_text(Text="hello",SourceLanguageCode="en",TargetLanguageCode="ar"); p("translate: OK")
except Exception as e: p("translate:", type(e).__name__, str(e)[:200])
PY
echo "=== local uploads dir in api container ==="; docker exec muktasabat-api-1 sh -c 'ls -la /app/uploads 2>&1 | head; du -sh /app/uploads 2>/dev/null'
echo "=== DB shape (counts only) ==="
docker exec -i muktasabat-api-1 python - <<'PY'
from sqlalchemy import text
from api.database import engine
with engine.connect() as c:
    for t in ["users","owners","owner_users","buildings","units","tenants","contracts","payments","expenses","management_contracts","roles","cms_leads","cms_site_settings"]:
        try: print(t, c.execute(text(f"select count(*) from {t}")).scalar())
        except Exception as e: print(t, "ERR", str(e)[:80]); c.rollback()
    try: print("users by role:", c.execute(text("select role,count(*) from users group by role")).all())
    except Exception as e: print(e)
    try: print("admin user exists:", c.execute(text("select count(*) from users where username='admin'")).scalar())
    except Exception as e: print(e)
    try: print("image urls sample:", c.execute(text("select url from unit_images limit 2")).all())
    except Exception as e: print("unit_images", str(e)[:80])
PY
echo "=== recent api errors ==="; docker logs muktasabat-api-1 --since 24h 2>&1 | grep -iE '"level": "(ERROR|WARNING)"|Traceback|ses|s3' | tail -25 | cut -c1-300
