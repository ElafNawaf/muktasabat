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
