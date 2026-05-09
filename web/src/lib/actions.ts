"use server";

import { revalidatePath } from "next/cache";

import { api, ApiError } from "./api";
import type {
  Building,
  Contract,
  Owner,
  Tenant,
  Unit,
} from "./types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function err(e: unknown): { ok: false; error: string } {
  if (e instanceof ApiError) {
    const body = e.body as { detail?: unknown } | undefined;
    const detail = body?.detail;
    if (typeof detail === "string") return { ok: false, error: detail };
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; loc?: unknown[] };
      const loc = Array.isArray(first.loc) ? first.loc.slice(1).join(".") : "";
      return { ok: false, error: loc ? `${loc}: ${first.msg}` : first.msg ?? "Validation error" };
    }
    return { ok: false, error: e.message };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
}

function refreshAll() {
  // The (app) group shares one segment-tree; revalidating each section keeps
  // server components fresh after mutations.
  for (const path of [
    "/[locale]/(app)/owners",
    "/[locale]/(app)/tenants",
    "/[locale]/(app)/properties",
    "/[locale]/(app)/contracts",
    "/[locale]/(app)/payments",
    "/[locale]/(app)/expenses",
    "/[locale]/(app)/users",
    "/[locale]/(app)/dashboard",
  ]) {
    revalidatePath(path, "page");
  }
}

// -------- Owners --------

export type OwnerInput = {
  name: string;
  name_en?: string | null;
  name_ar?: string | null;
  phone?: string | null;
  email?: string | null;
  national_id?: string | null;
  bank_name?: string | null;
  iban?: string | null;
  notes?: string | null;
};

export async function createOwner(input: OwnerInput): Promise<ActionResult<Owner>> {
  try {
    const data = await api.post<Owner>("/api/v1/owners", input);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function updateOwner(id: number, input: OwnerInput): Promise<ActionResult<Owner>> {
  try {
    const data = await api.put<Owner>(`/api/v1/owners/${id}`, input);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function deleteOwner(id: number): Promise<ActionResult<null>> {
  try {
    await api.delete(`/api/v1/owners/${id}`);
    refreshAll();
    return { ok: true, data: null };
  } catch (e) {
    return err(e);
  }
}

// -------- Tenants --------

export type TenantInput = {
  name: string;
  name_en?: string | null;
  name_ar?: string | null;
  phone: string;
  national_id: string;
  email?: string | null;
  notes?: string | null;
};

export async function createTenant(input: TenantInput): Promise<ActionResult<Tenant>> {
  try {
    const data = await api.post<Tenant>("/api/v1/tenants", input);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function updateTenant(id: number, input: TenantInput): Promise<ActionResult<Tenant>> {
  try {
    const data = await api.put<Tenant>(`/api/v1/tenants/${id}`, input);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function deleteTenant(id: number): Promise<ActionResult<null>> {
  try {
    await api.delete(`/api/v1/tenants/${id}`);
    refreshAll();
    return { ok: true, data: null };
  } catch (e) {
    return err(e);
  }
}

// -------- Buildings --------

export type BuildingInput = {
  owner_id: number;
  name: string;
  name_en?: string | null;
  name_ar?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  notes?: string | null;
};

export async function createBuilding(input: BuildingInput): Promise<ActionResult<Building>> {
  try {
    const data = await api.post<Building>("/api/v1/buildings", input);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function updateBuilding(id: number, input: BuildingInput): Promise<ActionResult<Building>> {
  try {
    const data = await api.put<Building>(`/api/v1/buildings/${id}`, input);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function deleteBuilding(id: number): Promise<ActionResult<null>> {
  try {
    await api.delete(`/api/v1/buildings/${id}`);
    refreshAll();
    return { ok: true, data: null };
  } catch (e) {
    return err(e);
  }
}

// -------- Units --------

export type UnitInput = {
  building_id: number;
  name: string;
  number: string;
  unit_type?: string | null;
  area_sqm?: number | null;
  rent_amount: number;
  management_percentage: number;
  agent_name?: string | null;
  agent_percentage: number;
  ejar_fee: number;
  notes?: string | null;
};

export async function createUnit(input: UnitInput): Promise<ActionResult<Unit>> {
  try {
    const data = await api.post<Unit>("/api/v1/units", input);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function updateUnit(id: number, input: UnitInput): Promise<ActionResult<Unit>> {
  try {
    const data = await api.put<Unit>(`/api/v1/units/${id}`, input);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function deleteUnit(id: number): Promise<ActionResult<null>> {
  try {
    await api.delete(`/api/v1/units/${id}`);
    refreshAll();
    return { ok: true, data: null };
  } catch (e) {
    return err(e);
  }
}

// -------- Contracts --------

export type ContractInput = {
  unit_id: number;
  tenant_id: number;
  contract_number: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  rent_amount: number;
  payment_cycle: 3 | 6 | 12;
  notes?: string | null;
};

export async function createContract(input: ContractInput): Promise<ActionResult<Contract>> {
  try {
    const data = await api.post<Contract>("/api/v1/contracts", input);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function terminateContract(id: number): Promise<ActionResult<Contract>> {
  try {
    const data = await api.post<Contract>(`/api/v1/contracts/${id}/terminate`);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

// -------- Payments --------

export type PayInput = {
  payment_method: "bank_transfer" | "cash" | "cheque";
  receipt_number?: string | null;
  paid_date?: string | null;
  notes?: string | null;
};

export async function markPaymentPaid(id: number, input: PayInput): Promise<ActionResult<unknown>> {
  try {
    const data = await api.post(`/api/v1/payments/${id}/pay`, input);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

// -------- Expenses --------

export type ExpenseInput = {
  owner_id?: number | null;
  building_id?: number | null;
  unit_id?: number | null;
  category:
    | "maintenance"
    | "utilities"
    | "insurance"
    | "legal"
    | "marketing"
    | "cleaning"
    | "security"
    | "government_fees"
    | "other";
  description: string;
  amount: number;
  expense_date: string;
  paid_by: "company" | "owner" | "tenant";
  vendor_name?: string | null;
  receipt_number?: string | null;
  notes?: string | null;
};

export async function createExpense(input: ExpenseInput): Promise<ActionResult<unknown>> {
  try {
    const data = await api.post("/api/v1/expenses", input);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function deleteExpense(id: number): Promise<ActionResult<null>> {
  try {
    await api.delete(`/api/v1/expenses/${id}`);
    refreshAll();
    return { ok: true, data: null };
  } catch (e) {
    return err(e);
  }
}

// -------- Users (admin) --------

export type AdminUserUpdate = {
  role?: "admin" | "manager" | "viewer" | "owner";
};

export async function changeUserRole(id: number, role: AdminUserUpdate["role"]): Promise<ActionResult<unknown>> {
  try {
    const data = await api.put(`/api/v1/auth/admin/users/${id}/role`, { role });
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function toggleUserActive(id: number): Promise<ActionResult<unknown>> {
  try {
    const data = await api.put(`/api/v1/auth/admin/users/${id}/toggle-active`);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}
