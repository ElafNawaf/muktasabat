#!/bin/bash
docker logs muktasabat-api-1 --since 3h 2>&1 | grep 'Failed to send email' | python3 -c "
import sys, json
for l in sys.stdin:
    try: d=json.loads(l); print(d['ts'], d['exception'].strip().splitlines()[-1][:400])
    except Exception as e: print('parse', e)
"
