"use server";

import { revalidatePath } from "next/cache";

import { api, ApiError } from "./api";

type R<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => {
  if (e instanceof ApiError) {
    const d = (e.body as { detail?: unknown } | undefined)?.detail;
    if (typeof d === "string") return { ok: false, error: d };
    if (Array.isArray(d) && d[0]?.msg) return { ok: false, error: String(d[0].msg).replace(/^Value error, /, "") };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Error" };
};

export async function setEmailReminders(on: boolean): Promise<R<null>> {
  try {
    await api.put(`/api/v1/tenant-portal/preferences`, { email_reminders: on });
    revalidatePath("/[locale]/tenant", "layout");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// ── Staff ────────────────────────────────────────────────────────────────

export async function inviteTenant(tenantId: number, email: string, locale: "ar" | "en"): Promise<R<{ username: string; invite_url: string }>> {
  try {
    const data = await api.post<{ username: string; invite_url: string }>(`/api/v1/tenant-portal/admin/tenants/${tenantId}/invite`, { email, locale });
    revalidatePath("/[locale]/tenant-access", "page");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeTenant(tenantId: number): Promise<R<null>> {
  try {
    await api.post(`/api/v1/tenant-portal/admin/tenants/${tenantId}/revoke`);
    revalidatePath("/[locale]/tenant-access", "page");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function reviewReport(reportId: number, decision: "confirm" | "reject", note?: string): Promise<R<null>> {
  try {
    await api.post(`/api/v1/tenant-portal/admin/reports/${reportId}/${decision}`, { note: note || null });
    revalidatePath("/[locale]/payments", "page");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}
