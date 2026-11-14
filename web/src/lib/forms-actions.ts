"use server";

import { revalidatePath } from "next/cache";

import { api, ApiError } from "./api";
import type { CustomField } from "./forms-types";

type R<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => {
  if (e instanceof ApiError) {
    const d = (e.body as { detail?: unknown } | undefined)?.detail;
    if (typeof d === "string") return { ok: false, error: d };
    if (Array.isArray(d) && d[0]?.msg) return { ok: false, error: `${(d[0].loc || []).slice(-2).join(".")}: ${d[0].msg}` };
    return { ok: false, error: `Error ${e.status}` };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Error" };
};
async function run<T>(fn: () => Promise<T>, revalidate = false): Promise<R<T>> {
  try {
    const data = await fn();
    if (revalidate) {
      revalidatePath("/[locale]/forms", "page");
      revalidatePath("/[locale]/approvals", "page");
    }
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}
const lc = (l: string) => (l === "en" ? "en" : "ar");

export async function formGet(entity: string) { return run(() => api.get<Record<string, unknown>>(`/api/v1/forms/${entity}`)); }
export async function formRequest(entity: string, fields: CustomField[], reason: string, locale: string) {
  return run(() => api.post(`/api/v1/forms/${entity}/requests?locale=${lc(locale)}`, { fields, reason }), true);
}
export async function formApprove(id: number, note: string | undefined, locale: string) { return run(() => api.post(`/api/v1/forms/requests/${id}/approve?locale=${lc(locale)}`, { note: note || null }), true); }
export async function formReject(id: number, note: string) { return run(() => api.post(`/api/v1/forms/requests/${id}/reject`, { note }), true); }
export async function formCancel(id: number) { return run(() => api.post(`/api/v1/forms/requests/${id}/cancel`, {}), true); }
export async function customValuesGet(entity: string, id: number) {
  return run(() => api.get<{ fields: CustomField[]; values: Record<string, unknown> }>(`/api/v1/custom-fields/${entity}/${id}`));
}
export async function customSchema(entity: string) { return run(() => api.get<{ fields: CustomField[] }>(`/api/v1/custom-fields/${entity}`)); }
export async function customValuesSave(entity: string, id: number, values: Record<string, unknown>, locale: string) {
  return run(() => api.put<{ fields: CustomField[]; values: Record<string, unknown> }>(`/api/v1/custom-fields/${entity}/${id}?locale=${lc(locale)}`, { values }));
}
