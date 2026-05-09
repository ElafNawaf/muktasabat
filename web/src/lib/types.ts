/**
 * Shared TypeScript types for FastAPI response bodies.
 * Mirror api/schemas/*.py — keep in sync when those change.
 */

export type Owner = {
  id: number;
  name: string;
  name_en: string | null;
  name_ar: string | null;
  phone: string | null;
  email: string | null;
  national_id: string | null;
  bank_name: string | null;
  iban: string | null;
  notes: string | null;
  notes_en: string | null;
  notes_ar: string | null;
  created_at: string;
};

export type EntityImage = {
  id: number;
  url: string;
  caption: string | null;
  sort_order: number;
};

export type Building = {
  id: number;
  owner_id: number;
  assignee_id: number | null;
  name: string;
  name_en: string | null;
  name_ar: string | null;
  address: string | null;
  address_en: string | null;
  address_ar: string | null;
  city: string | null;
  city_en: string | null;
  city_ar: string | null;
  district: string | null;
  district_en: string | null;
  district_ar: string | null;
  notes: string | null;
  notes_en: string | null;
  notes_ar: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  images: EntityImage[];
};

export type Unit = {
  id: number;
  building_id: number;
  name: string;
  name_en: string | null;
  name_ar: string | null;
  number: string;
  unit_type: string | null;
  area_sqm: number | null;
  rent_amount: number;
  management_percentage: number;
  agent_name: string | null;
  agent_percentage: number;
  electric_invoice: string | null;
  water_invoice: string | null;
  ejar_fee: number;
  is_available: boolean;
  notes: string | null;
  notes_en: string | null;
  notes_ar: string | null;
  created_at: string;
  images: EntityImage[];
};

export type Tenant = {
  id: number;
  name: string;
  name_en: string | null;
  name_ar: string | null;
  phone: string;
  national_id: string;
  email: string | null;
  notes: string | null;
  notes_en: string | null;
  notes_ar: string | null;
  created_at: string;
};

export type Contract = {
  id: number;
  unit_id: number;
  tenant_id: number;
  contract_number: string;
  start_date: string;
  end_date: string;
  rent_amount: number;
  payment_cycle: number;
  status: "active" | "expired" | "terminated";
  notes: string | null;
  created_at: string;
};

export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve";
export type ModuleId =
  | "properties"
  | "contracts"
  | "payments"
  | "owners"
  | "tenants"
  | "expenses"
  | "users";

export type Role = {
  code: string;
  label_en: string;
  label_ar: string;
  description_en: string | null;
  description_ar: string | null;
  color: string;
  system: boolean;
  permissions: Partial<Record<ModuleId, Partial<Record<PermissionAction, 0 | 1>>>>;
};

export const MODULE_IDS: ModuleId[] = [
  "properties",
  "contracts",
  "payments",
  "owners",
  "tenants",
  "expenses",
  "users",
];

export const PERMISSION_ACTIONS: PermissionAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
];

/** Pick the right localized string for a record with `name`/`name_en`/`name_ar`. */
export function localized<T extends Record<string, unknown>>(
  obj: T | null | undefined,
  field: string,
  locale: string,
): string {
  if (!obj) return "";
  const primary = (obj[field] as string | null | undefined)?.trim() || null;
  const en = (obj[`${field}_en`] as string | null | undefined)?.trim() || null;
  const ar = (obj[`${field}_ar`] as string | null | undefined)?.trim() || null;
  if (locale.startsWith("ar") && ar) return ar;
  if (locale.startsWith("en") && en) return en;
  return primary ?? "";
}
