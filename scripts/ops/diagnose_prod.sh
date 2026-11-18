#!/usr/bin/env bash
# Read-only health check. Public-safe output.
set -u
strip() { sed -E 's/[0-9]{1,3}(\.[0-9]{1,3}){3}/<ip>/g; s/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/<email>/g' | cut -c1-240; }
echo "== time"; date -u; uptime
echo "== memory"; free -m; swapon --show
echo "== disk"; df -h / | tail -1
echo "== containers"; docker ps -a --format '{{.Names}} {{.Image}} {{.Status}}'
for c in $(docker ps -aq); do docker inspect "$c" --format '{{.Name}} restarts={{.RestartCount}} oom={{.State.OOMKilled}} started={{.State.StartedAt}}'; done
echo "== stats"; docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}'
echo "== http"
for u in https://muktasabat.com/ https://muktasabat.com/ar https://muktasabat.com/ar/login https://muktasabat.com/en https://muktasabat.com/api/health; do curl -sk -o /dev/null -m 30 -w "$u -> %{http_code} %{time_total}s\n" "$u" || echo "$u failed"; done
echo "== caddy"; systemctl is-active caddy 2>/dev/null; sudo journalctl -u caddy --since "3 hours ago" --no-pager 2>/dev/null | grep -iE "error|fail" | tail -5 | strip
echo "== web log errors (3h)"; docker logs --since 3h muktasabat-web-1 2>&1 | grep -iE "error|fail|ECONN|digest" | tail -20 | strip
echo "== api log errors (3h)"; docker logs --since 3h muktasabat-api-1 2>&1 | grep -iE "error|traceback|exception" | tail -20 | strip
echo "== api tail"; docker logs --tail 15 muktasabat-api-1 2>&1 | strip
