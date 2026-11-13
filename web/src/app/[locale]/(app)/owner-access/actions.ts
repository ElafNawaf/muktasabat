"use server";

import { revalidatePath } from "next/cache";

import { api, ApiError } from "@/lib/api";

type R<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => {
  if (e instanceof ApiError) {
    const d = (e.body as { detail?: unknown } | undefined)?.detail;
    if (typeof d === "string") return { ok: false, error: d };
    if (Array.isArray(d) && d[0]?.msg) return { ok: false, error: String(d[0].msg) };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Error" };
};

export async function inviteOwner(ownerId: number, email: string, locale: "ar" | "en"): Promise<R<{ username: string; invite_url: string }>> {
  try {
    const data = await api.post<{ username: string; invite_url: string }>(`/api/v1/owner-portal/admin/owners/${ownerId}/invite`, { email, locale });
    revalidatePath("/[locale]/owner-access", "page");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeOwner(ownerId: number): Promise<R<null>> {
  try {
    await api.post(`/api/v1/owner-portal/admin/owners/${ownerId}/revoke`);
    revalidatePath("/[locale]/owner-access", "page");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}
