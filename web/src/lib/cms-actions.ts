"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { api, ApiError } from "./api";
import { CMS_TAG } from "./cms";
import type { CmsKind } from "./cms-fields";

export type CmsResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof ApiError) {
    const d = (e.body as { detail?: unknown } | undefined)?.detail;
    if (typeof d === "string") return { ok: false, error: d };
    if (Array.isArray(d) && d.length) {
      const f = d[0] as { msg?: string; loc?: unknown[] };
      const loc = Array.isArray(f.loc) ? f.loc.filter((x) => x !== "body").join(".") : "";
      return { ok: false, error: loc ? `${loc}: ${f.msg}` : f.msg ?? "Validation error" };
    }
    if (e.status === 403) return { ok: false, error: "You don't have permission to change website content." };
    return { ok: false, error: e.message };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
}

/** Public pages are ISR-cached under CMS_TAG — bust them after every write. */
function publish() {
  revalidateTag(CMS_TAG);
  revalidatePath("/sitemap.xml");
}

const KINDS = new Set(["services", "projects", "posts", "jobs", "testimonials", "partners"]);
function assertKind(kind: string): asserts kind is CmsKind {
  if (!KINDS.has(kind)) throw new Error("Unknown content type");
}

export async function cmsSave(kind: CmsKind, id: number | null, data: Record<string, unknown>): Promise<CmsResult<Record<string, unknown>>> {
  try {
    assertKind(kind);
    const out = id
      ? await api.put<Record<string, unknown>>(`/api/v1/cms/admin/${kind}/${id}`, data)
      : await api.post<Record<string, unknown>>(`/api/v1/cms/admin/${kind}`, data);
    publish();
    return { ok: true, data: out };
  } catch (e) {
    return fail(e);
  }
}

export async function cmsDelete(kind: CmsKind, id: number): Promise<CmsResult<null>> {
  try {
    assertKind(kind);
    await api.delete(`/api/v1/cms/admin/${kind}/${id}`);
    publish();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function cmsSaveSettings(payload: unknown): Promise<CmsResult<unknown>> {
  try {
    const out = await api.put(`/api/v1/cms/admin/settings`, payload);
    publish();
    return { ok: true, data: out };
  } catch (e) {
    return fail(e);
  }
}

export async function cmsUpdateLead(id: number, status: string, notes: string | null): Promise<CmsResult<unknown>> {
  try {
    const out = await api.put(`/api/v1/cms/admin/leads/${id}`, { status, notes });
    revalidatePath("/[locale]/website", "layout");
    return { ok: true, data: out };
  } catch (e) {
    return fail(e);
  }
}

export async function cmsDeleteLead(id: number): Promise<CmsResult<null>> {
  try {
    await api.delete(`/api/v1/cms/admin/leads/${id}`);
    revalidatePath("/[locale]/website", "layout");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function cmsUpdateApplication(id: number, status: string, notes: string | null): Promise<CmsResult<unknown>> {
  try {
    const out = await api.put(`/api/v1/cms/admin/applications/${id}`, { status, notes });
    revalidatePath("/[locale]/website", "layout");
    return { ok: true, data: out };
  } catch (e) {
    return fail(e);
  }
}

export async function cmsDeleteApplication(id: number): Promise<CmsResult<null>> {
  try {
    await api.delete(`/api/v1/cms/admin/applications/${id}`);
    revalidatePath("/[locale]/website", "layout");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export type DeliveryHealth = {
  email: { configured: boolean; region: string | null; from: string | null };
  storage: { bucket: string | null; mode: "s3" | "local"; ok: boolean; error?: string; fallback_local: boolean };
};

export async function cmsDeliveryHealth(): Promise<CmsResult<DeliveryHealth>> {
  try {
    return { ok: true, data: await api.get<DeliveryHealth>(`/api/v1/cms/admin/health`) };
  } catch (e) {
    return fail(e);
  }
}

export async function cmsTestEmail(to: string): Promise<CmsResult<{ ok: boolean; error?: string }>> {
  try {
    return { ok: true, data: await api.post<{ ok: boolean; error?: string }>(`/api/v1/cms/admin/health/test-email`, { to }) };
  } catch (e) {
    return fail(e);
  }
}
