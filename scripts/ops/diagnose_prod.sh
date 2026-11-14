#!/bin/bash
# Send a password reset for the user's own admin account (requested by the account owner).
echo "forgot-password: $(curl -s -o /dev/null -w '%{http_code}' -X POST https://muktasabat.com/api/auth/forgot-password -H 'content-type: application/json' -d '{"email":"Elaf.nawaf7@gmail.com"}')"
sleep 4
docker logs muktasabat-api-1 --since 1m 2>&1 | grep -E 'Sent email|Failed to send email' | python3 -c "
import sys, json
for l in sys.stdin:
    d=json.loads(l); print('RESULT', d['message'], (d.get('exception') or '').strip().splitlines()[-1][:250] if d.get('exception') else '')
"
