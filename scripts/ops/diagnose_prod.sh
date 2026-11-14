#!/bin/bash
# Pass 7 — where is muktasabat.com DNS hosted? (public DNS lookups only)
q() { python3 - "$1" "$2" <<'PY'
import json, sys, urllib.request
n, t = sys.argv[1], sys.argv[2]
r = json.load(urllib.request.urlopen(f"https://dns.google/resolve?name={n}&type={t}", timeout=10))
print(t, n, [a["data"] for a in r.get("Answer", [])] or r.get("Status"))
PY
}
q muktasabat.com NS; q muktasabat.com MX; q muktasabat.com TXT; q _dmarc.muktasabat.com TXT; q muktasabat.com SOA
