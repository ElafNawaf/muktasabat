"use server";

import { api, ApiError } from "./api";

type R<T> = { ok: true; data: T } | { ok: false; error: string };

async function get<T>(path: string): Promise<R<T>> {
  try {
    return { ok: true, data: await api.get<T>(path) };
  } catch (e) {
    if (e instanceof ApiError) {
      const d = (e.body as { detail?: unknown } | undefined)?.detail;
      return { ok: false, error: typeof d === "string" ? d : `Error ${e.status}` };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function paymentPreview(id: number, locale: string) {
  return get<Record<string, unknown>>(`/api/v1/payments/${id}/preview?locale=${locale === "en" ? "en" : "ar"}`);
}
export async function contractPreview(id: number, locale: string) {
  return get<Record<string, unknown>>(`/api/v1/contracts/${id}/preview?locale=${locale === "en" ? "en" : "ar"}`);
}
