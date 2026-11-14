"use server";

import { revalidatePath } from "next/cache";

import { api, ApiError } from "./api";

export type RnResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(fn: () => Promise<T>): Promise<RnResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/[locale]/(app)/renewals", "page");
    revalidatePath("/[locale]/(owner)/owner/renewals", "page");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ApiError) {
      const d = (e.body as { detail?: unknown } | undefined)?.detail;
      if (typeof d === "string") return { ok: false, error: d };
      if (Array.isArray(d) && d[0]?.msg) return { ok: false, error: String(d[0].msg) };
      return { ok: false, error: `Error ${e.status}` };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const base = "/api/v1/renewals";
export async function rnGet(id: number, locale: string) { return call(() => api.get(`${base}/${id}?locale=${locale}`)); }
export async function rnAction(id: number, action: "assign" | "contact" | "offer" | "decision" | "agree" | "renewed" | "lost" | "notes", body: Record<string, unknown>, locale: string) {
  return call(() => api.post(`${base}/${id}/${action}?locale=${locale}`, body));
}
export async function ownerRnDecision(id: number, approve: boolean, note?: string) {
  return call(() => api.post(`/api/v1/owner-portal/renewals/${id}/decision`, { approve, note }));
}

export async function colActions(paymentId: number) {
  return call(() => api.get(`/api/v1/collections/${paymentId}/actions`));
}
export async function colAddAction(paymentId: number, body: Record<string, unknown>) {
  try {
    const data = await api.post(`/api/v1/collections/${paymentId}/actions`, body);
    revalidatePath("/[locale]/(app)/collections", "page");
    return { ok: true as const, data };
  } catch (e) {
    if (e instanceof ApiError) {
      const d = (e.body as { detail?: unknown } | undefined)?.detail;
      return { ok: false as const, error: typeof d === "string" ? d : `Error ${e.status}` };
    }
    return { ok: false as const, error: String(e) };
  }
}
