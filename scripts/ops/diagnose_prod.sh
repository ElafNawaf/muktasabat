#!/usr/bin/env bash
# Read-only verification after the pool fix. Public-safe output.
set -u
docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
echo "== pages"; for u in https://muktasabat.com/ar https://muktasabat.com/ar/login https://muktasabat.com/en https://muktasabat.com/ar/dashboard; do curl -sk -o /dev/null -m 30 -w "$u -> %{http_code} %{time_total}s\n" "$u"; done
echo "== burst: 60 parallel public page loads"
seq 60 | xargs -P 30 -I{} curl -sk -o /dev/null -m 40 -w "%{http_code}\n" https://muktasabat.com/ar | sort | uniq -c
echo "== DB sessions after burst"
timeout 25 docker exec -i muktasabat-api-1 python - <<'PY' 2>&1 | cut -c1-160
import os, sqlalchemy as sa
e = sa.create_engine(os.environ["DATABASE_URL"])
with e.connect() as c:
    for r in c.execute(sa.text("select state, count(*), max(now()-state_change) from pg_stat_activity where datname=current_database() group by 1")): print(" ", tuple(r))
    print("  timeouts:", c.execute(sa.text("show idle_in_transaction_session_timeout")).scalar(), c.execute(sa.text("show statement_timeout")).scalar(), "(this probe connection uses defaults)")
PY
free -m | sed -n 2,3p
