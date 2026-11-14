/** Owner-portal data layer (server-side). Every call is scoped by the API to the
 *  logged-in owner; staff previews pass `as` (owner id) which the API checks
 *  against the owners.view permission. */
import { api } from "./api";

export type OwnerMe = { owner_id: number; name: string; email?: string | null; phone?: string | null; bank_name?: string | null; iban_last4?: string | null; buildings: number };

export type Overview = {
  year: number;
  as_of: string;
  kpis: {
    buildings: number; units: number; occupied_units: number; vacant_units: number; occupancy_rate: number;
    active_leases: number; annual_rent_roll: number; gross_collected: number; management_fees: number;
    agent_fees: number; ejar_fees: number; expenses: number; net_income: number; billed_to_date: number;
    collection_rate: number | null; overdue_amount: number; overdue_count: number; upcoming_amount: number; upcoming_count: number;
  };
  months: { month: number; due: number; collected: number; fees: number; expenses: number; net: number }[];
  buildings: { id: number; name: string; city: string; district: string; units: number; occupied: number; occupancy: number; collected: number; net: number; outstanding: number; image?: string | null }[];
  expiring: { contract_id: number; contract_number: string; building: string; unit: string; tenant?: string | null; end_date: string; days_left: number; annual_rent: number }[];
  overdue: { building: string; unit: string; tenant?: string | null; due_date: string; days_late: number; amount: number }[];
};

export type OwnerProperty = {
  id: number; name: string; city: string; district: string; property_type?: string | null; deed_number?: string | null;
  lat?: number | null; lng?: number | null; images: string[]; occupied: number;
  units: { id: number; number: string; type?: string | null; usage?: string | null; area_sqm?: number | null; listed_rent: number; occupied: boolean; tenant?: string | null; lease_end?: string | null; lease_rent?: number | null; ejar_status?: string | null }[];
};

export type OwnerContracts = {
  leases: { id: number; contract_number: string; type: string; building: string; unit: string; tenant?: string | null; start_date: string; end_date: string; active: boolean; status: string; total_rent: number; payment_type?: string | null; payments_paid: number; payments_total: number; ejar_status?: string | null; ejar_contract_number?: string | null }[];
  management: { id: number; contract_number?: string | null; start_date: string; end_date: string; status: string; fee_type: string; fee_percentage: number; fee_fixed_amount: number; maintenance_limit_amount: number; ejar_status?: string | null }[];
};

export type OwnerPayment = { id: number; due_date: string; paid_date?: string | null; building: string; unit: string; tenant?: string | null; amount: number; fees: number; net: number; status: "paid" | "overdue" | "upcoming" };

export type Statement = {
  owner: { name: string; bank_name?: string | null; iban_last4?: string | null };
  period_start: string; period_end: string;
  income: { date: string; building: string; unit: string; tenant?: string | null; receipt?: string | null; gross: number; management_fee: number; agent_fee: number; ejar_fee: number; net: number }[];
  expenses: { date: string; category: string; description: string; building?: string | null; vendor?: string | null; amount: number; paid_by: string; deducted: boolean }[];
  totals: { gross: number; management_fee: number; agent_fee: number; ejar_fee: number; expenses: number; net_payable: number };
};

export type CollectState = "paid" | "reported" | "overdue" | "due_soon" | "upcoming";
export type TransferState = "not_paid" | "pending" | "late" | "transferred";

export type LedgerItem = {
  id: number; contract_id: number; contract_number: string; building_id: number; building: string; unit_id: number; unit: string;
  tenant?: string | null; seq: number; of: number; due_date: string; days: number; status: CollectState;
  paid_date?: string | null; method?: string | null; receipt?: string | null;
  amount: number; management_fee: number; agent_fee: number; ejar_fee: number; fees: number; net: number;
  transfer: { state: TransferState; due_date?: string | null; date?: string | null; reference?: string | null };
};

export type Ledger = {
  as_of: string;
  items: LedgerItem[];
  totals: { due: number; collected: number; outstanding: number; upcoming: number; fees: number; owner_share: number; transferred: number; awaiting_transfer: number; late_transfers: number };
  buildings: { id: number; name: string }[];
};

export type PropertyDetail = {
  id: number; name: string; property_type?: string | null; city?: string | null; district?: string | null; address?: string | null;
  deed_number?: string | null; deed_date?: string | null; lat?: number | null; lng?: number | null; images: string[];
  kpis: { units: number; occupied: number; occupancy: number; annual_rent_roll: number; collected_12m: number; fees_12m: number; expenses_12m: number; net_12m: number; overdue: number };
  units: {
    id: number; number: string; type?: string | null; usage?: string | null; area_sqm?: number | null; rooms?: number | null; bathrooms?: number | null;
    furnished?: boolean | null; listed_rent: number; occupied: boolean; vacant_days?: number | null;
    lease: null | { id: number; contract_number: string; tenant?: string | null; start_date: string; end_date: string; days_left: number; annual_rent: number; ejar_status?: string | null };
    next_due: null | { date: string; amount: number; status: CollectState };
    overdue: number; collected_12m: number;
    history: { id: number; contract_number: string; tenant?: string | null; start_date: string; end_date: string; annual_rent: number }[];
  }[];
  expenses: { date: string; category: string; description: string; unit?: string | null; vendor?: string | null; amount: number; paid_by: string; deducted: boolean; receipt?: string | null }[];
  work_orders: { id: number; number: string; title: string; category?: string | null; priority?: string | null; status: string; unit?: string | null; created_at: string; completed_at?: string | null; estimate: number; cost: number; charge_to?: string | null }[];
};

export type LeaseDetail = {
  id: number; contract_number: string; ejar_contract_number?: string | null; ejar_status?: string | null; type: string; status?: string | null; active: boolean;
  building_id: number; building: string; unit: string; tenant: null | { name: string; type?: string | null; nationality?: string | null };
  start_date: string; end_date: string; days_left: number; annual_rent: number; total_amount: number; payment_type?: string | null; payment_count: number;
  management_pct: number; agent_pct: number; ejar_fee: number;
  totals: { scheduled: number; collected: number; outstanding: number; fees: number; owner_share: number; transferred: number };
  schedule: LedgerItem[];
};

export type ActivityEvent = {
  at: string;
  kind: "collected" | "transferred" | "missed" | "lease_started" | "lease_ended" | "expense" | "work_order";
  amount?: number; net?: number; tenant?: string | null; building?: string | null; building_id?: number | null; unit?: string | null; contract_id?: number;
  reference?: string | null; deducted?: boolean; category?: string; description?: string; title?: string; status?: string; number?: string;
};

function q(locale: string, as?: string | null, extra: Record<string, string | number | undefined | null> = {}) {
  const p = new URLSearchParams({ locale });
  if (as && /^\d+$/.test(as)) p.set("as_owner", as);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return p.toString();
}

export const ownerApi = {
  me: (locale: string, as?: string | null) => api.get<OwnerMe>(`/api/v1/owner-portal/me?${q(locale, as)}`),
  overview: (locale: string, year: number, as?: string | null) => api.get<Overview>(`/api/v1/owner-portal/overview?${q(locale, as, { year })}`),
  properties: (locale: string, as?: string | null) => api.get<OwnerProperty[]>(`/api/v1/owner-portal/properties?${q(locale, as)}`),
  contracts: (locale: string, as?: string | null) => api.get<OwnerContracts>(`/api/v1/owner-portal/contracts?${q(locale, as)}`),
  payments: (locale: string, year: number, as?: string | null) => api.get<OwnerPayment[]>(`/api/v1/owner-portal/payments?${q(locale, as, { year })}`),
  renewals: (locale: string, as?: string | null) => api.get<OwnerRenewal[]>(`/api/v1/owner-portal/renewals?${q(locale, as)}`),
  workOrders: (locale: string, as?: string | null) => api.get<OwnerWorkOrder[]>(`/api/v1/owner-portal/work-orders?${q(locale, as)}`),
  ledger: (locale: string, f: { year?: number | null; building?: number | null; contract?: number | null }, as?: string | null) =>
    api.get<Ledger>(`/api/v1/owner-portal/ledger?${q(locale, as, { year: f.year, building_id: f.building, contract_id: f.contract })}`),
  property: (locale: string, id: number, as?: string | null) => api.get<PropertyDetail>(`/api/v1/owner-portal/properties/${id}?${q(locale, as)}`),
  lease: (locale: string, id: number, as?: string | null) => api.get<LeaseDetail>(`/api/v1/owner-portal/contracts/${id}?${q(locale, as)}`),
  activity: (locale: string, as?: string | null) => api.get<ActivityEvent[]>(`/api/v1/owner-portal/activity?${q(locale, as)}`),
  statement: (locale: string, year: number, month: number | null, as?: string | null) =>
    api.get<Statement>(`/api/v1/owner-portal/statement?${q(locale, as, { year, month })}`),
};

export const L = (locale: string, ar: string, en: string) => (locale === "ar" ? ar : en);

export function money(locale: string, v: number | null | undefined, digits = 0) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(v ?? 0);
}

export function num(locale: string, v: number | null | undefined, digits = 0) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: digits }).format(v ?? 0);
}

export function day(locale: string, iso?: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium" }).format(new Date(iso));
}

export const MONTHS = (locale: string) =>
  Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { month: "short" }).format(new Date(2026, i, 1)));

export type OwnerWorkOrder = {
  id: number; number: string; title: string; description?: string | null; category: string; priority: string; status: string;
  building: string; unit?: string | null; assignee?: string | null; vendor_name?: string | null;
  estimate_amount?: number | null; actual_cost?: number | null; charge_to: string; approval_limit?: number | null;
  approved_by?: string | null; decision_note?: string | null; created_at: string; completed_at?: string | null; resolution?: string | null;
};

export type OwnerRenewal = {
  id: number; contract_number?: string | null; stage: string; tenant_intent: string; end_date: string; days_left: number;
  building?: string | null; unit?: string | null; tenant?: string | null; assignee?: string | null;
  current_rent: number; proposed_rent?: number | null; change_pct?: number | null;
  owner_decision_by?: string | null; owner_decision_note?: string | null; lost_reason?: string | null; new_contract_number?: string | null;
};

const UNIT_TYPES: Record<string, [string, string]> = {
  apartment: ["شقة", "Apartment"], villa: ["فيلا", "Villa"], studio: ["استوديو", "Studio"], floor: ["دور", "Floor"],
  duplex: ["دوبلكس", "Duplex"], office: ["مكتب", "Office"], shop: ["محل", "Shop"], showroom: ["معرض", "Showroom"],
  warehouse: ["مستودع", "Warehouse"], land: ["أرض", "Land"], room: ["غرفة", "Room"], building: ["مبنى", "Building"],
};
/** Human label for a unit type code ("apartment" → "شقة"). Unknown values pass through. */
export function unitType(locale: string, v?: string | null) {
  if (!v) return null;
  const m = UNIT_TYPES[v.toLowerCase()];
  return m ? (locale === "ar" ? m[0] : m[1]) : v;
}
