#!/bin/bash
# Read-only post-deploy check.
cat /home/ubuntu/muktasabat/.last_deployed_sha
for u in /ar /ar/listings /ar/contact /ar/login /en/login /ar/owner /ar/dashboard; do echo "$(curl -s -o /dev/null -w '%{http_code}' https://muktasabat.com$u) $u"; done
for c in $(curl -s https://muktasabat.com/ar/login | grep -o '/_next/static/css/[^"]*\.css' | sort -u); do curl -s https://muktasabat.com$c | grep -o -- '--brand-maroon:[^;]*\|mask:var(--brand-shurfat)' | sort -u; done
curl -s https://muktasabat.com/ar/contact | grep -o 'السبت – الخميس، 9 ص – 9 م' | head -1
