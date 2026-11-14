"use server";

import { revalidatePath } from "next/cache";

import { api, ApiError } from "./api";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof ApiError) {
    const d = (e.body as { detail?: unknown } | undefined)?.detail;
    if (typeof d === "string") return { ok: false, error: d };
    if (Array.isArray(d) && d[0] && typeof d[0] === "object") {
      const m = (d[0] as { msg?: string }).msg;
      if (m) return { ok: false, error: m.replace(/^Value error, /, "") };
    }
    return { ok: false, error: `Request failed (${e.status})` };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

// ── Workflow catalogue ──────────────────────────────────────────────────────

export type ApproverSpec = { type: string; value?: string | number | null };
export type WorkflowStep = {
  key?: string;
  label_ar?: string | null;
  label_en?: string | null;
  approver: ApproverSpec;
  when: Record<string, unknown>;
  sla_hours?: number | null;
  escalate_to?: ApproverSpec | null;
  approver_label?: string;
  escalate_label?: string | null;
};
export type Workflow = {
  key: string;
  configurable: true;
  name: string;
  name_ar: string;
  name_en: string;
  icon?: string;
  module?: string;
  description?: string;
  amount_label?: string;
  conditions: string[];
  approver_types: string[];
  enabled: boolean;
  steps: WorkflowStep[];
  notify_emails?: string | null;
  customised: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
  pending: number;
  overdue: number;
};
export type FixedWorkflow = { key: string; configurable: false; name: string; icon: string; who: string };
export type WorkflowCatalogue = {
  workflows: Workflow[];
  fixed: FixedWorkflow[];
  options: {
    roles: { value: string; label: string }[];
    users: { value: number; label: string; role: string }[];
    modules: string[];
    kinds: string[];
  };
};

export async function loadWorkflows(locale: string): Promise<Result<WorkflowCatalogue>> {
  try {
    return { ok: true, data: await api.get<WorkflowCatalogue>(`/api/v1/workflows?locale=${locale}`) };
  } catch (e) {
    return fail(e);
  }
}

export async function saveWorkflow(
  key: string,
  body: { enabled: boolean; steps: WorkflowStep[]; notify_emails?: string | null },
  locale: string,
): Promise<Result<Workflow>> {
  try {
    const steps = body.steps.map(({ approver_label: _a, escalate_label: _e, ...s }) => s);
    return { ok: true, data: await api.put<Workflow>(`/api/v1/workflows/${key}?locale=${locale}`, { ...body, steps }) };
  } catch (e) {
    return fail(e);
  }
}

export async function resetWorkflow(key: string, locale: string): Promise<Result<Workflow>> {
  try {
    return { ok: true, data: await api.post<Workflow>(`/api/v1/workflows/${key}/reset?locale=${locale}`, {}) };
  } catch (e) {
    return fail(e);
  }
}

// ── Recommended roles & per-user permissions ────────────────────────────────

export type PermCell = Partial<Record<"view" | "create" | "edit" | "delete" | "approve", number>>;
export type PermMatrix = Record<string, PermCell>;
export type RecommendedRole = { why_en: string; why_ar: string; permissions: PermMatrix };

export async function loadRecommendedRoles(): Promise<Result<Record<string, RecommendedRole>>> {
  try {
    return { ok: true, data: await api.get<Record<string, RecommendedRole>>("/api/v1/roles/recommended") };
  } catch (e) {
    return fail(e);
  }
}

export type UserPermissions = {
  user_id: number;
  role: string;
  is_admin: boolean;
  role_permissions: PermMatrix;
  overrides: PermMatrix;
  effective: PermMatrix;
};

export async function loadUserPermissions(id: number): Promise<Result<UserPermissions>> {
  try {
    return { ok: true, data: await api.get<UserPermissions>(`/api/v1/auth/admin/users/${id}/permissions`) };
  } catch (e) {
    return fail(e);
  }
}

export async function saveUserPermissions(id: number, overrides: PermMatrix): Promise<Result<{ overrides: PermMatrix; effective: PermMatrix }>> {
  try {
    const data = await api.put<{ overrides: PermMatrix; effective: PermMatrix }>(`/api/v1/auth/admin/users/${id}/permissions`, { overrides });
    revalidatePath("/[locale]/(app)", "layout");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

// ── Approvals inbox ─────────────────────────────────────────────────────────

export async function decideApproval(kind: string, id: number, approve: boolean, note?: string): Promise<Result<{ result: string }>> {
  try {
    const data = await api.post<{ result: string }>(`/api/v1/approvals/${kind}/${id}/decision`, { approve, note: note || null });
    revalidatePath("/[locale]/(app)/approvals", "page");
    revalidatePath("/[locale]/(app)/expenses", "page");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}
