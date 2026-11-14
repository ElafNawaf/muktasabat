# Data management — bulk Excel export / import (إدارة البيانات)

Admin-only page: **Admin → Data management** (`/[locale]/data-management`).

## Flow
1. **Export all data** (or **Empty template**) → one `.xlsx` with a sheet per entity,
   in import order: Users (reference only), Agents, Owners, Establishment, Employees,
   Properties, Units, Tenants, Tenant companions, Management contracts,
   Managed properties, Lease contracts, Payments, Payment splits, Expenses —
   plus `README`, `Lookups` (every enumeration, value + EN + AR) and `Dictionary`.
2. Edit in Excel. Row 1 = bilingual label (`*` required), row 2 = column key (do not edit), data from row 3.
   - New row: blank ID, or `NEW-1`, `NEW-2`… so other sheets can link to it in the same file.
   - `…_id` columns have a drop-down of valid IDs and a grey `↳` formula column showing the linked name.
   - Lookup columns have drop-downs bound to `Lookups`; Yes/No = `TRUE`/`FALSE`; dates `YYYY-MM-DD`.
3. **Validate** → every error listed (sheet, row, column, value, EN/AR message); downloadable as CSV.
4. **Apply** → enabled only at zero errors; one transaction, all-or-nothing; audit-logged.
   Rows removed from the file are **not** deleted. Contract totals and management fees are recalculated.

## What is checked
Types, required, max length, numeric ranges, lookup membership, formats (phone, e-mail,
Saudi ID/Iqama by ID type, CR, VAT, IBAN `SA`+22 digits, short national address, postal code),
Excel auto-conversions (numbers turned into dates, phones that lost the leading 0, Hijri dates),
references (existing ID or `NEW-…` in the file), duplicates (national ID, CR, property code,
unit number per property, contract numbers), and business rules evaluated on the final
state (company owners need CR + representative, end after start, lease needs tenant and rent,
mandate owner = property owner and covers the unit, unit belongs to property, paid payment needs a date…).

## Code
- `api/services/data_io/spec.py` — single source of truth (sheets, columns, lookups, formats, rules).
  Add a column = add one `F(...)` line. A self-check fails at import if the spec drifts from the models.
- `api/services/data_io/export.py`, `importer.py`, `api/routers/data_io.py` (`/api/v1/data-io/*`).
- Web: `web/src/app/[locale]/(app)/data-management/`, proxies in `web/src/app/api/data-io/`.
- Test: `PYTHONPATH=. DATABASE_URL=sqlite:////tmp/dio.db SECRET_KEY=test python3 scripts/test_data_io.py`

Not in the workbook: photos/documents/attachments (managed in the portal), user accounts,
passwords and roles (User Management), website CMS content, Ejar API responses (read-only columns only).
