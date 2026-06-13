"use server";

import { revalidatePath } from "next/cache";

import { api, ApiError } from "./api";
import type {
  Building,
  Contract,
  ModuleId,
  Owner,
  OwnerType,
  Agent,
  PermissionAction,
  Role,
  Tenant,
  TenantCompanionInput,
  TenantType,
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
    "/[locale]/(app)/agents",
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
  owner_type?: OwnerType;
  name: string;
  name_en?: string | null;
  name_ar?: string | null;
  phone?: string | null;
  email?: string | null;
  national_id?: string | null;
  date_of_birth?: string | null;
  cr_number?: string | null;
  representative_national_id?: string | null;
  representative_date_of_birth?: string | null;
  representative_phone?: string | null;
  bank_name?: string | null;
  iban?: string | null;
  agent_id?: number | null;
  notes?: string | null;
  notes_en?: string | null;
  notes_ar?: string | null;
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

// -------- Agents --------

export type AgentInput = {
  name: string;
  name_en?: string | null;
  name_ar?: string | null;
  phone?: string | null;
  email?: string | null;
  national_id?: string | null;
  bank_name?: string | null;
  iban?: string | null;
  notes?: string | null;
  notes_en?: string | null;
  notes_ar?: string | null;
};

export async function createAgent(input: AgentInput): Promise<ActionResult<Agent>> {
  try {
    const data = await api.post<Agent>("/api/v1/agents", input);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function updateAgent(id: number, input: AgentInput): Promise<ActionResult<Agent>> {
  try {
    const data = await api.put<Agent>(`/api/v1/agents/${id}`, input);
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function deleteAgent(id: number): Promise<ActionResult<null>> {
  try {
    await api.delete(`/api/v1/agents/${id}`);
    refreshAll();
    return { ok: true, data: null };
  } catch (e) {
    return err(e);
  }
}

// -------- Tenants --------

export type TenantInput = {
  tenant_type: TenantType;
  name: string;
  name_en?: string | null;
  name_ar?: string | null;
  phone: string;
  national_id: string;
  date_of_birth?: string | null;
  cr_number?: string | null;
  cr_date?: string | null;
  absher_phone?: string | null;
  representative_name?: string | null;
  representative_national_id?: string | null;
  representative_date_of_birth?: string | null;
  tax_number?: string | null;
  email?: string | null;
  notes?: string | null;
  notes_en?: string | null;
  notes_ar?: string | null;
  companions?: TenantCompanionInput[];
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
  assignee_id?: number | null;
  name: string;
  name_en?: string | null;
  name_ar?: string | null;
  // General info
  contract_type?: string | null;
  building_code?: string | null;
  water_meter_number?: string | null;
  electricity_meter_number?: string | null;
  lease_contract_number?: string | null;
  branch?: string | null;
  // Location
  street?: string | null;
  address?: string | null;
  address_en?: string | null;
  address_ar?: string | null;
  city?: string | null;
  city_en?: string | null;
  city_ar?: string | null;
  district?: string | null;
  district_en?: string | null;
  district_ar?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  // Deed
  deed_number?: string | null;
  deed_document_type?: string | null;
  deed_date?: string | null;
  deed_document_number?: string | null;
  // Property data
  property_type?: string | null;
  residence_type?: string | null;
  offices_count?: number;
  commercial_shops_count?: number;
  apartments_count?: number;
  // Notes
  notes?: string | null;
  notes_en?: string | null;
  notes_ar?: string | null;
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
  name_en?: string | null;
  name_ar?: string | null;
  number: string;
  unit_type?: string | null;
  area_sqm?: number | null;
  rent_amount: number;
  management_percentage: number;
  agent_name?: string | null;
  agent_percentage: number;
  electric_invoice?: string | null;
  water_invoice?: string | null;
  ejar_fee: number;
  notes?: string | null;
  notes_en?: string | null;
  notes_ar?: string | null;
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

export type PaymentCycle = 1 | 3 | 6 | 12;

export type ContractInput = {
  unit_id: number;
  tenant_id: number;
  contract_number: string;
  // Basic
  branch?: string | null;
  contract_type?: "residential" | "commercial";
  validity_type?: "fixed" | "open" | null;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  duration_years?: number;
  duration_months?: number;
  duration_days?: number;
  total_rent_amount?: number;
  rent_amount: number;
  ejar_contract_number?: string | null;
  // Billing
  payment_type?: "monthly" | "quarterly" | "semi-annual" | "annual" | "full" | null;
  payment_count?: number;
  payment_cycle: PaymentCycle;
  electricity_on_tenant?: boolean;
  electricity_split_percentage?: number | null;
  water_on_tenant?: boolean;
  water_split_percentage?: number | null;
  electricity_amount?: number;
  water_amount?: number;
  electricity_meter_number?: string | null;
  water_meter_number?: string | null;
  services_amount?: number;
  insurance_amount?: number;
  vat_rate?: number;
  agent_percentage?: number;
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

export async function deleteContract(id: number): Promise<ActionResult<null>> {
  try {
    await api.delete(`/api/v1/contracts/${id}`);
    refreshAll();
    return { ok: true, data: null };
  } catch (e) {
    return err(e);
  }
}

export type EjarSyncResult = {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  owners_created: number;
  buildings_created: number;
  units_created: number;
  tenants_created: number;
  is_stub_mode: boolean;
  errors: string[];
};

export async function syncEjarContracts(): Promise<ActionResult<EjarSyncResult>> {
  try {
    const data = await api.post<EjarSyncResult>("/api/v1/contracts/ejar/sync");
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export type ContractUpdateInput = {
  contract_number: string;
  branch?: string | null;
  contract_type?: "residential" | "commercial";
  validity_type?: "fixed" | "open" | null;
  start_date: string;
  end_date: string;
  duration_years?: number;
  duration_months?: number;
  duration_days?: number;
  total_rent_amount?: number;
  rent_amount: number;
  ejar_contract_number?: string | null;
  payment_type?: "monthly" | "quarterly" | "semi-annual" | "annual" | "full" | null;
  payment_count?: number;
  payment_cycle: PaymentCycle;
  electricity_on_tenant?: boolean;
  electricity_split_percentage?: number | null;
  water_on_tenant?: boolean;
  water_split_percentage?: number | null;
  electricity_amount?: number;
  water_amount?: number;
  electricity_meter_number?: string | null;
  water_meter_number?: string | null;
  services_amount?: number;
  insurance_amount?: number;
  vat_rate?: number;
  agent_percentage?: number;
  status: "active" | "expired" | "terminated";
  notes?: string | null;
};

export async function updateContract(
  id: number,
  input: ContractUpdateInput,
): Promise<ActionResult<Contract>> {
  try {
    const data = await api.put<Contract>(`/api/v1/contracts/${id}`, input);
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

export async function deletePayment(id: number): Promise<ActionResult<null>> {
  try {
    await api.delete(`/api/v1/payments/${id}`);
    refreshAll();
    return { ok: true, data: null };
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
  description_en?: string | null;
  description_ar?: string | null;
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

export async function updateExpense(
  id: number,
  input: ExpenseInput,
): Promise<ActionResult<unknown>> {
  try {
    const data = await api.put(`/api/v1/expenses/${id}`, input);
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

export async function deleteUser(id: number): Promise<ActionResult<null>> {
  try {
    await api.delete(`/api/v1/auth/admin/users/${id}`);
    refreshAll();
    return { ok: true, data: null };
  } catch (e) {
    return err(e);
  }
}

export type InviteUserInput = {
  username: string;
  email: string;
  role: AdminUserUpdate["role"];
};

export type InviteUserResult = {
  user: { id: number; username: string; email: string; role: string };
  debug_invite_url: string | null;
};

export async function inviteUser(input: InviteUserInput): Promise<ActionResult<InviteUserResult>> {
  try {
    const data = await api.post<InviteUserResult>(
      "/api/v1/auth/admin/users/invite",
      input,
    );
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

// -------- Roles & permissions --------

export type RolePermissions = Partial<
  Record<ModuleId, Partial<Record<PermissionAction, 0 | 1>>>
>;

export async function updateRolePermissions(
  code: string,
  permissions: RolePermissions,
): Promise<ActionResult<Role>> {
  try {
    const data = await api.put<Role>(`/api/v1/roles/${code}/permissions`, { permissions });
    refreshAll();
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

// -------- Translate --------

export type Lang = "en" | "ar" | "auto";

export type TranslateResult = {
  translated: string;
  configured: boolean;
  /** True if the backend echoed the input unchanged (no-op or identical). */
  unchanged: boolean;
};

export async function translateText(
  text: string,
  source: Lang,
  target: Lang,
): Promise<ActionResult<TranslateResult>> {
  try {
    const data = await api.post<{ translated_text: string; configured: boolean }>(
      "/api/v1/translate",
      { text, source, target },
    );
    return {
      ok: true,
      data: {
        translated: data.translated_text,
        configured: Boolean(data.configured),
        unchanged: data.translated_text.trim() === text.trim(),
      },
    };
  } catch (e) {
    return err(e);
  }
}
