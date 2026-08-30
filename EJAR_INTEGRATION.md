# Ejar integration (تكامل منصة إيجار)

Muktasabat models the two contracts Ejar actually recognises, and refuses to
submit either one until every field the platform requires is present.

| Ejar contract | Parties | Where it lives |
|---|---|---|
| **عقد إدارة الأملاك** — property management | establishment ↔ owner | `/management-contracts` |
| **عقد الإيجار** — lease | owner ↔ tenant (signed by the establishment) | `/contracts` |

The two are linked: Ejar only accepts a lease signed by someone other than the
landlord when a **registered management contract** grants that authority. The
portal enforces the same rule, so a lease cannot be filed under a mandate that
is missing, unregistered, or doesn't cover the property.

---

## 1. The establishment (المنشأة العقارية)

Every contract Ejar accepts is filed under a licensed real-estate
establishment. Set it up once from **Management contracts → Establishment**.

| Field | Why Ejar needs it |
|---|---|
| `cr_number` — السجل التجاري | Identifies the establishment |
| `fal_management_license_number` — رخصة فال (إدارة أملاك) | Authority to manage owners' properties |
| `fal_license_number` — رخصة فال (وساطة) | Authority to broker and advertise |
| licence expiry dates | An expired licence blocks every submission |
| `representative_name` / `_national_id` | The person who signs |
| `national_address` | Saudi short address (e.g. `RRRD2929`) |
| `iban` | Account that receives collected rent |

`GET /api/v1/management/company/ejar/validate` reports what's still missing.

Only one row is active at a time (`is_active`). Superseded profiles are kept
rather than overwritten, so a licence renewal leaves an audit trail.

---

## 2. Party identity (هوية الطرف)

Ejar does not accept a bare name and number. Owners **and** tenants now carry:

- `id_type` — `national_id` · `iqama` · `gcc_id` · `passport` · `visitor` · `cr` · `endowment`
- `id_expiry_date` and `nationality` — required for iqama, passport, visitor and GCC IDs
- `absher_phone` — Ejar verifies parties through Absher
- `date_of_birth` — required for individuals
- `national_address`, `ejar_party_id`

A party whose `id_type` is `cr` or `endowment` (or whose type is `company`) is
treated as an organisation and must name an authorised representative instead
of a date of birth.

---

## 3. Property and unit

| Level | Ejar fields added |
|---|---|
| Building | `national_address`, `postal_code`, `building_number`, `additional_number`, `ejar_property_id` |
| Unit | `ejar_unit_id`, `usage_type`, `rooms_count`, `bathrooms_count`, `is_furnished` |

`deed_number` (رقم الصك) was already present and is a hard requirement.

---

## 4. Management contract

Beyond the parties, a mandate records:

- **Term** — start, end, duration, auto-renew, notice period
- **Fee** — percentage of collected rent *or* a fixed annual amount, VAT rate,
  whether it is deducted from rent or invoiced to the owner, payout cycle
- **Scope of authority** — market units, sign leases, collect rent, evict,
  maintain (with a spend limit), pay utilities
- **Portfolio** — the buildings, or individual units, under management

`estimated_annual_fee` / `vat_amount` / `total_fee_amount` are computed
server-side from the current rent roll of the portfolio, so the value Ejar
records always matches the units actually covered.

A portfolio entry whose building belongs to a different owner is rejected.

---

## 5. Validate before you submit

Ejar answers a malformed submission with an opaque error. Every registration
endpoint therefore runs a readiness check first and returns the precise field
list — in English and Arabic — instead.

```
GET  /api/v1/management/company/ejar/validate
GET  /api/v1/management/contracts/{id}/ejar/validate
GET  /api/v1/contracts/{id}/ejar/validate
```

```json
{
  "ready": false,
  "error_count": 2,
  "warning_count": 1,
  "issues": [
    {
      "entity": "owner", "entity_id": 3, "field": "date_of_birth",
      "message_en": "Landlord date of birth is required for Absher verification.",
      "message_ar": "تاريخ ميلاد المالك مطلوب للتحقق عبر أبشر.",
      "severity": "error"
    }
  ]
}
```

`severity: "error"` blocks submission; `"warning"` does not. The UI shows the
same list behind the **Check Ejar readiness** button on every contract row.

---

## 6. Registering

```
POST /api/v1/management/contracts/{id}/ejar/register
POST /api/v1/contracts/{id}/ejar/register
```

Both validate first and return **422** with the issue list if anything blocks.
On success the contract stores `ejar_contract_number`, `ejar_reference`,
`ejar_registered_at` and the raw response; on rejection it stores
`ejar_status="failed"` and `ejar_last_error`.

Cancelling a management contract is refused while leases registered under it
are still live on Ejar — Ejar would orphan them.

---

## 7. Importing from Ejar

```
POST /api/v1/management/ejar/sync   → management contracts
POST /api/v1/contracts/ejar/sync    → leases
```

Both match on the Ejar contract number, so re-running updates rather than
duplicates. The lease sync creates missing owners, buildings, units and
tenants; the management sync creates missing **owners** but only *links*
buildings it can match by deed number — inventing a building from a deed number
alone would produce an unusable stub.

---

## 8. Stub vs live

With `EJAR_CLIENT_ID` unset (or `EJAR_STUB_MODE=true`) every Ejar call is
simulated locally and returns realistic response shapes, so the whole flow
works in development without REGA credentials. Responses are marked
`is_stub_mode: true` and the UI shows a warning banner.

Going live needs only environment variables — no code change:

```bash
EJAR_CLIENT_ID=<from REGA developer portal>
EJAR_CLIENT_SECRET=<secret>
EJAR_BASE_URL=https://api.ejar.sa      # or https://staging.api.ejar.sa
EJAR_STUB_MODE=false
```

**Field names are provisional.** REGA has not published the API contract, so
`EjarParty.to_api()`, `EjarPropertyRef.to_api()` and the two payload
`to_api()` methods in `api/services/ejar.py` are the single place to adjust
once the real spec arrives. Response parsing already accepts several common
aliases (`ejarContractNumber` / `contractNumber` / `number`, …). The readiness
rules live in `api/services/ejar_mapping.py` next to the builders that read the
same fields, so the two cannot drift apart.

---

## 9. Files

| Path | Role |
|---|---|
| `api/services/ejar.py` | Transport, payload shapes, stub + live implementations |
| `api/services/ejar_mapping.py` | ORM → payload builders and the readiness rules |
| `api/services/ejar_sync.py` | Idempotent import of both contract types |
| `api/routers/management.py` | Establishment profile + management contract API |
| `api/routers/contracts.py` | Lease API, extended with validate/register |
| `api/management_fees.py` | Management fee + VAT calculation |
| `web/src/app/[locale]/(app)/management-contracts/` | UI: list, contract form, establishment profile |
| `scripts/test_ejar_flow.py` | End-to-end smoke test of both flows |

Run the smoke test against a scratch database:

```bash
DATABASE_URL="sqlite:////tmp/ejar_test.db" SECRET_KEY=dev-secret-key-at-least-32-chars \
  python3 scripts/test_ejar_flow.py
```

---

## 10. Schema migration

New columns are added at startup by `ensure_ejar_party_columns`,
`ensure_ejar_property_columns` and `ensure_contract_ejar_columns` in
`api/database.py`; new tables come from `create_all`. Existing SQLite and
Postgres databases upgrade in place — no manual migration step.
