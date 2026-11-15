#!/usr/bin/env bash
# Read-only health check: containers, resources, response times. Public-safe output (no personal data, no IPs).
set -u
strip() { sed -E 's/[0-9]{1,3}(\.[0-9]{1,3}){3}/<ip>/g; s/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/<email>/g; s/(token|password|secret|key)=[^ &"]*/\1=<redacted>/gI' | cut -c1-220; }
echo "== time"; date -u
echo "== uptime / load"; uptime
echo "== memory"; free -m
echo "== swap"; swapon --show 2>/dev/null || echo none
echo "== disk"; df -h / | tail -1
echo "== containers"; docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
echo "== restarts / OOM"; for c in $(docker ps -aq); do docker inspect "$c" --format '{{.Name}} restarts={{.RestartCount}} oom={{.State.OOMKilled}} started={{.State.StartedAt}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}'; done
echo "== container stats"; docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'
echo "== kernel OOM (last 24h)"; sudo journalctl -k --since "24 hours ago" 2>/dev/null | grep -ci "out of memory\|oom-kill" || true
echo "== response times (from the server)"
for u in "http://127.0.0.1:8000/api/docs" "http://127.0.0.1:3000/ar/login" "https://muktasabat.com/ar/login" "https://muktasabat.com/api/v1/auth/me"; do
  curl -sk -o /dev/null -m 30 -w "$u -> %{http_code} in %{time_total}s\n" "$u" || echo "$u -> failed"
done
echo "== login endpoint timing (bad credentials, expect 401)"
curl -sk -o /dev/null -m 30 -w "login -> %{http_code} in %{time_total}s\n" -X POST -d 'username=__healthcheck__&password=x' https://muktasabat.com/api/v1/auth/login || echo "login -> failed"
echo "== nginx/proxy"; systemctl is-active nginx 2>/dev/null; docker ps --format '{{.Names}}' | grep -i -E "nginx|caddy|proxy" || true
echo "== api log: error lines last 2h (count)"; docker logs --since 2h muktasabat-api-1 2>&1 | grep -ciE "error|traceback|exception|timeout" || true
echo "== api log: last error lines"; docker logs --since 2h muktasabat-api-1 2>&1 | grep -iE "error|traceback|exception|timeout" | tail -15 | strip
echo "== api log: slow/ status codes last 2h"; docker logs --since 2h muktasabat-api-1 2>&1 | grep -oE '" [1-5][0-9]{2}' | sort | uniq -c | sort -rn | head
echo "== web log: last error lines"; docker logs --since 2h muktasabat-web-1 2>&1 | grep -iE "error|timeout|ECONN|fail" | tail -15 | strip
echo "== db"; docker ps --format '{{.Names}}' | grep -i db && docker exec $(docker ps --format '{{.Names}}' | grep -i db | head -1) pg_isready 2>&1 | strip
echo "== db connections"; docker exec $(docker ps --format '{{.Names}}' | grep -i db | head -1) psql -U muktasbat -d muktasbat -tAc "select state, count(*) from pg_stat_activity group by 1" 2>&1 | strip
echo "== top processes by memory"; ps -eo rss,comm --sort=-rss | head -8
