# Muktasabat Real Estate Co. — Prototype Design Prompt

> **Use this document as the single source of truth** when building the Muktasabat prototype in Figma, v0.dev, Framer, Webflow, or any AI-assisted builder. Every section below maps directly to a real feature in the codebase.

---

## 1. Brand Identity

### Logo
- House silhouette with bar-chart columns inside, in dark maroon
- Arabic name above English: **شركة مكتسبات العقارية / Muktasabat Real Estate Co.**
- Use the logo in the top-left of every authenticated shell (sidebar header) and on the login/register pages

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-primary` | `#7B1A1A` | Primary actions, sidebar background, active nav items, badges |
| `--color-primary-light` | `#9B2B2B` | Hover states on primary |
| `--color-primary-dark` | `#5A1212` | Pressed states, sidebar dividers |
| `--color-accent` | `#C0392B` | Alert badges, overdue indicators, critical KPIs |
| `--color-surface` | `#FFFFFF` | Card/panel backgrounds |
| `--color-bg` | `#F5F5F5` | Page background |
| `--color-sidebar-bg` | `#1C1C1C` | Collapsed sidebar (dark mode default) |
| `--color-text-primary` | `#1A1A1A` | Body text |
| `--color-text-secondary` | `#6B7280` | Labels, metadata |
| `--color-border` | `#E5E7EB` | Card borders, table dividers |
| `--color-success` | `#16A34A` | Paid status, active contracts |
| `--color-warning` | `#D97706` | Upcoming / expiring soon |
| `--color-danger` | `#DC2626` | Overdue, terminated |
| `--color-gray-mid` | `#9E9E9E` | Secondary chart elements, icons |

### Typography
- **Primary font (Arabic):** IBM Plex Arabic — all Arabic-language content
- **Primary font (Latin):** IBM Plex Sans — all English-language content
- **Monospace (numbers/codes):** IBM Plex Mono — contract numbers, IBANs, amounts
- **Font scale:** 12 / 14 / 16 / 18 / 24 / 32 / 40 px
- **Direction:** RTL when locale = `ar`, LTR when locale = `en`. Both must work.

### Iconography
- Use **Material Symbols** (outlined, weight 400) throughout — matches the codebase
- Key icons: `home`, `apartment`, `group`, `description`, `payments`, `analytics`, `person`, `settings`, `logout`, `add`, `edit`, `delete`, `check_circle`, `warning`, `error`, `search`, `filter_list`, `more_vert`, `chevron_right`

---

## 2. Global Layout Shell (Authenticated Pages)

### Sidebar (collapsible)
```
┌─────────────────────────────┐
│ [Logo]  Muktasabat          [≡] │  ← collapse toggle
├─────────────────────────────┤
│ MAIN                        │
│  ⬜ Dashboard               │
│  ⬜ Properties (drill-down) │
├─────────────────────────────┤
│ DATA                        │
│  ⬜ Owners                  │
│  ⬜ Tenants                 │
│  ⬜ Contracts               │
│  ⬜ Payments                │
│  ⬜ Employees               │
├─────────────────────────────┤
│ ANALYTICS                   │
│  ⬜ Company Dashboard       │
│  ⬜ Collections             │
│  ⬜ Contract Intelligence   │
│  ⬜ Expenses Analytics      │
│  ⬜ Employee KPIs           │
├─────────────────────────────┤
│ PORTAL                      │
│  ⬜ Owner Dashboard         │
│  ⬜ Subscriptions           │
├─────────────────────────────┤
│ ADMIN (admin role only)     │
│  ⬜ User Management         │
├─────────────────────────────┤
│ [Avatar] Elaf Nawaf    [AR] │  ← language toggle + logout
└─────────────────────────────┘
```

- Collapsed sidebar: shows icons only, tooltips on hover
- Mobile: hamburger → full-screen overlay drawer
- Active item: `--color-primary` left border + background tint
- Language toggle button switches between AR ↔ EN and flips layout direction

### Top Bar
- Page title (h1) — left/right depending on locale
- Search bar (global)
- Notification bell
- Theme toggle (light/dark)
- User avatar + role badge

### Flash/Toast Messages
- Success (green), Error (red), Warning (amber), Info (blue)
- Auto-dismiss after 5 seconds, manual ✕ close

---

## 3. Public / Auth Screens

### 3.1 Login (`/login`)
**Layout:** Centered card on full-page background with subtle property grid pattern  
**Elements:**
- Logo (centered, 120px)
- Company name bilingual
- Email input
- Password input + show/hide toggle
- "Remember me" checkbox
- Primary CTA: **تسجيل الدخول / Sign In**
- Link: "Don't have an account? Register"
- Language toggle (AR / EN) — accessible before login

**States:** Loading spinner on submit, error message inline under fields, rate-limit warning after 5 failed attempts

### 3.2 Register (`/register`)
**Elements:**
- Full name (bilingual fields: name_ar, name_en)
- Email
- Password + confirm password
- Role: auto-assigned as "viewer" — not shown to user
- Primary CTA: **إنشاء حساب / Create Account**
- Link back to login

---

## 4. Main Dashboard (`/`)

**Role:** Manager / Admin view. Executive overview of the entire portfolio.

### KPI Cards Row (top)
6 cards in a responsive grid:

| Card | Value | Icon | Color |
|------|-------|------|-------|
| Total Owners | count | `group` | Primary |
| Buildings | count | `domain` | Primary |
| Units | count | `apartment` | Primary |
| Occupied Units | count + % | `check_circle` | Success |
| Active Contracts | count | `description` | Primary |
| Overdue Payments | count + SAR amount | `warning` | Danger |

### Secondary KPI Row
| Metric | Details |
|--------|---------|
| Collection Rate | % with progress bar |
| Monthly Rent Potential | SAR total |
| Total Collected (MTD) | SAR |
| Management Fee Income | SAR (from payment splits) |
| Contracts Expiring ≤30 days | count with urgency color |

### Tables Section (two columns)
**Left — Recent Contracts** (last 10)
Columns: Tenant name / Unit / Rent / Start date / Status badge

**Right — Upcoming Payments** (next 30 days)
Columns: Tenant / Unit / Amount (SAR) / Due date / Days until due

### Overdue Payments Alert Table (full width)
Columns: Tenant / Unit / Owner / Amount / Days overdue / [Mark Paid] action button

---

## 5. Properties Drill-Down (`/properties`)

**Concept:** Hierarchical explorer. Click to expand each level.

```
Owner card → expand → Building cards → expand → Unit cards → expand → Contract + Payment history
```

### Owner Card
- Name (bilingual) + national ID (masked)
- # Buildings / # Units / # Active contracts
- Expand arrow

### Building Card
- Name (bilingual) + city/district
- # Units / occupancy %
- Expand arrow

### Unit Card
- Unit number + type badge (Apartment / Villa / Office / Shop / Warehouse / Land / Other)
- Area (m²) + Monthly rent (SAR)
- Availability badge: **شاغرة / Available** (green) or **مؤجرة / Occupied** (red)
- Management % + Agent name + Ejar fee
- Expand arrow

### Contract Panel (inside Unit)
- Tenant name + contract # + payment cycle badge (3/6/12 months)
- Start date → End date
- Status: Active / Expired / Terminated
- Generated payment schedule (table of installments)
- [Terminate Contract] destructive action (confirm dialog)

---

## 6. Master Data Screens

All list screens follow the same pattern:

```
[Page Title]                    [+ Add New]
[Search bar]  [Filters]         [Export]
─────────────────────────────────────────
[Data table with sortable columns]
[Pagination: Prev ... 1 2 3 ... Next]
```

Each row has: `[Edit] [View] [Delete]` actions in a `⋮` kebab menu or inline buttons.

### 6.1 Owners (`/owners`)
**List columns:** Name (AR/EN) | National ID | Phone | # Buildings | # Units | # Contracts | Actions  
**Create/Edit form fields:**
- Name Arabic + Name English
- National ID (masked)
- Phone + Email
- Bank name + IBAN
- Notes (bilingual textarea)

### 6.2 Buildings (`/buildings`)
**Context:** Always linked to an Owner  
**List columns:** Name | Owner | City | District | # Units | Actions  
**Form fields:**
- Owner (dropdown, searchable)
- Name Arabic + Name English
- City + District (Arabic + English)
- Address (bilingual)
- Notes

### 6.3 Units (`/units`)
**List columns:** Unit # | Building | Owner | Type | Area | Rent (SAR) | Availability | Actions  
**Form fields:**
- Building (dropdown, searchable)
- Unit number + Type (select: 7 types)
- Area (m²) + Monthly rent (SAR)
- Management fee % + Agent fee % + Agent name
- Ejar platform fee (SAR fixed)
- Utility bill reference
- Availability toggle
- Notes

### 6.4 Tenants (`/tenants`)
**List columns:** Name | National ID | Phone | Email | Active Contracts | Actions  
**Form fields:**
- Name Arabic + Name English
- National ID
- Phone + Email
- Notes

### 6.5 Employees (`/employees`)
**List columns:** Name | Role | Linked User | Assigned Owners | Actions  
**Form fields:**
- Name Arabic + Name English
- Linked user account (select)
- Assigned owners (multi-select)
- Notes

---

## 7. Contracts (`/contracts`)

### Contract List
**Filters:** Status (all / active / expired / terminated) + Owner + Date range  
**Columns:** Contract # | Tenant | Unit / Building | Rent (SAR) | Cycle | Start | End | Status | Actions

**Status badges:**
- 🟢 Active — `--color-success`
- 🟡 Expiring soon (≤30 days) — `--color-warning`
- 🔴 Terminated — `--color-danger`
- ⚪ Expired — `--color-text-secondary`

### Create Contract Form
- Unit (dropdown — only available units)
- Tenant (dropdown or create inline)
- Contract number
- Start date + End date (date pickers)
- Monthly rent (SAR)
- Payment cycle: **3 months / 6 months / 12 months** (radio buttons with cycle amount preview)
- Notes

**On create:** System auto-generates the full payment schedule table — show a preview before submit.

### Contract Detail Page
- Header: contract # + status badge + tenant + unit + dates
- Fee breakdown table (per payment cycle):
  - Total rent collected
  - Owner share (rent minus management fee)
  - Management fee (%)
  - Agent fee (%)
  - Ejar platform fee (SAR)
- Payment schedule table (all installments)
- [Terminate Contract] button → confirmation modal → sets unit back to Available

---

## 8. Payments (`/payments`)

### Payment List
**Filters bar:**
```
[All] [Pending] [Paid] [Overdue]    Owner▼   Building▼   Date range
```
**Columns:** Tenant | Unit | Contract # | Amount (SAR) | Due Date | Status | Method | [Mark Paid]

**Status badges with visual urgency:**
- Pending (upcoming, gray)
- Overdue (past due date, red with days count)
- Paid (green, shows payment date + method)

### Mark Paid Flow (modal/drawer)
Fields: Payment method (Cash / Bank Transfer / Cheque / Online) | Receipt # | Notes | Paid date  
**On save:** Auto-creates payment split record showing:
- Amount to owner (SAR)
- Management fee to company (SAR)
- Agent fee (SAR)
- Ejar fee (SAR)

### Edit Payment (separate from mark-paid)
Fields: Amount | Due date | Notes

---

## 9. Expenses (`/expenses`)

### Expense List
**Filters:** Category | Owner | Building | Unit | Paid by | Date range  
**Columns:** Date | Description (AR/EN) | Category | Amount (SAR) | Paid by | Vendor | Owner/Building | Actions

**Category badges (color-coded):**
Maintenance | Utilities | Insurance | Legal | Marketing | Cleaning | Security | Government Fees | Other

### Create Expense Form
- Date
- Description Arabic + Description English
- Category (select)
- Amount (SAR)
- Paid by: Company / Owner / Tenant (radio)
- Vendor name
- Receipt / invoice number
- Link to: Owner (optional) → Building (optional) → Unit (optional)

---

## 10. Analytics Hub

All 5 analytics pages share this skeleton:

```
[Page title]  [Date range picker: This month / This quarter / YTD / Custom]
[KPI summary cards row]
[Charts row — 2 cols on desktop, 1 on mobile]
[Detail table]
```

Use placeholder chart components with realistic mock data. Chart types:

### 10.1 Company Dashboard (`/analytics/dashboard`)
- **KPIs:** Total portfolio value, Collection rate, Vacancy rate, Total management fees
- **Chart 1:** Revenue trend (line chart — 12 months)
- **Chart 2:** Occupancy by building (bar chart)
- **Chart 3:** Contract status breakdown (donut)
- **Chart 4:** Top 5 owners by portfolio size (horizontal bar)

### 10.2 Collections (`/analytics/collections`)
- **KPIs:** Total collected, Total overdue, Collection rate %, Average days to pay
- **Chart 1:** Aging buckets (0-30 / 31-60 / 61-90 / 90+ days) — stacked bar
- **Chart 2:** Monthly collections trend vs target — line
- **Table:** Owner-level receivables aging

### 10.3 Contract Intelligence (`/analytics/contracts-intel`)
- **KPIs:** Active contracts, Avg lease duration (months), Contracts expiring in 30/60/90 days
- **Chart 1:** Contract renewals vs new contracts — grouped bar
- **Chart 2:** Payment cycle distribution — donut (3m / 6m / 12m)
- **Chart 3:** Average rent by property type — bar
- **Table:** Contracts expiring soon with renewal action

### 10.4 Expenses Analytics (`/analytics/expenses`)
- **KPIs:** Total expenses (MTD), Largest category, Avg per unit
- **Chart 1:** Expenses by category — donut
- **Chart 2:** Expense trend by month — line
- **Chart 3:** Expenses by paid_by (company/owner/tenant) — stacked bar
- **Table:** Top expenses with drill-down

### 10.5 Employee KPIs (`/analytics/employee-performance`)
- **KPIs:** Active employees, Avg contracts managed, Avg collection rate
- **Table:** Per-employee stats — # Owners assigned, # Units, # Active contracts, Collection rate %, Overdue count

---

## 11. Owner Portal

> Separate view for owners — shows only their portfolio data.

### 11.1 Owner Dashboard (`/portal/dashboard`)
Admin can preview any owner via `?owner_id=`. Owners see only their own data.

**KPI Cards (owner-scoped):**
- My Buildings / My Units / Occupied / Vacancy rate
- Monthly revenue (SAR) / This month collected / Outstanding (SAR)

**Charts:**
- Revenue trend — line (12 months)
- Occupancy rate over time — line
- Expense breakdown — donut
- Payment status — donut (paid / pending / overdue)

**Financial Summary Table:**
Per-building breakdown with total rent, collected, management fee deducted, net owner income

### 11.2 Subscriptions (`/portal/subscription`)
**Plan cards (3 columns):**

| | Basic | Pro | Enterprise |
|---|---|---|---|
| Max Units | 10 | 50 | Unlimited |
| Price | SAR 99/mo | SAR 299/mo | SAR 799/mo |
| Portal Access | ✓ | ✓ | ✓ |
| Analytics | — | ✓ | ✓ |
| Priority Support | — | — | ✓ |

- Current plan highlighted with "Current Plan" badge
- [Upgrade] / [Downgrade] CTAs
- Subscription invoice history table
- [Cancel Subscription] — destructive, confirmation required

---

## 12. Admin: User Management (`/admin/users`)

**Admin only.** Link appears in sidebar only for admin role.

**Table columns:** Name | Email | Role badge | Status (Active/Inactive) | Last login | Actions

**Role badges:**
- `admin` — `--color-primary` (maroon)
- `manager` — blue
- `viewer` — gray
- `owner` — green

**Inline actions:**
- Change role (dropdown)
- Toggle active/inactive (toggle switch)
- No delete — deactivation only

---

## 13. Component Library (Design System)

Build these reusable components:

### Form Components
- `<Input>` — text, email, password, number (with SAR prefix for money fields)
- `<Select>` — single + multi-select with search
- `<DatePicker>` — supports Hijri ↔ Gregorian toggle
- `<Textarea>` — bilingual (AR label + EN label side by side)
- `<RadioGroup>` — payment cycle selector style
- `<Toggle>` — availability toggle, active/inactive

### Data Display
- `<KPICard>` — icon / label / value / trend arrow
- `<StatusBadge>` — Active / Pending / Overdue / Terminated / Paid / Available
- `<DataTable>` — sortable columns, pagination, row selection, kebab actions
- `<EmptyState>` — illustration + message + CTA for empty lists
- `<LoadingSkeleton>` — shimmer loading for cards and tables

### Layout
- `<PageHeader>` — title + breadcrumb + primary action button
- `<FilterBar>` — search + filter chips + date range
- `<ConfirmDialog>` — modal for destructive actions (terminate, delete)
- `<SideDrawer>` — slide-in panel for create/edit forms

### Charts (use Recharts / Chart.js placeholders)
- `<LineChart>` — revenue trend
- `<BarChart>` — occupancy, expenses
- `<DonutChart>` — status breakdowns
- `<StackedBar>` — aging, payment splits

---

## 14. Interaction Patterns

### Data Entry
1. All create/edit forms open in a **side drawer** (right-to-left slide-in for RTL, left-to-right for LTR)
2. Required fields marked with red asterisk *
3. Validation: inline error messages below fields on blur
4. SAR amounts: formatted with thousands separator, always show "SAR" prefix
5. Dates: formatted as DD/MM/YYYY with Gregorian default, optional Hijri display

### Table Actions
- Single row: hover reveals action buttons (Edit / View / ⋮ More)
- Bulk: checkbox column → bulk action bar appears at top (bulk delete confirmation)
- Row click: opens detail view or side drawer

### Navigation Feedback
- Active page highlighted in sidebar
- Breadcrumb: Home > Owners > Ahmed Al-Harbi > Building A > Unit 5
- Loading state: skeleton screens (not spinners) for table content

### Status & Urgency
- Overdue payments: red row highlight + days overdue count
- Expiring contracts: amber row highlight when ≤30 days
- Available units: green availability chip
- Occupied units: red availability chip

### Language / RTL
- All strings must have AR and EN variants
- Layout mirrors on language switch (sidebar moves, text aligns, icons flip)
- Numbers: Arabic-Indic numerals in AR mode (`١٢٣` not `123`) — configurable
- Date names: Arabic month names when locale = ar

---

## 15. Screen Inventory (Figma Frame Checklist)

### Public (no auth)
- [ ] Login
- [ ] Register

### Authenticated Shell
- [ ] Sidebar (expanded + collapsed + mobile states)
- [ ] Top bar

### Main
- [ ] Dashboard
- [ ] Properties drill-down (Owner → Building → Unit → Contract)

### Data Modules (each: List + Create + Edit + Detail)
- [ ] Owners
- [ ] Buildings
- [ ] Units
- [ ] Tenants
- [ ] Employees
- [ ] Contracts (+ terminate flow)
- [ ] Payments (list + mark-paid modal + edit)
- [ ] Expenses

### Analytics (5 pages)
- [ ] Company Dashboard
- [ ] Collections
- [ ] Contract Intelligence
- [ ] Expenses Analytics
- [ ] Employee KPIs

### Owner Portal
- [ ] Owner Dashboard
- [ ] Subscriptions (plan picker + invoice list)

### Admin
- [ ] User Management

### Shared / Overlay States
- [ ] Empty states (per module)
- [ ] Confirm delete dialog
- [ ] Confirm terminate dialog
- [ ] Loading skeleton
- [ ] Toast notification (success / error / warning)
- [ ] 404 / Unauthorized pages

---

## 16. Mobile Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| `< 640px` | Single column, hamburger sidebar |
| `640–1024px` | Collapsed icon sidebar, 2-col grids |
| `> 1024px` | Full expanded sidebar, multi-col grids |

KPI cards: 2-up on mobile, 3-up on tablet, 6-up on desktop  
Tables: horizontal scroll on mobile, with sticky first column (tenant/owner name)

---

## 17. Prototype Flow Priorities (Build in this order)

1. **Auth:** Login → Dashboard (establish shell)
2. **Dashboard:** KPI cards + overdue table + upcoming payments
3. **Properties drill-down:** Owner → Building → Unit → Contract
4. **Contracts:** List + create + payment schedule preview
5. **Payments:** List + mark-paid modal + split summary
6. **Owners + Tenants:** List + create forms
7. **Analytics:** Company dashboard (charts with mock data)
8. **Owner Portal:** Dashboard + subscription plans
9. **Expenses:** List + create
10. **Admin:** User management
11. **Mobile responsive** pass on all screens
12. **AR/RTL** pass on all screens

---

## 18. Sample Mock Data (use in prototype)

**Owners:** Ahmed Al-Harbi, Mohammed Al-Qahtani, Sara Al-Dosari  
**Buildings:** Riyadh Tower A, Jeddah Plaza, Dammam Center  
**Units:** Apt 101, Office 205, Shop G-3, Villa 7  
**Tenants:** Abdullah Al-Shammari, Fatima Al-Otaibi, Khalid Al-Ghamdi  
**Contract amounts:** SAR 25,000 – 180,000 / year  
**Cities:** Riyadh (الرياض), Jeddah (جدة), Dammam (الدمام), Khobar (الخبر)

---

*Generated for Muktasabat / Muktasabat Real Estate Co. — Based on actual codebase feature catalog + brand identity.*  
*Last updated: May 2026*
