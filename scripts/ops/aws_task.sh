#!/usr/bin/env bash
# Phase C2: copy the live DB into RDS from the Lightsail host (it reaches both via peering).
# Credentials go to the host over SSH stdin only; nothing secret is printed.
set -euo pipefail
out() { aws cloudformation describe-stacks --stack-name muktasabat --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
DBHOST=$(out DbHost); DBSEC=$(out DbSecretArn)
LEGACY=$(aws secretsmanager get-secret-value --secret-id muktasabat/app --query SecretString --output text | python3 -c 'import json,sys;print(json.load(sys.stdin)["LEGACY_DATABASE_URL"])')
NEW=$(aws secretsmanager get-secret-value --secret-id "$DBSEC" --query SecretString --output text | python3 -c "import json,sys;d=json.load(sys.stdin);print(f\"postgresql://{d['username']}:{d['password']}@$DBHOST:5432/muktasabat?sslmode=require\")")
echo "::add-mask::$LEGACY"; echo "::add-mask::$NEW"
mkdir -p ~/.ssh; printf '%s\n' "$LIGHTSAIL_SSH_KEY" > ~/.ssh/k; chmod 600 ~/.ssh/k
ssh-keyscan -T 20 -H 13.232.25.224 >> ~/.ssh/known_hosts 2>/dev/null
{ printf 'LEGACY=%q\nNEW=%q\n' "$LEGACY" "$NEW"; cat <<'REMOTE'
set -euo pipefail
echo "== reach RDS from host"; timeout 8 bash -c "</dev/tcp/${NEW#*@}" 2>/dev/null; H=$(echo "$NEW" | sed -E 's#.*@([^:/]+):.*#\1#'); timeout 8 bash -c "</dev/tcp/$H/5432" && echo reachable
docker run --rm -i --network host -e LEGACY="$LEGACY" -e NEW="$NEW" public.ecr.aws/docker/library/postgres:17-alpine sh -s <<'IN'
set -e
pg_dump --no-owner --no-privileges -Fc "$LEGACY" -f /tmp/d.dump; echo "dump_ok $(du -h /tmp/d.dump | cut -f1)"
psql -q "$NEW" -c 'drop schema public cascade' -c 'create schema public'
pg_restore --no-owner --no-privileges -d "$NEW" /tmp/d.dump && echo restore_ok || echo restore_with_warnings
for tb in users buildings units contracts payments tenants owners expenses hr_profiles hr_attendance hr_contracts support_tickets payroll_runs; do
  a=$(psql -tA "$LEGACY" -c "select count(*) from $tb" 2>/dev/null || echo -); b=$(psql -tA "$NEW" -c "select count(*) from $tb" 2>/dev/null || echo -); echo "count $tb old=$a new=$b"
done
echo "tables old=$(psql -tA "$LEGACY" -c "select count(*) from information_schema.tables where table_schema='public'") new=$(psql -tA "$NEW" -c "select count(*) from information_schema.tables where table_schema='public'")"
echo "seq check: $(psql -tA "$NEW" -c "select count(*) from pg_sequences where schemaname='public'") sequences"
IN
REMOTE
} | ssh -o ConnectTimeout=30 -i ~/.ssh/k ubuntu@13.232.25.224 'bash -s' 2>&1 | grep -vE "^pg_restore: (warning|from TOC)" | sed -E 's#postgresql://[^ ]*#<url>#g'
echo "== restart the test container on the copied data"
aws ecs update-service --cluster muktasabat --service muktasabat --force-new-deployment --query 'service.serviceName' --output text
aws ecs wait services-stable --cluster muktasabat --services muktasabat
for u in /ar/login /en; do curl -s -o /dev/null -m 30 -w "new.muktasabat.com$u -> %{http_code} %{time_total}s\n" "https://new.muktasabat.com$u"; done
