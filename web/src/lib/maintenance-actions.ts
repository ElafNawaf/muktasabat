"use server";

import { revalidatePath } from "next/cache";

import { api, ApiError } from "./api";

export type WOResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof ApiError) {
    const d = (e.body as { detail?: unknown } | undefined)?.detail;
    if (typeof d === "string") return { ok: false, error: d };
    if (Array.isArray(d) && d[0]?.msg) return { ok: false, error: String(d[0].msg) };
    return { ok: false, error: `Error ${e.status}` };
  }
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

async function call<T>(fn: () => Promise<T>): Promise<WOResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/[locale]/(app)/maintenance", "page");
    revalidatePath("/[locale]/(owner)/owner/maintenance", "page");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

const base = "/api/v1/maintenance/work-orders";
export async function woCreate(input: Record<string, unknown>) { return call(() => api.post(base, input)); }
export async function woGet(id: number, locale: string) { return call(() => api.get(`${base}/${id}?locale=${locale}`)); }
export async function woAssign(id: number, input: Record<string, unknown>) { return call(() => api.post(`${base}/${id}/assign`, input)); }
export async function woEstimate(id: number, amount: number, charge_to: string, note?: string) { return call(() => api.post(`${base}/${id}/estimate`, { amount, charge_to, note })); }
export async function woDecision(id: number, approve: boolean, note?: string) { return call(() => api.post(`${base}/${id}/decision`, { approve, note })); }
export async function woStart(id: number) { return call(() => api.post(`${base}/${id}/start`, {})); }
export async function woComplete(id: number, actual_cost: number, resolution: string, post_expense: boolean) { return call(() => api.post(`${base}/${id}/complete`, { actual_cost, resolution, post_expense })); }
export async function woClose(id: number, rating?: number) { return call(() => api.post(`${base}/${id}/close${rating ? `?rating=${rating}` : ""}`, {})); }
export async function woCancel(id: number, note: string) { return call(() => api.post(`${base}/${id}/cancel`, { note })); }
export async function woNote(id: number, note: string) { return call(() => api.post(`${base}/${id}/notes`, { note })); }
export async function ownerWoDecision(id: number, approve: boolean, note?: string) {
  return call(() => api.post(`/api/v1/owner-portal/work-orders/${id}/decision`, { approve, note }));
}
