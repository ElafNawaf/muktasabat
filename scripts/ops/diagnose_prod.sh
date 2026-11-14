#!/bin/bash
# Pass 8 — do the DKIM CNAMEs resolve publicly? Also ask each Route 53 name server directly.
python3 - <<'PY'
import json, urllib.request
toks=["dzxclgvztcbt6rp2nv7klnokmtbc4j7g","6ve75js33nfoadi7pnp4xcqp6unwk4nj","6mtw7a3yljhy2hvg4zbwcjswe3qehdu2"]
for t in toks:
    n=f"{t}._domainkey.muktasabat.com"
    r=json.load(urllib.request.urlopen(f"https://dns.google/resolve?name={n}&type=CNAME",timeout=10))
    print("google", t[:8], r.get("Status"), [a["data"] for a in r.get("Answer",[])])
PY
which dig >/dev/null 2>&1 || (sudo apt-get install -y -qq dnsutils >/dev/null 2>&1)
for ns in ns-1115.awsdns-11.org ns-796.awsdns-35.net ns-37.awsdns-04.com ns-1903.awsdns-45.co.uk; do
  echo "$ns: $(dig +short CNAME dzxclgvztcbt6rp2nv7klnokmtbc4j7g._domainkey.muktasabat.com @$ns 2>&1 | head -1) | NS-in-zone: $(dig +short NS muktasabat.com @$ns | tr '\n' ' ')"
done
echo "registry delegation: $(dig +short NS muktasabat.com @a.gtld-servers.net 2>/dev/null; dig +norec NS muktasabat.com @a.gtld-servers.net 2>/dev/null | grep -A5 'AUTHORITY' | grep NS | awk '{print $5}' | tr '\n' ' ')"
