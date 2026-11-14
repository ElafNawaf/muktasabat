#!/bin/bash
# Read-only post-deploy check.
cat /home/ubuntu/muktasabat/.last_deployed_sha; docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
for u in /ar /en /ar/listings /en/listings /ar/listings/qurtubah-darco-duplex /ar/contact /ar/about /ar/for-owners; do echo "$(curl -s -o /dev/null -w '%{http_code}' https://muktasabat.com$u) $u"; done
curl -s https://muktasabat.com/ar | grep -o 'تصفح العقارات\|عقارك في أيدٍ تعرف قيمته' | sort -u
curl -s https://muktasabat.com/ar/contact | grep -o 'iframe src="[^"]*'
curl -s http://127.0.0.1:8000/api/v1/cms/public/site | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['map_lat'],d['map_lng'],d['aqar_url'])"
curl -s http://127.0.0.1:8000/api/v1/cms/public/services | python3 -c "import json,sys;print([s['slug'] for s in json.load(sys.stdin)])"
docker logs muktasabat-web-1 --since 20m 2>&1 | grep -ci error
