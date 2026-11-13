#!/bin/bash
# Pass 5 — uploads end to end (test file is removed afterwards).
B=https://muktasabat.com
KEY=$(docker exec muktasabat-api-1 python -c "
import io
from api import storage
o=storage.upload_image(io.BytesIO(bytes.fromhex('89504e470d0a1a0a')), content_type='image/png', prefix='diag')
print(o.object_key)" 2>/dev/null | tail -1)
echo "stored key: $KEY"
echo "served via site: $(curl -s -o /dev/null -w '%{http_code} %{content_type}' $B/uploads/$KEY)"
echo "private path blocked: $(curl -s -o /dev/null -w '%{http_code}' $B/uploads/private/careers/x.pdf)"
echo "traversal blocked: $(curl -s -o /dev/null -w '%{http_code}' $B/uploads/..%2F..%2Fetc/passwd)"
docker exec muktasabat-api-1 rm -rf /app/uploads/diag
echo "brand: $(curl -s $B/ar | grep -o 'شركة مكتسبات العقارية' | head -1) | phone: $(curl -s $B/ar | grep -o 'tel:[0-9]*' | head -1)"
echo "api tracebacks (15m): $(docker logs muktasabat-api-1 --since 15m 2>&1 | grep -c Traceback)"
