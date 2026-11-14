# Public website (muktasabat.com) + CMS

The marketing site and the client portal are **one Next.js app and one FastAPI
API**, so the 1 GB Lightsail box runs no extra containers.

| URL | What |
|---|---|
| `/ar`, `/en` | Public homepage (was a redirect to login) |
| `/{l}/about · services · projects · news · careers · contact` | Public pages |
| `/{l}/login`, `/{l}/dashboard`, … | Portal — unchanged |
| `/{l}/website/*` | **Website editor** inside the portal |
| `/sitemap.xml`, `/robots.txt` | SEO (portal paths are disallowed) |

## How content flows

```
Editor (portal → Website) ──server action──► FastAPI /api/v1/cms/admin/*  (JWT + website.* permission)
                                   └── revalidateTag("cms") ──► public pages rebuild on next request
Visitor ──► Next.js ISR page (cached ≤5 min) ──► FastAPI /api/v1/cms/public/*  (published rows only)
Contact / Apply forms ──► /api/site/* (Next) ──► FastAPI public POST (rate limit, honeypot, Turnstile)
```

## Code map

| Path | Purpose |
|---|---|
| `api/cms_models.py` | Tables `cms_*` (auto-created by `create_all`, no migration needed) |
| `api/schemas/cms.py` | Validation — length caps, `https://`-only URLs, slug format |
| `api/routers/cms.py` | `public` + `admin` routers |
| `api/services/cms_guard.py` | Rate limiting, IP hashing, Turnstile |
| `api/cms_seed.py` | First-run starter content (only fills an empty CMS) |
| `web/src/app/[locale]/(site)/` | Public pages + `site.css` |
| `web/src/components/site/` | Public components (header, footer, forms, map, art) |
| `web/src/app/[locale]/(app)/website/` | Editor screens + `cms.css` |
| `web/src/components/cms/` | Generic editor (`ContentManager`), settings, inboxes |
| `web/src/lib/cms.ts` | Public data layer (anonymous, ISR-cached) |
| `web/src/lib/cms-fields.ts` | Field definitions that drive the editor |
| `web/src/lib/cms-actions.ts` | Server actions (save → revalidate) |

### Add a field to e.g. projects
1. Column in `CmsProject` **+** an `ensure_*` helper in `api/database.py` (table already exists in prod).
2. Field in `ProjectIn` (`api/schemas/cms.py`).
3. Entry in `KIND_FIELDS.projects` (`web/src/lib/cms-fields.ts`) — the editor form updates itself.
4. Render it in `(site)/projects/[slug]/page.tsx`.

## Permissions
New module **`website`** (view/create/edit/delete). Admins have it; the seeded
role **`content_editor`** (Marketing / Content Editor) can view/create/edit but
not delete. Grant it to marketing staff from Users & Roles.

## Security
- Public API returns published rows only; `private` settings (notification
  emails) never leave the admin endpoint.
- Every URL field accepts only `https://` or site-relative paths (blocks
  `javascript:`/`data:`); Markdown is rendered with raw HTML disabled.
- Image uploads: jpeg/png/webp/gif, ≤ 8 MB, **no SVG**. CVs: pdf/doc/docx,
  ≤ 5 MB, stored under `private/careers/` and downloaded only through an
  authenticated endpoint (S3 → 5-minute presigned URL).
- Forms: 5 leads / 10 min and 3 applications / 30 min per IP, hidden
  honeypot field, optional Cloudflare Turnstile, IPs stored only as salted hashes.
- CSV export neutralises spreadsheet formula injection.
- Security headers (CSP, HSTS, frame-ancestors, nosniff, referrer and
  permissions policy) set in `web/next.config.mjs`.

## Environment variables (all optional)
| Var | Where | Purpose |
|---|---|---|
| `REVALIDATE_SECRET` | web | Lets the deploy script purge the ISR cache (`POST /api/site/revalidate`) |
| `SITE_URL` | web | Canonical origin for sitemap/OG (default `https://muktasabat.com`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | web **build arg** | Shows the Turnstile widget |
| `TURNSTILE_SECRET_KEY` | api | Enforces Turnstile on forms |

Lead/application emails use the existing SES config; set recipients in
**Website → Site settings → Email notifications**.

## Before launch checklist
- [ ] Replace placeholder figures (Key figures are hidden while 0)
- [ ] Upload logo, hero image, project photos
- [ ] Add CR / FAL / VAT numbers, email, address, social links
- [ ] Set lead + careers notification emails
- [ ] Only publish **real** testimonials and partner logos (with permission)
- [ ] Submit `https://muktasabat.com/sitemap.xml` in Google Search Console
