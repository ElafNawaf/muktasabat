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

export type Building = {
  id: number;
  owner_id: number;
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
  created_at: string;
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
