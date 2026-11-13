#!/bin/bash
# Pass 2 — email send test (SES mailbox simulator only), S3 detail, admin password check (boolean only).
docker exec -i muktasabat-api-1 python - <<'PY'
import os
import boto3
r=os.environ["SES_REGION"]; frm=os.environ["SES_FROM_EMAIL"]
ses=boto3.client("ses", region_name=r)
try:
    q=ses.get_send_quota(); print("ses quota:", q.get("Max24HourSend"), "(200 = sandbox)", "sent24h:", q.get("SentLast24Hours"))
except Exception as e: print("ses quota:", str(e)[:150])
try:
    m=ses.send_email(Source=frm, Destination={"ToAddresses":["success@simulator.amazonses.com"]}, Message={"Subject":{"Data":"Muktasabat SES test"},"Body":{"Text":{"Data":"test"}}})
    print("ses send to simulator: OK", m["MessageId"][:12])
except Exception as e: print("ses send:", type(e).__name__, str(e)[:300])
try:
    ses.send_email(Source=frm, Destination={"ToAddresses":["bounce@simulator.amazonses.com"]}, Message={"Subject":{"Data":"t"},"Body":{"Text":{"Data":"t"}}}); print("ses send to 2nd simulator: OK")
except Exception as e: print("ses send2:", str(e)[:200])
s3=boto3.client("s3", region_name=os.environ.get("S3_REGION"))
b=os.environ["S3_BUCKET"]
for op,fn in [("list_buckets",lambda: [x["Name"] for x in s3.list_buckets()["Buckets"]]),("get_bucket_location",lambda: s3.get_bucket_location(Bucket=b)),("put_object",lambda: s3.put_object(Bucket=b,Key="diag/x.txt",Body=b"x"))]:
    try: print("s3", op, ":", fn())
    except Exception as e: print("s3", op, ":", type(e).__name__, str(e)[:250])
iam=boto3.client("iam")
try: print("iam attached:", [p["PolicyName"] for p in iam.list_attached_user_policies(UserName="muktasabat-app")["AttachedPolicies"]])
except Exception as e: print("iam:", str(e)[:120])
PY
docker exec -i muktasabat-api-1 python - <<'PY'
from sqlalchemy import select
from api.database import SessionLocal
from api.models import User
with SessionLocal() as db:
    for u in db.scalars(select(User)).all():
        print("user", u.id, "role", u.role, "default_admin_password:", u.check_password("admin123"), "verified:", u.email_verified)
PY
