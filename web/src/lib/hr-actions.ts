"use server";

import { revalidatePath } from "next/cache";

import { api, ApiError } from "./api";

export type HrResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(fn: () => Promise<T>, revalidate = true): Promise<HrResult<T>> {
  try {
    const data = await fn();
    if (revalidate) {
      revalidatePath("/[locale]/(app)/hr", "page");
      revalidatePath("/[locale]/(app)/my-hr", "page");
      revalidatePath("/[locale]/(app)/approvals", "page");
    }
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

const B = "/api/v1/hr";
export type Loc = { lat?: number; lng?: number; accuracy?: number; error?: string };
export async function hrCheckIn(loc: Loc = {}) { return call(() => api.post(`${B}/me/check-in`, loc)); }
export async function hrCheckOut(loc: Loc = {}) { return call(() => api.post(`${B}/me/check-out`, loc)); }
export async function hrPresence() { return call(() => api.get(`${B}/me/presence`), false); }
export async function hrPing(loc: Loc) { return call(() => api.post(`${B}/me/ping`, loc), false); }
export async function hrMyAttendance(month: string) { return call(() => api.get(`${B}/me/attendance?month=${month}`), false); }
export async function hrCreate(body: Record<string, unknown>, locale: string) { return call(() => api.post(`${B}/requests?locale=${locale}`, body)); }
export async function hrGet(id: number, locale: string) { return call(() => api.get(`${B}/requests/${id}?locale=${locale}`), false); }
export async function hrCancel(id: number, locale: string) { return call(() => api.post(`${B}/requests/${id}/cancel?locale=${locale}`, {})); }
export async function hrDecide(id: number, approve: boolean, note: string | undefined, locale = "ar") {
  return call(() => api.post(`${B}/requests/${id}/decision?locale=${locale}`, { approve, note }));
}
export async function hrBook(id: number, body: { booking_ref: string; actual_cost?: number | null; note?: string | null }, locale: string) {
  return call(() => api.post(`${B}/requests/${id}/book?locale=${locale}`, body));
}
export async function hrSaveEmployee(userId: number, body: Record<string, unknown>) { return call(() => api.put(`${B}/employees/${userId}`, body)); }
export async function hrAttendanceDay(day: string, locale: string) { return call(() => api.get(`${B}/attendance?day=${day}&locale=${locale}`), false); }
export async function hrAttendanceReport(month: string, locale: string) { return call(() => api.get(`${B}/attendance/report?month=${month}&locale=${locale}`), false); }
export async function hrAttendanceUser(userId: number, month: string) { return call(() => api.get(`${B}/attendance/${userId}?month=${month}`), false); }
export async function hrSetAttendance(body: Record<string, unknown>) { return call(() => api.put(`${B}/attendance`, body)); }
export async function hrSaveSettings(body: Record<string, unknown>) { return call(() => api.put(`${B}/settings`, body)); }
