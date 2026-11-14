#!/bin/bash
# Read-only: find the server-side exception (digest 3445715508). Output is email-masked.
cat /home/ubuntu/muktasabat/.last_deployed_sha; docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
echo "--- web errors (last 3h) ---"
docker logs muktasabat-web-1 --since 3h 2>&1 | grep -n -B3 -A25 -E "3445715508|Error|digest" | head -150
echo "--- api errors (last 3h) ---"
docker logs muktasabat-api-1 --since 3h 2>&1 | grep -E '"level": "(ERROR|CRITICAL)"|Traceback|HTTP/1.1\" 5[0-9][0-9]' | tail -40
docker logs muktasabat-api-1 --since 3h 2>&1 | grep -E '" (4[0-9][0-9]|5[0-9][0-9]) ' | tail -30
