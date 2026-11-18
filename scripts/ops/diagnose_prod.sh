#!/usr/bin/env bash
# Read-only: role/permission edit requests and their timing (last 6h). Public-safe.
set -u
docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
echo "== role-related API requests (6h)"
docker logs --since 6h muktasabat-api-1 2>&1 | grep -E '"/api/v1/(roles|auth/admin/users|permissions|workflows)' | python3 -c '
import sys, json
for line in sys.stdin:
    try: j = json.loads(line)
    except Exception: continue
    print(j.get("ts","")[11:19], j.get("method"), j.get("path"), j.get("status"), j.get("duration_ms"), j.get("error_type") or "")
' | tail -40
echo "== slow requests > 5s (6h)"
docker logs --since 6h muktasabat-api-1 2>&1 | python3 -c '
import sys, json
for line in sys.stdin:
    try: j = json.loads(line)
    except Exception: continue
    d = j.get("duration_ms") or 0
    if d > 5000: print(j.get("ts","")[11:19], j.get("method"), j.get("path"), j.get("status"), d)
' | tail -20
echo "== web errors (6h)"; docker logs --since 6h muktasabat-web-1 2>&1 | grep -iE "error|fail|timeout" | grep -v "^\s*at " | tail -15 | cut -c1-200
