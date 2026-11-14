/** Tenant-portal data layer (server-side). The API scopes everything to the
 *  logged-in tenant; staff previews pass `as` (tenant id), checked against
 *  tenants.view, and are read-only. */
import { api } from "./api";

export type PayState = "paid" | "reported" | "overdue" | "due_soon" | "upcoming";

export type TenantPayment = {
  id: number;
  contract_id: number;
  contract_number: string;
  property?: string | null;
  unit?: string | null;
  seq: number;
  of: number;
  amount: number;
  due_date: string;
  days: number;
  state: PayState;
  paid_date?: string | null;
  method?: string | null;
  receipt_number?: string | null;
  report: null | {
    id: number;
    status: "pending" | "confirmed" | "rejected";
    paid_on: string;
    amount: number;
    method: string;
    reference?: string | null;
    sent_at: string;
    review_note?: string | null;
  };
};

export type TenantContract = {
  id: number;
  contract_number: string;
  ejar_contract_number?: string | null;
  ejar_status?: string | null;
  type: string;
  state: "active" | "upcoming" | "ended";
  status?: string | null;
  property?: string | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  unit?: string | null;
  unit_type?: string | null;
  start_date: string;
  end_date: string;
  days_left: number;
  total_amount: number;
  annual_rent: number;
  payment_type?: string | null;
  payment_count: number;
  paid_amount: number;
  scheduled_amount: number;
  remaining_amount: number;
  payments_paid: number;
  payments_total: number;
  next_payment: TenantPayment | null;
};

export type TenantContractDetail = TenantContract & {
  rent_amount: number;
  services_amount: number;
  insurance_amount: number;
  vat_amount: number;
  electricity_on_tenant: boolean;
  water_on_tenant: boolean;
  electricity_meter_number?: string | null;
  water_meter_number?: string | null;
  electricity_amount: number;
  water_amount: number;
  lat?: number | null;
  lng?: number | null;
  attachments: { name: string; url: string; type?: string | null }[];
  payments: TenantPayment[];
};

export type TenantMe = { tenant_id: number; name: string; phone?: string | null; email?: string | null; email_reminders: boolean; preview: boolean };

export type TenantOverview = {
  as_of: string;
  next: TenantPayment | null;
  kpis: { active_contracts: number; overdue_amount: number; overdue_count: number; remaining_amount: number; paid_amount: number; reported_count: number };
  upcoming: TenantPayment[];
  recent_paid: TenantPayment[];
  contracts: TenantContract[];
};

function q(locale: string, as?: string | null) {
  const p = new URLSearchParams({ locale });
  if (as && /^\d+$/.test(as)) p.set("as_tenant", as);
  return p.toString();
}

export const tenantApi = {
  me: (locale: string, as?: string | null) => api.get<TenantMe>(`/api/v1/tenant-portal/me?${q(locale, as)}`),
  overview: (locale: string, as?: string | null) => api.get<TenantOverview>(`/api/v1/tenant-portal/overview?${q(locale, as)}`),
  contracts: (locale: string, as?: string | null) => api.get<TenantContract[]>(`/api/v1/tenant-portal/contracts?${q(locale, as)}`),
  contract: (locale: string, id: number, as?: string | null) => api.get<TenantContractDetail>(`/api/v1/tenant-portal/contracts/${id}?${q(locale, as)}`),
  payments: (locale: string, as?: string | null) => api.get<TenantPayment[]>(`/api/v1/tenant-portal/payments?${q(locale, as)}`),
};

export const STATE_LABEL: Record<PayState, [string, string]> = {
  paid: ["مدفوعة", "Paid"],
  reported: ["قيد التأكيد", "Being confirmed"],
  overdue: ["متأخرة", "Overdue"],
  due_soon: ["مستحقة قريباً", "Due soon"],
  upcoming: ["قادمة", "Upcoming"],
};

export const STATE_TONE: Record<PayState, string> = {
  paid: "is-ok",
  reported: "is-info",
  overdue: "is-warn",
  due_soon: "is-soon",
  upcoming: "",
};

export const METHOD_LABEL: Record<string, [string, string]> = {
  bank_transfer: ["تحويل بنكي", "Bank transfer"],
  cash: ["نقداً", "Cash"],
  cheque: ["شيك", "Cheque"],
};

/** "in 12 days" / "today" / "3 days late" */
export function when(locale: string, days: number) {
  const ar = locale === "ar";
  const f = (v: number) => new Intl.NumberFormat(ar ? "ar-SA" : "en-US").format(v);
  if (days === 0) return ar ? "اليوم" : "today";
  if (days === 1) return ar ? "غداً" : "tomorrow";
  if (days > 0) return ar ? `بعد ${f(days)} ${days <= 10 ? "أيام" : "يوماً"}` : `in ${f(days)} days`;
  const n = -days;
  return ar ? `متأخرة ${f(n)} ${n <= 10 ? "أيام" : "يوماً"}` : `${f(n)} day${n === 1 ? "" : "s"} late`;
}
