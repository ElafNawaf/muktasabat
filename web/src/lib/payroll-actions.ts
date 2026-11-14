"use server";

import { revalidatePath } from "next/cache";

import { api, ApiError } from "./api";

export type R<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
async function call<T>(fn: () => Promise<T>): Promise<R<T>> {
  try {
    const data = await fn();
    revalidatePath("/[locale]/(app)/hr", "page");
    revalidatePath("/[locale]/(app)/hr/payroll/[id]", "page");
    revalidatePath("/[locale]/(app)/my-hr/payslips", "page");
    revalidatePath("/[locale]/(app)/approvals", "page");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ApiError) {
      const d = (e.body as { detail?: unknown } | undefined)?.detail;
      if (typeof d === "string") return { ok: false, error: d };
      if (Array.isArray(d) && d[0]?.msg) return { ok: false, error: String(d[0].msg).replace(/^Value error, /, "") };
      return { ok: false, error: `Error ${e.status}` };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
const B = "/api/v1/hr/payroll";
type Body = Record<string, unknown>;
export async function payCreateRun(b: Body) { return call(() => api.post<{ id: number }>(`${B}/runs`, b)); }
export async function payRecalc(id: number) { return call(() => api.post(`${B}/runs/${id}/recalculate`, {})); }
export async function payEditLine(run: number, line: number, b: Body) { return call(() => api.put(`${B}/runs/${run}/lines/${line}`, b)); }
export async function paySubmit(id: number) { return call(() => api.post(`${B}/runs/${id}/submit`, {})); }
export async function payApprove(id: number) { return call(() => api.post(`${B}/runs/${id}/approve`, {})); }
export async function payReturn(id: number, note: string) { return call(() => api.post(`${B}/runs/${id}/return`, { note })); }
export async function payPaid(id: number, payment_date: string) { return call(() => api.post(`${B}/runs/${id}/paid`, { payment_date })); }
export async function payCancel(id: number) { return call(() => api.post(`${B}/runs/${id}/cancel`, {})); }
export async function paySaveSettings(b: Body) { return call(() => api.put(`${B}/settings`, b)); }
export async function payCreateLoan(b: Body) { return call(() => api.post(`${B}/loans`, b)); }
export async function payDecideLoan(id: number, b: Body) { return call(() => api.post(`${B}/loans/${id}/decide`, b)); }
export async function payCancelLoan(id: number) { return call(() => api.post(`${B}/loans/${id}/cancel`, {})); }
export async function meRequestLoan(b: Body) { return call(() => api.post(`/api/v1/hr/me/loans`, b)); }
