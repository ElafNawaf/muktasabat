#!/usr/bin/env bash
# Deploy the public website + CMS release to muktasabat.com.
#
# Follows docs/DEPLOY.md exactly (build locally for linux/amd64, scp, load,
# swap tags, smoke test, then marker). Run from the repo root on your Mac:
#
#   ./scripts/deploy_website.sh            # build + ship api and web
#   DRY_RUN=1 ./scripts/deploy_website.sh  # print what would happen
#
# Rollback: the script prints the exact command if the smoke test fails.
set -euo pipefail

KEY="${KEY:-$HOME/.ssh/lightsail_apsouth1_default.pem}"
HOST="${HOST:-ubuntu@13.232.25.224}"
RUNTIME=/home/ubuntu/muktasabat
SSH="ssh -i $KEY -o ConnectTimeout=15 $HOST"
run() { if [ "${DRY_RUN:-0}" = 1 ]; then echo "DRY: $*"; else eval "$@"; fi; }

echo "▸ Preflight"
[ -f api/routers/cms.py ] && [ -d "web/src/app/[locale]/(site)" ] || { echo "Run from the repo root."; exit 1; }
HEAD_SHA=$(git rev-parse HEAD)
git diff --quiet && git diff --cached --quiet || { echo "Uncommitted changes — commit first so the marker means something."; exit 1; }
LAST_SHA=$($SSH "cat $RUNTIME/.last_deployed_sha")
echo "  prod: $LAST_SHA → deploying: $HEAD_SHA"

CUR_API=$($SSH "grep 'image: muktasabat-api:' $RUNTIME/docker-compose.yml | sed -E 's/.*v([0-9]+).*/\1/'")
CUR_WEB=$($SSH "grep 'image: muktasabat-web:' $RUNTIME/docker-compose.yml | sed -E 's/.*v([0-9]+).*/\1/'")
NEW_API=$((CUR_API + 1)); NEW_WEB=$((CUR_WEB + 1))
echo "  api v$CUR_API → v$NEW_API   web v$CUR_WEB → v$NEW_WEB"

echo "▸ Revalidate secret (lets us refresh the site cache right after deploy)"
SECRET=$($SSH "grep -E '^REVALIDATE_SECRET=' $RUNTIME/.env | cut -d= -f2-" || true)
if [ -z "$SECRET" ]; then
  SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
  run "$SSH \"echo 'REVALIDATE_SECRET=$SECRET' >> $RUNTIME/.env\""
  echo "  added REVALIDATE_SECRET to $RUNTIME/.env"
fi
if ! $SSH "grep -q REVALIDATE_SECRET $RUNTIME/docker-compose.yml"; then
  echo "  ⚠ The runtime web service does not pass REVALIDATE_SECRET yet."
  echo "    Add under services.web.environment in $RUNTIME/docker-compose.yml:"
  echo "        REVALIDATE_SECRET: \${REVALIDATE_SECRET}"
  echo "    (Without it the site still works; content just appears within ~5 minutes.)"
fi

echo "▸ Build locally (linux/amd64) — never on the instance"
run "docker buildx build --platform linux/amd64 -t muktasabat-api:v$NEW_API --load ."
run "docker buildx build --platform linux/amd64 ${NEXT_PUBLIC_TURNSTILE_SITE_KEY:+--build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY} -t muktasabat-web:v$NEW_WEB --load -f web/Dockerfile web/"
run "docker save muktasabat-api:v$NEW_API | gzip -1 > /tmp/api-v$NEW_API.tar.gz"
run "docker save muktasabat-web:v$NEW_WEB | gzip -1 > /tmp/web-v$NEW_WEB.tar.gz"

echo "▸ Ship + swap"
run "scp -i $KEY /tmp/api-v$NEW_API.tar.gz /tmp/web-v$NEW_WEB.tar.gz $HOST:/home/ubuntu/"
run "$SSH \"set -e
  gunzip -c /home/ubuntu/api-v$NEW_API.tar.gz | docker load
  gunzip -c /home/ubuntu/web-v$NEW_WEB.tar.gz | docker load
  sed -i 's|muktasabat-api:v$CUR_API|muktasabat-api:v$NEW_API|; s|muktasabat-web:v$CUR_WEB|muktasabat-web:v$NEW_WEB|' $RUNTIME/docker-compose.yml
  cd $RUNTIME && docker compose up -d
  rm -f /home/ubuntu/api-v$NEW_API.tar.gz /home/ubuntu/web-v$NEW_WEB.tar.gz\""
run "rm -f /tmp/api-v$NEW_API.tar.gz /tmp/web-v$NEW_WEB.tar.gz"
[ "${DRY_RUN:-0}" = 1 ] && exit 0
sleep 10

echo "▸ Refresh site cache"
curl -sS -X POST -H "x-revalidate-secret: $SECRET" https://muktasabat.com/api/site/revalidate || true; echo

echo "▸ Smoke test"
FAIL=0
for p in /en/login /ar/login /en/dashboard /ar /en /ar/services /ar/projects /ar/contact /sitemap.xml /robots.txt; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "https://muktasabat.com$p")
  printf "  %-16s %s\n" "$p" "$code"
  [ "$code" = 200 ] || FAIL=1
done
if curl -sS https://muktasabat.com/ar | grep -q 'mk-hero'; then echo "  homepage renders CMS content: yes"; else echo "  homepage renders CMS content: NO"; FAIL=1; fi
ERRS=$($SSH "docker logs muktasabat-api-1 --since 2m 2>&1 | grep -iE 'ERROR|Traceback|startup failed' | head -3" || true)
[ -z "$ERRS" ] || { echo "  API errors:"; echo "$ERRS"; FAIL=1; }

if [ $FAIL = 1 ]; then
  echo "✗ Smoke test FAILED — roll back with:"
  echo "  $SSH \"sed -i 's|muktasabat-api:v$NEW_API|muktasabat-api:v$CUR_API|; s|muktasabat-web:v$NEW_WEB|muktasabat-web:v$CUR_WEB|' $RUNTIME/docker-compose.yml && cd $RUNTIME && docker compose up -d\""
  exit 1
fi

$SSH "echo $HEAD_SHA > $RUNTIME/.last_deployed_sha"
echo "✓ Deployed $HEAD_SHA (api v$NEW_API, web v$NEW_WEB). Marker updated."
