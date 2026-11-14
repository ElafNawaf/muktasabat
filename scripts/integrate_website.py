#!/usr/bin/env python3
"""Wire the public website + CMS into the existing Muktasabat app.

Idempotent: safe to run more than once. Run from the repo root:

    python3 scripts/integrate_website.py

Each step prints OK / SKIP (already done) / FAIL (needs a manual edit).
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
failures: list[str] = []


def step(name: str, fn) -> None:
    try:
        res = fn()
        print(f"  {'SKIP' if res == 'skip' else 'OK  '} {name}")
    except Exception as e:  # noqa: BLE001
        failures.append(f"{name}: {e}")
        print(f"  FAIL {name}: {e}")


def edit(path: str, fn) -> str | None:
    p = ROOT / path
    s = p.read_text(encoding="utf-8")
    out = fn(s)
    if out is None or out == s:
        return "skip"
    p.write_text(out, encoding="utf-8")
    return None


# ── API ──────────────────────────────────────────────────────────────

def main_py(s: str):
    if "routers import cms" in s or "cms.public" in s:
        return None
    s = s.replace(
        "from api.bootstrap_roles import seed_default_roles",
        "from api.bootstrap_roles import seed_default_roles\nfrom api.cms_seed import seed_cms\nfrom api.routers import cms",
        1,
    )
    s = s.replace(
        "    import api.models  # noqa: F401 — register ORM mappers with Base.metadata\n",
        "    import api.models  # noqa: F401 — register ORM mappers with Base.metadata\n"
        "    import api.cms_models  # noqa: F401 — public-website CMS tables\n",
        1,
    )
    s = s.replace(
        "    with SessionLocal() as db:\n        seed_default_roles(db)\n",
        "    with SessionLocal() as db:\n        seed_default_roles(db)\n\n"
        "    # Public website: fill an empty CMS with starter content (no-op afterwards).\n"
        "    with SessionLocal() as db:\n        seed_cms(db)\n",
        1,
    )
    anchor = "app.include_router(translate.router, prefix=API_V1)\n"
    if anchor not in s:
        raise RuntimeError("router include anchor not found")
    s = s.replace(
        anchor,
        anchor + "# Public website CMS — /api/v1/cms/public/* (anonymous) and /api/v1/cms/admin/*\n"
        "app.include_router(cms.public, prefix=API_V1)\napp.include_router(cms.admin, prefix=API_V1)\n",
        1,
    )
    for needle in ("seed_cms(db)", "import api.cms_models", "from api.routers import cms"):
        if needle not in s:
            raise RuntimeError(f"could not insert: {needle}")
    return s


CONTENT_EDITOR = '''    {
        "code": "content_editor",
        "label_en": "Content Editor",
        "label_ar": "محرر المحتوى",
        "description_en": "Manages the public website: pages, projects, news, careers and enquiries.",
        "description_ar": "إدارة الموقع العام: الصفحات والمشاريع والأخبار والوظائف والاستفسارات.",
        "color": "#0F766E",
        "system": False,
        "permissions": _build(
            {
                "website": {"view": 1, "create": 1, "edit": 1},
            }
        ),
    },
'''


def roles_py(s: str):
    if '"content_editor"' in s:
        return None
    s2 = re.sub(r'(_MODULES = \[\n(?:    "[a-z_]+",\n)+)', lambda m: m.group(1) + '    "website",\n', s, count=1)
    if s2 == s:
        raise RuntimeError("_MODULES list not found")
    # Insert the new role before the `owner` system role.
    idx = s2.find('        "code": "owner"')
    if idx == -1:
        raise RuntimeError("owner role anchor not found")
    brace = s2.rfind("    {\n", 0, idx)
    return s2[:brace] + CONTENT_EDITOR + s2[brace:]


# ── Web ──────────────────────────────────────────────────────────────

def move_root_redirect():
    old = ROOT / "web/src/app/[locale]/page.tsx"
    if not old.exists():
        return "skip"
    dest = ROOT / "web/legacy/locale-root-redirect.page.tsx.txt"
    dest.parent.mkdir(exist_ok=True)
    shutil.move(str(old), str(dest))  # (site)/page.tsx now owns /{locale}
    return None


def default_locale(s: str):
    return re.sub(r'export const defaultLocale: Locale = "en";', 'export const defaultLocale: Locale = "ar";', s)


def merge_messages():
    for loc in ("en", "ar"):
        target = ROOT / f"web/messages/{loc}.json"
        src = ROOT / f"web/messages-site/{loc}.json"
        if not src.exists():
            return "skip"
        site = json.loads(src.read_text(encoding="utf-8"))
        data = json.loads(target.read_text(encoding="utf-8"))
        data["site"] = site["site"]
        nav = data.setdefault("nav", {})
        nav.setdefault("website", "Website" if loc == "en" else "الموقع الإلكتروني")
        target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def package_json(s: str):
    data = json.loads(s)
    deps = data.setdefault("dependencies", {})
    if "react-markdown" in deps:
        return None
    deps["react-markdown"] = "^9.0.1"
    data["dependencies"] = dict(sorted(deps.items()))
    return json.dumps(data, indent=2) + "\n"


HEADERS = r'''
// Security headers for the public site and the portal.
const csp = [
  "default-src 'self'",
  // Next.js inlines bootstrapping scripts; Turnstile is the only third-party script.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];
'''


def next_config(s: str):
    if "securityHeaders" in s:
        return None
    s = s.replace("/** @type {import('next').NextConfig} */", HEADERS + "\n/** @type {import('next').NextConfig} */", 1)
    s2 = s.replace(
        '  output: "standalone",\n',
        '  output: "standalone",\n  poweredByHeader: false,\n'
        '  async headers() {\n    return [{ source: "/:path*", headers: securityHeaders }];\n  },\n',
        1,
    )
    if s2 == s:
        raise RuntimeError('`output: "standalone"` anchor not found')
    return s2


def sidebar(s: str):
    if "/website`" in s:
        return None
    m = re.search(r"\n(\s*)\{\s*\n?\s*id: \"users\"", s)
    if not m:
        raise RuntimeError("users nav item not found — add the Website item by hand")
    indent = m.group(1)
    item = f'\n{indent}{{ id: "website", href: `/${{locale}}/website`, icon: "language", label: t("website") }},'
    return s[: m.start()] + item + s[m.start():]


def dockerfile_build_arg(s: str):
    if "NEXT_PUBLIC_TURNSTILE_SITE_KEY" in s:
        return None
    m = re.search(r"(RUN npm run build)", s)
    if not m:
        raise RuntimeError("`RUN npm run build` not found")
    return s.replace(
        m.group(1),
        "ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=\nENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY\n" + m.group(1),
        1,
    )


if __name__ == "__main__":
    print("API")
    step("api/main.py — CMS tables, seed, routers", lambda: edit("api/main.py", main_py))
    step("api/bootstrap_roles.py — website module + content_editor role", lambda: edit("api/bootstrap_roles.py", roles_py))
    print("Web")
    step("move [locale]/page.tsx redirect out of the way", move_root_redirect)
    step("i18n default locale → ar", lambda: edit("web/src/i18n/config.ts", default_locale))
    step("messages — merge `site` namespace", merge_messages)
    step("package.json — react-markdown", lambda: edit("web/package.json", package_json))
    step("next.config.mjs — security headers", lambda: edit("web/next.config.mjs", next_config))
    step("Sidebar — Website nav item", lambda: edit("web/src/components/Sidebar.tsx", sidebar))
    step("web/Dockerfile — Turnstile build arg", lambda: edit("web/Dockerfile", dockerfile_build_arg))
    if failures:
        print("\nManual follow-up needed:")
        for f in failures:
            print("  •", f)
        sys.exit(1)
    print("\nDone. Next: cd web && npm install && npm run typecheck && npm run build")
