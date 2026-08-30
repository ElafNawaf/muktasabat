---
name: deploy-prod
description: Deploy the latest master to muktasabat.com production on AWS Lightsail
---

# Production Deploy Workflow

Full reference lives in `docs/DEPLOY.md`. This skill is the executable
short form — follow it end-to-end.

**Two rules that must not be broken:**
1. **Never `docker build` on the Lightsail instance.** It has 911 MB RAM
   and Next.js will OOM the entire box (no SSH, no HTTPS, needs a manual
   console reboot). Build on the local machine.
2. **Never update `.last_deployed_sha` before the smoke test passes.**
   The marker is the rollback anchor.

## Steps

1. **Ask me:** "Deploy the current `origin/master`, or a specific SHA?
   Any migration files (`migrations/*.sql`) I should apply as part of it?"

2. **Preflight — see what actually changed:**
   ```bash
   git fetch origin master
   HEAD_SHA=$(git rev-parse origin/master)
   LAST_SHA=$(ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
              'cat /home/ubuntu/muktasabat/.last_deployed_sha')
   echo "prod: $LAST_SHA → target: $HEAD_SHA"
   git diff --name-only $LAST_SHA..$HEAD_SHA | awk -F/ '{print $1}' | sort -u
   ```
   From the roots, decide `REBUILD_API` / `REBUILD_WEB` / `HAS_MIGRATIONS`.
   If none, stop and report "no rebuild needed."

3. **For any api-touching change, sanity-check startup migrations against
   Postgres.** Inline migrations in `api/database.py` (the `ensure_*_columns`
   functions) run on every boot. The v8 outage was `ROUND(double, int)` —
   Postgres only has `ROUND(numeric, int)`. Read the diff of
   `api/database.py`, scan for `text("...SQL...")` blocks, and if anything
   uses Float math + ROUND / integer division / dialect-specific SQL, flag
   it before building.

4. **Get current tags and pick next versions:**
   ```bash
   CUR_API=$(ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
             'grep "image: muktasabat-api:" /home/ubuntu/muktasabat/docker-compose.yml | sed -E "s/.*v([0-9]+).*/\1/"')
   CUR_WEB=$(ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
             'grep "image: muktasabat-web:" /home/ubuntu/muktasabat/docker-compose.yml | sed -E "s/.*v([0-9]+).*/\1/"')
   NEW_API=$((CUR_API+1)); NEW_WEB=$((CUR_WEB+1))
   ```

5. **Build LOCALLY for `linux/amd64`** (Lightsail is x86_64; Apple Silicon
   is arm64 — always pass `--platform linux/amd64`). Only build what changed.
   Sequential is fine; parallel is fine — both run on the local machine.
   ```bash
   [ "$REBUILD_API" = 1 ] && docker buildx build --platform linux/amd64 -t muktasabat-api:v$NEW_API --load .
   [ "$REBUILD_WEB" = 1 ] && docker buildx build --platform linux/amd64 -t muktasabat-web:v$NEW_WEB --load -f web/Dockerfile web/
   ```

6. **Apply SQL migrations FIRST** (before flipping tags), if any:
   ```bash
   for f in $(git diff --name-only $LAST_SHA..$HEAD_SHA -- migrations/ | sort); do
     ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
       "cd /home/ubuntu/muktasabat-src && git fetch origin master && git reset --hard origin/master && \
        set -a && . /home/ubuntu/muktasabat/.env && set +a && psql \"\$DATABASE_URL\" -f $f"
   done
   ```
   If any migration fails, STOP.

7. **Save, ship, load, swap, restart:**
   ```bash
   # Save + scp only what was rebuilt
   [ "$REBUILD_API" = 1 ] && docker save muktasabat-api:v$NEW_API | gzip -1 > /tmp/api-v$NEW_API.tar.gz
   [ "$REBUILD_WEB" = 1 ] && docker save muktasabat-web:v$NEW_WEB | gzip -1 > /tmp/web-v$NEW_WEB.tar.gz
   scp -i ~/.ssh/lightsail_apsouth1_default.pem /tmp/{api-v$NEW_API,web-v$NEW_WEB}.tar.gz \
       ubuntu@13.232.25.224:/home/ubuntu/ 2>/dev/null || true

   ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 "set -e
     [ -f /home/ubuntu/api-v$NEW_API.tar.gz ] && gunzip -c /home/ubuntu/api-v$NEW_API.tar.gz | docker load
     [ -f /home/ubuntu/web-v$NEW_WEB.tar.gz ] && gunzip -c /home/ubuntu/web-v$NEW_WEB.tar.gz | docker load
     [ '$REBUILD_API' = 1 ] && sed -i 's|muktasabat-api:v$CUR_API|muktasabat-api:v$NEW_API|' /home/ubuntu/muktasabat/docker-compose.yml
     [ '$REBUILD_WEB' = 1 ] && sed -i 's|muktasabat-web:v$CUR_WEB|muktasabat-web:v$NEW_WEB|' /home/ubuntu/muktasabat/docker-compose.yml
     cd /home/ubuntu/muktasabat && docker compose up -d
     sleep 5; docker compose ps
     rm -f /home/ubuntu/api-v$NEW_API.tar.gz /home/ubuntu/web-v$NEW_WEB.tar.gz
   "
   rm -f /tmp/api-v$NEW_API.tar.gz /tmp/web-v$NEW_WEB.tar.gz
   ```

8. **Smoke test — ALL must pass, no exceptions:**
   ```bash
   curl -sS -o /dev/null -w "/en/login     %{http_code}\n" https://muktasabat.com/en/login
   curl -sS -o /dev/null -w "/ar/login     %{http_code}\n" https://muktasabat.com/ar/login
   curl -sS -o /dev/null -w "/en/dashboard %{http_code}\n" https://muktasabat.com/en/dashboard
   ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
     'docker logs muktasabat-api-1 --since 2m 2>&1 | grep -iE "ERROR|Traceback|startup failed" | head -3'
   ```
   All three URLs must be 200 AND the log grep must be empty. If any fails,
   go to step 10 (rollback).

9. **Only after smoke passes: update the marker:**
   ```bash
   ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
     "echo $HEAD_SHA > /home/ubuntu/muktasabat/.last_deployed_sha"
   ```

10. **Rollback (smoke failure only):**
    ```bash
    ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 "
      [ '$REBUILD_API' = 1 ] && sed -i 's|muktasabat-api:v$NEW_API|muktasabat-api:v$CUR_API|' /home/ubuntu/muktasabat/docker-compose.yml
      [ '$REBUILD_WEB' = 1 ] && sed -i 's|muktasabat-web:v$NEW_WEB|muktasabat-web:v$CUR_WEB|' /home/ubuntu/muktasabat/docker-compose.yml
      cd /home/ubuntu/muktasabat && docker compose up -d && docker compose ps
    "
    ```
    Old images are always on disk. Then diagnose the failure and fix in a
    new commit before retrying — never redeploy the same broken tag.

11. **Report back:** From `$LAST_SHA` → `$HEAD_SHA`, which services rebuilt
    (with new tag numbers), which migrations applied, and the smoke-test
    outcome per URL.

## Instance is DOWN (site unreachable, SSH times out)

Almost always OOM. The IAM user can't reboot via API — user must click
Reboot in the Lightsail console at
https://lightsail.aws.amazon.com/ls/webapp/ap-south-1/instances → find
`muktasabat` → ⋮ → Reboot. Containers auto-restart. Then re-run this skill.
