#!/usr/bin/env bash
# Phase A: registry + images + secrets + Lightsail peering + template check.
# Prints names/ARNs only — never secret values.
set -euo pipefail
R=ap-south-1; ACCT=$(aws sts get-caller-identity --query Account --output text)
REG=$ACCT.dkr.ecr.$R.amazonaws.com
TAG=$(git rev-parse --short HEAD)

echo "== ECR"
for r in muktasabat-api muktasabat-web; do
  aws ecr describe-repositories --repository-names $r >/dev/null 2>&1 || aws ecr create-repository --repository-name $r --image-scanning-configuration scanOnPush=true --query repository.repositoryName --output text
  aws ecr put-lifecycle-policy --repository-name $r --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"keep 15","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":15},"action":{"type":"expire"}}]}' >/dev/null
done
aws ecr get-login-password | docker login --username AWS --password-stdin $REG >/dev/null

echo "== build + push ($TAG)"
docker build -q -t $REG/muktasabat-api:$TAG . >/dev/null
docker build -q --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY="${TURNSTILE_SITE_KEY:-}" -t $REG/muktasabat-web:$TAG -f web/Dockerfile web/ >/dev/null
docker push -q $REG/muktasabat-api:$TAG; docker push -q $REG/muktasabat-web:$TAG

echo "== app secret from the live server (values never printed)"
mkdir -p ~/.ssh; printf '%s\n' "$LIGHTSAIL_SSH_KEY" > ~/.ssh/k; chmod 600 ~/.ssh/k
ssh-keyscan -T 20 -H 13.232.25.224 >> ~/.ssh/known_hosts 2>/dev/null
ssh -o ConnectTimeout=30 -i ~/.ssh/k ubuntu@13.232.25.224 'cat /home/ubuntu/muktasabat/.env' > /tmp/live.env
python3 - <<'PY' > /tmp/app.json
import json
env = {}
for line in open("/tmp/live.env"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line: continue
    k, v = line.split("=", 1); env[k] = v.strip().strip('"').strip("'")
keep = ["SECRET_KEY","REVALIDATE_SECRET","SES_FROM_EMAIL","SUPPORT_EMAIL","PAYMENT_ALERTS_CC","LEGACY_DATABASE_URL"]
env["LEGACY_DATABASE_URL"] = env.get("DATABASE_URL","")
out = {k: env.get(k, "") for k in keep}
print(json.dumps(out))
import sys; print("keys:", {k: bool(v) for k, v in out.items()}, file=sys.stderr)
PY
if aws secretsmanager describe-secret --secret-id muktasabat/app >/dev/null 2>&1; then
  aws secretsmanager put-secret-value --secret-id muktasabat/app --secret-string file:///tmp/app.json --query Name --output text
else
  aws secretsmanager create-secret --name muktasabat/app --secret-string file:///tmp/app.json --query Name --output text
fi
shred -u /tmp/live.env /tmp/app.json
echo "== web container env keys on the server"
ssh -i ~/.ssh/k ubuntu@13.232.25.224 'docker inspect muktasabat-web-1 --format "{{range .Config.Env}}{{println .}}{{end}}" | cut -d= -f1 | sort | tr "\n" " "'; echo

echo "== Lightsail VPC peering"
aws lightsail is-vpc-peered --query isPeered --output text | grep -q True || aws lightsail peer-vpc --query operation.status --output text
echo "== template"
aws cloudformation validate-template --template-body file://infra/aws/stack.yml --query 'Parameters[].ParameterKey' --output text
echo "TAG=$TAG"
