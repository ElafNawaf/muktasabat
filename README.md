# Muktasabat (PropOS)

Property-management platform for the Saudi market — FastAPI backend, Next.js 14 frontend, PostgreSQL.

For local development instructions, see [CLAUDE.md](CLAUDE.md).

## Deployment plan (v2 rollout)

Builds running in background (~5-10 min). I'll execute the deploy as soon as both finish.

### Plan summary

| Step | What |
| --- | --- |
| 1. Build images locally | `muktasabat-api:v2` + `muktasabat-web:v2` for linux/amd64 |
| 2. Save + scp tarball to instance | ~300 MB upload |
| 3. SSH execute deploy script | Stops v1 containers, swaps to v2, runs FastAPI lifespan (which auto-adds new `password_reset_token` / `password_reset_expires` columns to `users` table) |
| 4. Caddy stays put | No changes to TLS / reverse-proxy layer; HTTPS continues to work |
| 5. Verify | Hit `/api/health` + `https://muktasabat.com/` + check new pages (`/register`, `/forgot-password`, `/users`) render |

### Key safety notes

- Existing data (38 buildings, 284 units, 70 tenants, 19 contracts, your custom admin password) is preserved — schema migration only adds 2 nullable columns
- The FastAPI lifespan handler will **NOT** create a new admin since you already have one
- Rolling back is one command if anything breaks: `docker compose down && cp docker-compose.v1.yml.bak docker-compose.yml && docker run -d ... muktasabat-api:latest`
- Brief downtime during the swap: ~30s

Will execute the moment the build watcher fires.

## Email (AWS SES)

Password-reset and email-verification messages go through AWS SES when these env
vars are set on the API container; otherwise the email body is logged to stdout
(local-dev fallback — no AWS account needed):

| Var | Required | Purpose |
| --- | --- | --- |
| `SES_REGION` | yes (prod) | AWS region of the SES sender identity (e.g. `us-east-1`). |
| `SES_FROM_EMAIL` | yes (prod) | Verified SES "from" address. |
| `SES_CONFIGURATION_SET` | optional | SES configuration set name for tracking / suppression. |
| `WEB_BASE_URL` | yes (prod) | Public URL of the Next.js app — used to build the link in email bodies (`https://muktasabat.com`). |
| `RESET_PASSWORD_DEBUG` | dev only | When `true`, `/auth/forgot-password` returns `debug_reset_url` for testing without email. |

The IAM role attached to the API container needs `ses:SendEmail` (and `ses:SendRawEmail` if you later add attachments). `boto3` is already in `requirements.txt`.

## Bilingual data + auto-translate (AWS Translate)

Every entity field that the user reads (Owner / Tenant / Building / Unit / Expense
names, descriptions, addresses, notes…) is stored in both Arabic and English.
Forms render side-by-side AR/EN inputs; on blur of one side, if the other side
is empty it's auto-filled via Amazon Translate.

| Var | Required | Purpose |
| --- | --- | --- |
| `TRANSLATE_REGION` | optional | AWS region for the Translate API (e.g. `us-east-1`). Falls back to `SES_REGION` so a single-region setup works without setting both. Empty → `/api/v1/translate` returns the input unchanged (local-dev no-op). |

IAM perm for the API container: `translate:TranslateText`. No language-data
opt-in required for AR↔EN. Pricing: ~$15 per million characters.

The frontend never overwrites a field the user already typed — auto-translate
only fires when the *other* side of the pair is empty. There's also a manual
"translate" icon button next to each label for forced re-translation.

## Building location (Leaflet + OpenStreetMap)

Buildings store `latitude` + `longitude` columns. The Building form exposes a
Leaflet map (OpenStreetMap tiles — no API key, no billing) where the user can
click to drop a pin, type coordinates manually, or use browser geolocation.

When a building has real coordinates, the Properties page links **Directions**
to Google Maps and **Open map** to OpenStreetMap with those coordinates. When
coordinates are missing, the page shows a "Set location" button that opens the
Building edit form, and the inline address shows an "approximate" badge for the
fallback palette-derived position.

## Property images (S3)

Buildings and units carry an image gallery (multiple photos each). A "Manage
photos" button (camera icon) on each building/unit opens a modal with drag-drop
upload + a thumbnail grid (delete supported).

| Var | Required | Purpose |
| --- | --- | --- |
| `S3_BUCKET` | yes (uploads) | Bucket name. Empty → upload endpoints return 503 with a clear "not configured" message. |
| `S3_REGION` | yes (AWS) | Bucket region (e.g. `us-east-1`). |
| `S3_ENDPOINT_URL` | optional | For S3-compatible providers (Cloudflare R2, MinIO). |
| `S3_PUBLIC_BASE_URL` | optional | CDN/public URL prefix for served objects. Defaults to `https://<bucket>.s3.<region>.amazonaws.com/<key>`. |

IAM perms for the API container: `s3:PutObject`, `s3:DeleteObject` on the
bucket; bucket needs to allow public read on uploaded objects (or front it with
CloudFront and set `S3_PUBLIC_BASE_URL`).

Frontend constraints: JPG / PNG / WEBP / GIF, 8 MB max per file, multiple files
per upload. Real images replace the synthetic SVG art on the Properties page
hero, thumbnails, and lightbox; SVG art is the fallback when an entity has no
photos.

