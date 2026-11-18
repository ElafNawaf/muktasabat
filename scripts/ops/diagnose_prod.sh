#!/usr/bin/env bash
# Capture why the API hangs (DB sessions, threads), then restart it. Public-safe output.
set -u
echo "== DB sessions (from api container, 10s timeout)"
timeout 20 docker exec -i muktasabat-api-1 python - <<'PY' 2>&1 | cut -c1-200
import os, sqlalchemy as sa
e = sa.create_engine(os.environ["DATABASE_URL"], connect_args={"connect_timeout": 8})
with e.connect() as c:
    for r in c.execute(sa.text("select state, wait_event_type, wait_event, count(*), max(now()-state_change) from pg_stat_activity where datname=current_database() group by 1,2,3 order by 4 desc")):
        print(" ", tuple(r))
    for r in c.execute(sa.text("select pid, state, now()-query_start as age, left(regexp_replace(query, '\\s+', ' ', 'g'), 90) from pg_stat_activity where datname=current_database() and state <> 'idle' and pid <> pg_backend_pid() order by age desc limit 8")):
        print("  active:", tuple(r))
    for r in c.execute(sa.text("select count(*) from pg_locks where not granted")):
        print("  waiting locks:", r[0])
PY
echo "== api process"; docker exec muktasabat-api-1 sh -c 'ps -o pid,stat,rss,etime,args 2>/dev/null || ps aux' | cut -c1-150
echo "== threads"; docker exec muktasabat-api-1 sh -c 'ls /proc/1/task | wc -l; for t in /proc/1/task/*; do cat $t/wchan; echo; done | sort | uniq -c | sort -rn | head'
echo "== last api log lines before hang"; docker logs --since 40m muktasabat-api-1 2>&1 | grep -v '"path": "/api/v1/auth/me"' | tail -8 | sed -E 's/[0-9]{1,3}(\.[0-9]{1,3}){3}/<ip>/g; s/"ua": "[^"]*"//' | cut -c1-230
echo "== restart api"; docker restart muktasabat-api-1 >/dev/null; sleep 25
for u in https://muktasabat.com/ar https://muktasabat.com/ar/login https://muktasabat.com/en; do curl -sk -o /dev/null -m 40 -w "$u -> %{http_code} %{time_total}s\n" "$u"; done
free -m | sed -n 2,3p
