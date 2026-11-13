#!/bin/bash
# Pass 3 — post-release verification (read-only except one test upload that is deleted again).
B=https://muktasabat.com
for p in /ar /en /ar/for-owners /en/for-owners /ar/owner /ar/owner-access /ar/website/settings; do printf "%-22s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code} → %{redirect_url}' $B$p)"; done
echo "whatsapp link on /ar: $(curl -s $B/ar | grep -o 'wa.me/[0-9]*' | sort -u | head -2 | tr '\n' ' ')"
echo "phone on /ar: $(curl -s $B/ar | grep -o 'tel:[0-9+]*' | sort -u | head -2 | tr '\n' ' ')"
echo "owner-portal API without login: $(curl -s -o /dev/null -w '%{http_code}' $B/api/site/lead -X POST -H 'content-type: application/json' -d '{}')"
echo "security headers:"; curl -sI $B/ar | grep -iE 'content-security-policy|strict-transport|x-frame' | cut -c1-80
docker exec -i muktasabat-api-1 python - <<'PY'
import io, os
from api import storage
png=bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000")
o=storage.upload_image(io.BytesIO(png), content_type="image/png", prefix="diag")
print("upload stored:", o.public_url)
open("/tmp/diag_key","w").write(o.object_key)
PY
KEY=$(docker exec muktasabat-api-1 cat /tmp/diag_key)
echo "served via site: $(curl -s -o /dev/null -w '%{http_code} %{content_type}' $B/uploads/$KEY)"
echo "private CV path blocked: $(curl -s -o /dev/null -w '%{http_code}' $B/uploads/private/careers/x.pdf)"
echo "on host volume: $(ls /home/ubuntu/muktasabat/uploads/diag | wc -l) file(s)"
docker exec muktasabat-api-1 python -c "from api import storage; storage.delete_object('$KEY')"
echo "cleanup: $(ls /home/ubuntu/muktasabat/uploads/diag 2>/dev/null | wc -l) left"
echo "api errors since deploy:"; docker logs muktasabat-api-1 --since 15m 2>&1 | grep -cE 'Traceback'
# rerun 1794609690
