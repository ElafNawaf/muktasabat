/**
 * Shared TypeScript types for FastAPI response bodies.
 * Mirror api/schemas/*.py — keep in sync when those change.
 */

export type Agent = {
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

export type OwnerType = "individual" | "company";

/** نوع الهوية — Ejar identifies every contract party by ID type + number. */
export type EjarIdType =
  | "national_id"
  | "iqama"
  | "gcc_id"
  | "passport"
  | "visitor"
  | "cr"
  | "endowment";

export const EJAR_ID_TYPES: EjarIdType[] = [
  "national_id",
  "iqama",
  "gcc_id",
  "passport",
  "visitor",
  "cr",
  "endowment",
];

/** ID types Ejar requires an expiry date and nationality for. */
export const EXPIRING_ID_TYPES: EjarIdType[] = ["iqama", "passport", "visitor", "gcc_id"];

export type Owner = {
  id: number;
  agent_id: number | null;
  owner_type: OwnerType;
  name: string;
  name_en: string | null;
  name_ar: string | null;
  phone: string | null;
  email: string | null;
  national_id: string | null;
  date_of_birth: string | null;
  cr_number: string | null;
  representative_national_id: string | null;
  representative_date_of_birth: string | null;
  representative_phone: string | null;
  bank_name: string | null;
  iban: string | null;
  // Ejar party identity
  id_type: EjarIdType;
  id_expiry_date: string | null;
  nationality: string | null;
  absher_phone: string | null;
  national_address: string | null;
  representative_name: string | null;
  ejar_party_id: string | null;
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

export type EntityDocument = {
  id: number;
  url: string;
  filename: string;
  file_type: string | null;
  sort_order: number;
};

export type Building = {
  id: number;
  owner_id: number;
  assignee_id: number | null;
  name: string;
  name_en: string | null;
  name_ar: string | null;
  // General info
  contract_type: string | null;
  building_code: string | null;
  water_meter_number: string | null;
  electricity_meter_number: string | null;
  lease_contract_number: string | null;
  branch: string | null;
  // Location
  street: string | null;
  address: string | null;
  address_en: string | null;
  address_ar: string | null;
  city: string | null;
  city_en: string | null;
  city_ar: string | null;
  district: string | null;
  district_en: string | null;
  district_ar: string | null;
  latitude: number | null;
  longitude: number | null;
  national_address: string | null;
  postal_code: string | null;
  building_number: string | null;
  additional_number: string | null;
  // Deed
  deed_number: string | null;
  deed_document_type: string | null;
  deed_date: string | null;
  deed_document_number: string | null;
  ejar_property_id: string | null;
  // Property data
  property_type: string | null;
  residence_type: string | null;
  offices_count: number;
  commercial_shops_count: number;
  apartments_count: number;
  // Notes
  notes: string | null;
  notes_en: string | null;
  notes_ar: string | null;
  created_at: string;
  images: EntityImage[];
  documents: EntityDocument[];
};

export type UnitUsage = "residential" | "commercial" | "office" | "warehouse" | "other";

export const UNIT_USAGES: UnitUsage[] = [
  "residential",
  "commercial",
  "office",
  "warehouse",
  "other",
];

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
  // Ejar unit record
  ejar_unit_id: string | null;
  usage_type: UnitUsage | null;
  rooms_count: number | null;
  bathrooms_count: number | null;
  is_furnished: boolean;
  is_available: boolean;
  notes: string | null;
  notes_en: string | null;
  notes_ar: string | null;
  created_at: string;
  images: EntityImage[];
};

export type TenantType = "individual" | "company";

export type TenantCompanion = {
  id: number;
  name: string;
  national_id: string;
  date_of_birth: string | null;
};

export type TenantCompanionInput = {
  name: string;
  national_id: string;
  date_of_birth?: string | null;
};

export type Tenant = {
  id: number;
  tenant_type: TenantType;
  name: string;
  name_en: string | null;
  name_ar: string | null;
  phone: string;
  national_id: string;
  date_of_birth: string | null;
  cr_number: string | null;
  cr_date: string | null;
  absher_phone: string | null;
  representative_name: string | null;
  representative_national_id: string | null;
  representative_date_of_birth: string | null;
  tax_number: string | null;
  email: string | null;
  // Ejar party identity
  id_type: EjarIdType;
  id_expiry_date: string | null;
  nationality: string | null;
  national_address: string | null;
  ejar_party_id: string | null;
  notes: string | null;
  notes_en: string | null;
  notes_ar: string | null;
  created_at: string;
  companions: TenantCompanion[];
};

export type Contract = {
  id: number;
  unit_id: number;
  tenant_id: number;
  /** عقد إدارة الأملاك المخوِّل بتوقيع هذا العقد */
  management_contract_id: number | null;
  contract_number: string;
  // Basic
  branch: string | null;
  contract_type: string;
  validity_type: string | null;
  start_date: string;
  end_date: string;
  duration_years: number;
  duration_months: number;
  duration_days: number;
  total_rent_amount: number;
  rent_amount: number;
  ejar_contract_number: string | null;
  // Billing
  payment_type: string | null;
  payment_count: number;
  payment_cycle: number;
  electricity_on_tenant: boolean;
  electricity_split_percentage: number | null;
  water_on_tenant: boolean;
  water_split_percentage: number | null;
  electricity_amount: number;
  water_amount: number;
  electricity_meter_number: string | null;
  water_meter_number: string | null;
  services_amount: number;
  insurance_amount: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  agent_id: number | null;
  agent_percentage: number;
  management_percentage: number;
  status: "active" | "expired" | "terminated";
  notes: string | null;
  ejar_status: string | null;
  ejar_reference: string | null;
  ejar_registered_at: string | null;
  ejar_last_error: string | null;
  ejar_registration_fee: number;
  ejar_signed_by: EjarSignatory;
  created_at: string;
  attachments: EntityDocument[];
};

/** الطرف الموقّع على العقد في منصة إيجار */
export type EjarSignatory = "landlord" | "property_manager";

// ── Ejar establishment + property management contracts ──────────────────────

/** المنشأة العقارية — the licensed office that files contracts on Ejar. */
export type ManagementCompany = {
  id: number;
  name: string;
  name_en: string | null;
  name_ar: string | null;
  cr_number: string | null;
  cr_issue_date: string | null;
  cr_expiry_date: string | null;
  vat_number: string | null;
  fal_license_number: string | null;
  fal_license_expiry: string | null;
  fal_management_license_number: string | null;
  fal_management_license_expiry: string | null;
  ejar_establishment_id: string | null;
  ejar_branch_id: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  national_address: string | null;
  postal_code: string | null;
  building_number: string | null;
  additional_number: string | null;
  representative_name: string | null;
  representative_national_id: string | null;
  representative_phone: string | null;
  representative_email: string | null;
  bank_name: string | null;
  iban: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

export type ManagementFeeType = "percentage" | "fixed";
export type ManagementFeeCollection = "deduct_from_rent" | "invoice_owner";
export type ManagementContractStatus = "draft" | "active" | "expired" | "terminated";

export type ManagementProperty = {
  id: number;
  building_id: number;
  unit_id: number | null;
  fee_percentage_override: number | null;
};

/** عقد إدارة الأملاك — the owner↔company mandate registered on Ejar. */
export type ManagementContract = {
  id: number;
  owner_id: number;
  company_id: number | null;
  contract_number: string;
  ejar_contract_number: string | null;
  branch: string | null;
  contract_date: string | null;
  start_date: string;
  end_date: string;
  duration_months: number;
  auto_renew: boolean;
  notice_period_days: number;
  fee_type: ManagementFeeType;
  fee_percentage: number;
  fee_fixed_amount: number;
  fee_collection_method: ManagementFeeCollection;
  vat_rate: number;
  estimated_annual_fee: number;
  vat_amount: number;
  total_fee_amount: number;
  payout_cycle_months: number;
  can_market_units: boolean;
  can_sign_leases: boolean;
  can_collect_rent: boolean;
  can_evict: boolean;
  can_maintain: boolean;
  can_pay_utilities: boolean;
  maintenance_limit_amount: number;
  status: ManagementContractStatus;
  notes: string | null;
  ejar_status: string | null;
  ejar_reference: string | null;
  ejar_registered_at: string | null;
  ejar_last_error: string | null;
  created_at: string;
  properties: ManagementProperty[];
  attachments: EntityDocument[];
};

/** One field Ejar would reject a contract for. */
export type EjarIssue = {
  entity: string;
  entity_id: number | null;
  field: string;
  message_en: string;
  message_ar: string;
  severity: "error" | "warning";
};

export type EjarReadiness = {
  ready: boolean;
  is_stub_mode: boolean;
  error_count: number;
  warning_count: number;
  issues: EjarIssue[];
};

/** Pick the message matching the active locale. */
export function issueMessage(issue: EjarIssue, locale: string): string {
  return locale.startsWith("ar") ? issue.message_ar : issue.message_en;
}

export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve";
export type ModuleId =
  | "properties"
  | "contracts"
  | "payments"
  | "owners"
  | "agents"
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
  "agents",
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
