#!/bin/bash
# Pass 4 — why /uploads returns 404 in production.
docker exec muktasabat-api-1 sh -c 'mkdir -p /app/uploads/diag && printf PNG > /app/uploads/diag/probe.png && ls -la /app/uploads/diag; echo LOCAL_UPLOAD_DIR=$LOCAL_UPLOAD_DIR'
docker exec -i muktasabat-api-1 python -c "from api.storage import local_upload_root; print('root:', local_upload_root())"
echo "api direct from web container:"; docker exec muktasabat-web-1 sh -c 'wget -S -qO- http://api:8000/uploads/diag/probe.png 2>&1 | head -5; echo; echo API_URL=$API_URL NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL'
echo "via localhost:3000:"; curl -s -D - -o /dev/null http://127.0.0.1:3000/uploads/diag/probe.png | head -3
echo "via public site:"; curl -s -D - -o /dev/null https://muktasabat.com/uploads/diag/probe.png | head -3
docker logs muktasabat-web-1 --since 2m 2>&1 | tail -5
docker exec muktasabat-api-1 rm -rf /app/uploads/diag
