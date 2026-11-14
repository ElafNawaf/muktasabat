#!/bin/bash
# Read-only SES investigation. Output is email-masked by the workflow.
docker exec -i muktasabat-api-1 python - <<'PY'
import boto3, json
from api.config import get_settings
s = get_settings()
print("SES region:", s.ses_region, "| from:", s.ses_from_email)
v2 = boto3.client("sesv2", region_name=s.ses_region)
try:
    a = v2.get_account()
    print("ProductionAccessEnabled:", a.get("ProductionAccessEnabled"))
    print("SendingEnabled:", a.get("SendingEnabled"), "| EnforcementStatus:", a.get("EnforcementStatus"))
    print("SendQuota:", a.get("SendQuota"))
    d = a.get("Details") or {}
    print("Production-access request:", json.dumps(d.get("ReviewDetails") or {}, default=str), "| MailType:", d.get("MailType"))
except Exception as e:
    print("get_account error:", type(e).__name__, str(e)[:200])
try:
    ids = v2.list_email_identities(PageSize=50)["EmailIdentities"]
    for i in ids:
        print("identity:", i["IdentityType"], i["IdentityName"], "| sending:", i.get("SendingEnabled"), "| status:", i.get("VerificationStatus"))
except Exception as e:
    print("list identities error:", type(e).__name__, str(e)[:200])
PY
echo "--- recent send results (last 6h) ---"
docker logs muktasabat-api-1 --since 6h 2>&1 | grep -oE '"message": "(Sent email|Failed to send email)[^"]*"' | sort | uniq -c
docker logs muktasabat-api-1 --since 6h 2>&1 | grep -oE 'MessageRejected[^"]{0,160}' | sed -E 's/identities failed the check in region [A-Z0-9-]+: .*/identities failed the check (recipient not verified)/' | sort | uniq -c
