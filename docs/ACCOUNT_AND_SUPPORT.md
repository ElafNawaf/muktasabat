# My account & Help/support

Self-service account management and a technical-support ticket desk for every
portal user. Owner accounts can already call the account/support APIs
(allowed in `api/deps.py`), but the owner portal UI doesn't link to these pages yet.

## Where it lives

| Area | Web | API |
|---|---|---|
| Profile, photo, name, phone, job title | `/[locale]/account` (Profile tab) | `GET/PUT /api/v1/account/profile`, `POST/DELETE /api/v1/account/avatar` |
| Change username (needs current password) | Profile tab → Sign-in details | `POST /api/v1/account/username` |
| Change email (2-step: confirm link to the new address, alert to the old one) | Profile tab → Sign-in details, `/[locale]/confirm-email?token=…` | `POST /api/v1/account/email`, `DELETE /api/v1/account/email/pending`, `POST /api/v1/account/confirm-email` |
| Change password (signs out other devices, keeps this one) | `/[locale]/account?tab=security` | `POST /api/v1/account/password` |
| Forgot / reset password | `/[locale]/forgot-password` (unchanged URL) | `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password` |
| Sign out of all devices | Security tab | `POST /api/v1/account/logout-all` |
| Recent security activity | Security tab | `GET /api/v1/account/activity` |
| Language, theme, ticket email notifications | `/[locale]/account?tab=preferences` | `PUT /api/v1/account/profile` |
| Support tickets | `/[locale]/support`, `/[locale]/support/{id}` | `/api/v1/support/*` |
| Admin: email a reset link / sign a user out everywhere | Users page → per-user icons | `POST /api/v1/auth/admin/users/{id}/send-reset`, `…/revoke-sessions` |

Users can now sign in with **username or email**. Entry points: avatar menu in
the top bar, the “My account” section in the sidebar, and the `?` icon.

## Sessions

`users.token_version` is embedded in every JWT (`ver` claim). Bumping it
revokes all access + refresh tokens for that user. It is bumped by: password
change, password reset, “sign out of all devices”, admin revoke, and admin
deactivation. Tokens issued before this change carry no `ver` and are treated
as `0`, so nobody is logged out by the deploy.

## Support desk

- Anyone signed in can open tickets (subject, category, priority, description,
  optional attachment ≤ 10 MB) and reply in a thread.
- **Staff** = roles with `support.edit` (admins by default; grant it to any role
  in Users → Roles & permissions). Staff see all tickets, set
  status/priority/assignee and can post **internal notes** the requester never sees.
- Status flow: `open → in_progress → waiting_user → resolved → closed`. A staff
  reply moves it to *waiting_user*; a requester reply moves it back to *open*.
- Emails (bilingual): new ticket → `SUPPORT_EMAIL` (or all active admins) +
  receipt to the requester; staff reply / resolve → requester (if they kept
  ticket notifications on); requester reply → assignee (or support inbox).

## Emails

All account/support emails use the house template in `api/email.py` (`_branded`:
Arabic then English). Links in emails use the user's preferred locale.

## Database

New `users` columns are added on startup by `ensure_user_profile_columns`
(no manual migration). New tables `support_tickets` and
`support_ticket_messages` are created by `create_all`.

## Config

- `SUPPORT_EMAIL` — optional, comma-separated inbox(es) for new-ticket alerts.
- Existing: `WEB_BASE_URL` (links), `SES_*` (sending), `S3_*` (avatars and
  attachments), `RESET_PASSWORD_DEBUG` (dev only: returns debug links).
