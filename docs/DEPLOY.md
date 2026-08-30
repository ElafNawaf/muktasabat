# Production Deployment Runbook

Everything needed to deploy, monitor, and recover the Muktasabat production
stack on AWS Lightsail (Mumbai). Read the **safe deploy workflow** in §4
before shipping anything.

---

## 1. Infrastructure

| Component | Value |
|---|---|
| **Domain** | https://muktasabat.com (Let's Encrypt via Caddy, auto-renew) |
| **Instance** | Lightsail `micro_3_1` — Ubuntu 24.04, 1 GB RAM, 2 vCPU, 40 GB SSD |
| **Instance IP** | `13.232.25.224` |
| **Region** | `ap-south-1` (Mumbai) |
| **Database** | Lightsail Managed Postgres 17.9, `micro_2_0`, VPC-only |
| **DB endpoint** | `ls-4be37065311e3fa1ded154817bfbf25e8399642f.ch688o2uy8jc.ap-south-1.rds.amazonaws.com:5432` |
| **DB name / user** | `muktasabat` / `muktasabat_admin` (password in `/home/ubuntu/muktasabat/.env` as `DATABASE_URL`) |
| **AWS account** | `587257569063` |
| **Deploy marker** | `/home/ubuntu/muktasabat/.last_deployed_sha` |

Current image tags live in `/home/ubuntu/muktasabat/docker-compose.yml`.
Check with:

```bash
ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
    'grep "image: muktasabat" /home/ubuntu/muktasabat/docker-compose.yml'
```

---

## 2. Access

```bash
# SSH into the instance
ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224

# Postgres via DataGrip / psql (DB is VPC-only, tunnel required)
ssh -i ~/.ssh/lightsail_apsouth1_default.pem -N \
    -L 5436:ls-4be37065311e3fa1ded154817bfbf25e8399642f.ch688o2uy8jc.ap-south-1.rds.amazonaws.com:5432 \
    ubuntu@13.232.25.224
# Then connect any Postgres client to 127.0.0.1:5436
```

The `muktasabat-app` IAM user only has SES + Translate permissions —
Lightsail actions (reboot, get-instance, etc.) require the root account
via the AWS Console.

---

## 3. Directory layout on the instance

```
/home/ubuntu/muktasabat/           ← RUNTIME (edit this to change what's running)
├── docker-compose.yml             ← versioned tags: image: muktasabat-api:vN
├── .env                           ← DATABASE_URL, SECRET_KEY, SES creds, etc.
└── .last_deployed_sha             ← git SHA currently in production

/home/ubuntu/muktasabat-src/       ← SOURCE (git checkout, used for migrations)
├── .git/
├── api/  web/  migrations/  scripts/  …
```

Two folders, two purposes. Never edit `docker-compose.yml` in the source
clone — that one is the repo default with `build:` directives; the
runtime one has pinned image tags.

---

## 4. The safe deploy workflow

**Rule #1** — Never `docker build` on the instance for web. It has 911 MB
of RAM; the Next.js build OOMs the entire box (this has happened).

**Rule #2** — Always build in a machine with ≥ 4 GB RAM (your laptop or CI),
then scp the tarball.

**Rule #3** — Update the marker file only after the smoke test passes.

### Step-by-step

```bash
# ─── ON YOUR LAPTOP ─────────────────────────────────────────

# 0. Make sure master is what you want to deploy
git checkout master && git pull origin master
HEAD_SHA=$(git rev-parse HEAD)
echo "Deploying: $HEAD_SHA"

# 1. Figure out what changed since the last prod deploy
LAST_SHA=$(ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
           'cat /home/ubuntu/muktasabat/.last_deployed_sha')
git diff --name-only $LAST_SHA..$HEAD_SHA | awk -F/ '{print $1}' | sort -u
# Look at output — does it include api, web, migrations? Only build what changed.

# 2. Get the current + next version tags
CUR_API=$(ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
          'grep "image: muktasabat-api:" /home/ubuntu/muktasabat/docker-compose.yml | sed -E "s/.*v([0-9]+).*/\1/"')
CUR_WEB=$(ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
          'grep "image: muktasabat-web:" /home/ubuntu/muktasabat/docker-compose.yml | sed -E "s/.*v([0-9]+).*/\1/"')
NEW_API=$((CUR_API+1)); NEW_WEB=$((CUR_WEB+1))
echo "api: v$CUR_API → v$NEW_API"
echo "web: v$CUR_WEB → v$NEW_WEB"

# 3. Build for linux/amd64 (Lightsail is x86_64; Apple Silicon is arm64)
docker buildx build --platform linux/amd64 -t muktasabat-api:v$NEW_API --load .
docker buildx build --platform linux/amd64 -t muktasabat-web:v$NEW_WEB --load -f web/Dockerfile web/

# 4. Save + ship
docker save muktasabat-api:v$NEW_API | gzip -1 > /tmp/api-v$NEW_API.tar.gz
docker save muktasabat-web:v$NEW_WEB | gzip -1 > /tmp/web-v$NEW_WEB.tar.gz
scp -i ~/.ssh/lightsail_apsouth1_default.pem \
    /tmp/api-v$NEW_API.tar.gz /tmp/web-v$NEW_WEB.tar.gz \
    ubuntu@13.232.25.224:/home/ubuntu/

# 5. Load, swap, restart
ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 "
set -e
gunzip -c /home/ubuntu/api-v$NEW_API.tar.gz | docker load
gunzip -c /home/ubuntu/web-v$NEW_WEB.tar.gz | docker load
sed -i 's|muktasabat-api:v$CUR_API|muktasabat-api:v$NEW_API|; s|muktasabat-web:v$CUR_WEB|muktasabat-web:v$NEW_WEB|' \
    /home/ubuntu/muktasabat/docker-compose.yml
cd /home/ubuntu/muktasabat && docker compose up -d
sleep 5
docker compose ps
rm /home/ubuntu/api-v$NEW_API.tar.gz /home/ubuntu/web-v$NEW_WEB.tar.gz
"

# 6. SMOKE TEST — all three must return 200
curl -sS -o /dev/null -w "/en/login     %{http_code}\n" https://muktasabat.com/en/login
curl -sS -o /dev/null -w "/ar/login     %{http_code}\n" https://muktasabat.com/ar/login
curl -sS -o /dev/null -w "/en/dashboard %{http_code}\n" https://muktasabat.com/en/dashboard

# API must NOT be crash-looping — no "Application startup failed" in logs
ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
    'docker logs muktasabat-api-1 --since 2m 2>&1 | grep -iE "ERROR|Traceback|startup failed" | head -3'
# Empty output = healthy. If not empty → ROLL BACK (§5) and diagnose.

# 7. Only after smoke passes: update the marker
ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
    "echo $HEAD_SHA > /home/ubuntu/muktasabat/.last_deployed_sha"

# 8. Cleanup local tarballs
rm -f /tmp/api-v$NEW_API.tar.gz /tmp/web-v$NEW_WEB.tar.gz
```

---

## 5. Rollback (when smoke test fails)

```bash
# Revert the tags to the previous version
ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 "
sed -i 's|muktasabat-api:v$NEW_API|muktasabat-api:v$CUR_API|; s|muktasabat-web:v$NEW_WEB|muktasabat-web:v$CUR_WEB|' \
    /home/ubuntu/muktasabat/docker-compose.yml
cd /home/ubuntu/muktasabat && docker compose up -d
docker compose ps
"

# If you already updated the marker file, revert it too:
ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
    "echo $LAST_SHA > /home/ubuntu/muktasabat/.last_deployed_sha"
```

Old images stay on disk (nothing in this doc prunes them) — rollback is
instant. Run `docker image prune -a` only after a deploy has been stable
for a few days.

---

## 6. Migrations

If `git diff $LAST_SHA..$HEAD_SHA -- migrations/` shows new `.sql` files,
apply them **before** flipping the api tag:

```bash
NEW_MIGS=$(ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
           "cd /home/ubuntu/muktasabat-src && git fetch origin master && git reset --hard origin/master && git diff --name-only $LAST_SHA..HEAD -- migrations/ | sort")

for f in $NEW_MIGS; do
  echo "Applying $f"
  ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 \
      "cd /home/ubuntu/muktasabat-src && set -a && . /home/ubuntu/muktasabat/.env && set +a && psql \"\$DATABASE_URL\" -f $f"
done
```

Many "migrations" also happen inline via `api/database.py` at startup
(the `ensure_*_columns` functions). These have no SQL file but run every
boot. **They must be tested against Postgres, not just SQLite** — the
`ROUND(double, int)` bug was exactly this class.

---

## 7. When production is DOWN

Symptoms: HTTPS times out, SSH times out, ICMP unreachable. The instance
is hung (usually OOM from a runaway build or memory spike).

**Only fix**: reboot from the Lightsail console — the CLI IAM user does
not have `lightsail:RebootInstance`:

1. Open https://lightsail.aws.amazon.com/ls/webapp/ap-south-1/instances
2. Find `muktasabat` instance → **⋮** → **Reboot**
3. Wait ~60–90 s

Containers auto-restart because `restart: unless-stopped` is set in
`docker-compose.yml`. Site should be back once Docker is up.

---

## 8. Health checks

```bash
# One-liner "is prod healthy"
curl -sS -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" https://muktasabat.com/en/login

# Full state
ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 '
  echo "=== Uptime ==="; uptime; free -h | head -2
  echo "=== Containers ==="; docker ps --format "{{.Names}} {{.Image}} {{.Status}}"
  echo "=== Marker ==="; cat /home/ubuntu/muktasabat/.last_deployed_sha
  echo "=== Recent api errors (10m) ==="
  docker logs muktasabat-api-1 --since 10m 2>&1 | grep -iE "ERROR|Traceback|startup failed" | head -3 || echo none
  echo "=== Recent web errors (10m) ==="
  docker logs muktasabat-web-1 --since 10m 2>&1 | grep -iE "MISSING_MESSAGE|Error:" | head -3 || echo none
'
```

Structured JSON access logs are emitted to `docker logs muktasabat-api-1`.
Filter by request path, status, or user_id using `jq` if the log volume
grows.

---

## 9. Cursor deploy automation

There is a Cursor Background Agent automation named "Muktasbat Deployment"
that triggers on push to `master`. Its prompt currently **builds on the
instance**, which will OOM the box for web. Do NOT enable it as-is.

Before turning it on:

- Rewrite the prompt to build locally and `scp` (same as §4), OR
- Cap Node memory during in-instance build with `NODE_OPTIONS=--max-old-space-size=512`

Until then, deploys are manual (§4). The `LIGHTSAIL_SSH_KEY` secret in
Cursor holds the contents of `~/.ssh/lightsail_apsouth1_default.pem` and
is required by the automation.

---

## 10. Recommended guardrails (not yet implemented)

Ranked by cost-to-value:

1. **CI check that boots api against real Postgres.** Free on GitHub Actions.
   Would catch every "works on SQLite, breaks on Postgres" bug at the PR
   stage. See prior planning discussion for the workflow YAML.
2. **Move Docker builds off the production instance permanently.** Either
   via the Cursor automation rewrite above, or via a GitHub Action that
   builds + pushes to a registry.
3. **Docker healthchecks on api + web** so a crash-looping new container
   isn't promoted over a working old one.
4. **Staging environment** on a second Lightsail nano (~$5/mo) that mirrors
   prod. Deploy there first, smoke-test, then promote by re-scp'ing the
   same tarballs to prod.

---

## Quick reference — copy-paste for a web-only deploy

```bash
# Replace v10 and v11 with the current and next web tags respectively.
HEAD_SHA=$(git rev-parse origin/master)
docker buildx build --platform linux/amd64 -t muktasabat-web:v11 --load -f web/Dockerfile web/
docker save muktasabat-web:v11 | gzip -1 > /tmp/web-v11.tar.gz
scp -i ~/.ssh/lightsail_apsouth1_default.pem /tmp/web-v11.tar.gz ubuntu@13.232.25.224:/home/ubuntu/
ssh -i ~/.ssh/lightsail_apsouth1_default.pem ubuntu@13.232.25.224 "
  gunzip -c /home/ubuntu/web-v11.tar.gz | docker load
  sed -i 's|muktasabat-web:v10|muktasabat-web:v11|' /home/ubuntu/muktasabat/docker-compose.yml
  cd /home/ubuntu/muktasabat && docker compose up -d
  echo $HEAD_SHA > /home/ubuntu/muktasabat/.last_deployed_sha
  rm /home/ubuntu/web-v11.tar.gz
"
curl -sS -o /dev/null -w "%{http_code}\n" https://muktasabat.com/en/login   # expect 200
rm /tmp/web-v11.tar.gz
```
