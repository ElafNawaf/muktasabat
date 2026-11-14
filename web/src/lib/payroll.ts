// Payroll types and labels (server + client safe).
type Pair = readonly [string, string];

export type PayLine = {
  id: number; user_id: number; name?: string | null; employee_no?: string | null; job_title?: string | null; id_number?: string | null; iban?: string | null;
  bank?: string | null; bank_code?: string | null; saudi: boolean; gosi_scheme?: string | null; basic: number; housing: number; transport: number;
  other_allowance: number; other_allowance_label?: string | null; overtime_hours: number; overtime_amount: number; additions: number; payable_days: number;
  absent_days: number; unpaid_days: number; late_minutes: number; proration_deduction: number; absence_deduction: number; unpaid_deduction: number;
  late_deduction: number; gosi_base: number; gosi_employee: number; gosi_employer: number; loan_deduction: number;
  loans: { loan_id: number; number: string; amount: number; remaining: number }[]; other_deductions: number; gross: number; total_deductions: number; net: number;
  adjustments: { kind: "addition" | "deduction"; label: string; amount: number }[]; overrides?: Record<string, number | boolean>;
  warnings: { code: string; label: string }[]; excluded: boolean; note?: string | null;
};
export type PayTotals = {
  employees: number; excluded: number; basic: number; allowances: number; overtime: number; additions: number; gross: number; deductions: number;
  gosi_employee: number; gosi_employer: number; loans: number; net: number; cost: number; warnings: number;
};
export type PayRun = {
  id: number; company_id: number; company?: string | null; company_code?: string | null; company_color?: string | null; month: string; status: string;
  payment_date?: string | null; notes?: string | null; created_by?: string | null; calculated_at?: string | null; submitted_by?: string | null;
  submitted_by_id?: number | null; submitted_at?: string | null; approved_by?: string | null; approved_at?: string | null; returned_note?: string | null;
  paid_by?: string | null; paid_at?: string | null; totals: PayTotals;
};
export type PayRunFull = PayRun & { lines: PayLine[]; missing: { user_id: number; name: string }[]; can: { edit: boolean; approve: boolean; self_submitted: boolean } };
export type Loan = {
  id: number; number: string; user_id: number; employee: string; kind: "advance" | "loan"; amount: number; installments: number; monthly_amount: number;
  start_month: string; status: string; reason?: string | null; consent: boolean; requested_by_self: boolean; created_by?: string | null; decided_by?: string | null;
  decided_at?: string | null; decision_note?: string | null; repaid: number; remaining: number; created_at: string; repayments: { month: string; amount: number; note?: string | null }[];
};
export type PaySettings = {
  days_per_month: number; hours_per_day: number; deduct_absence: boolean; deduct_unpaid_leave: boolean; deduct_late: boolean; late_free_minutes: number;
  overtime_premium: number; gosi_cap: number; gosi_old_employee: number; gosi_old_employer: number; gosi_hazards: number; gosi_saned: number;
  payment_day: number; updated_by?: string | null; gosi_new_annuities_now: number;
};
export type Payslip = PayLine & { month: string; status: string; payment_date?: string | null; run_id: number; is_self: boolean;
  company: { name_ar: string; name_en?: string | null; cr?: string | null; color?: string | null; logo_url?: string | null; is_holding?: boolean; code?: string | null } | null };

export const PAY = {
  status: { draft: ["مسودة", "Draft"], submitted: ["بانتظار الاعتماد", "Awaiting approval"], approved: ["معتمد", "Approved"], paid: ["مصروف", "Paid"], cancelled: ["ملغى", "Cancelled"] } as Record<string, Pair>,
  loanStatus: { pending: ["بانتظار القرار", "Pending"], approved: ["قيد السداد", "Repaying"], rejected: ["مرفوض", "Declined"], cancelled: ["ملغى", "Cancelled"], settled: ["مسدد", "Settled"] } as Record<string, Pair>,
  kind: { advance: ["سلفة", "Salary advance"], loan: ["قرض", "Loan"] } as Record<string, Pair>,
  scheme: { old: ["سعودي — النظام الحالي", "Saudi — existing scheme"], new: ["سعودي — النظام الجديد", "Saudi — new law"], expat: ["غير سعودي", "Non-Saudi"], none: ["غير مشمول", "Not covered"] } as Record<string, Pair>,
};
export const pl = (ar: boolean, m: Record<string, Pair>, k?: string | null) => (k && m[k] ? m[k][ar ? 0 : 1] : k ?? "—");
export const sar = (ar: boolean, n?: number | null, frac = 2) => (n == null ? "—" : `${new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { minimumFractionDigits: frac, maximumFractionDigits: frac }).format(n)} ${ar ? "ر.س" : "SAR"}`);
export const monthLabel = (ar: boolean, m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { month: "long", year: "numeric" });
