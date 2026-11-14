/** Primary building types shown when creating/editing a property. */
export const PRIMARY_BUILDING_TYPES = ["apartment_building", "villa", "office"] as const;

/** All types including legacy values (filters, existing records). */
export const ALL_BUILDING_TYPES = [
  ...PRIMARY_BUILDING_TYPES,
  "commercial",
  "warehouse",
  "mixed",
  "land",
  "other",
] as const;

export type BuildingType = (typeof ALL_BUILDING_TYPES)[number];

export const BUILDING_TYPE_ICONS: Record<string, string> = {
  apartment_building: "apartment",
  villa: "villa",
  office: "business",
  commercial: "storefront",
  warehouse: "warehouse",
  mixed: "domain",
  land: "landscape",
  other: "home_work",
};

export const RESIDENCE_TYPES = ["singles", "families", "mixed"] as const;

const TYPE_TEXT: Record<string, [string, string]> = {
  apartment_building: ["عمارة سكنية", "Apartment building"],
  villa: ["فيلا", "Villa"],
  office: ["مكاتب", "Offices"],
  commercial: ["تجاري", "Commercial"],
  warehouse: ["مستودع", "Warehouse"],
  mixed: ["متعدد الاستخدام", "Mixed use"],
  land: ["أرض", "Land"],
  other: ["أخرى", "Other"],
  residential: ["سكني", "Residential"],
};
/** Human label for a building type code (free-text values pass through). */
export function buildingTypeText(locale: string, type?: string | null) {
  if (!type) return null;
  const m = TYPE_TEXT[type.toLowerCase()];
  return m ? (locale === "ar" ? m[0] : m[1]) : type;
}
export function buildingTypeIcon(type?: string | null) {
  if (!type) return "apartment";
  return BUILDING_TYPE_ICONS[type] ?? (type.toLowerCase() === "residential" ? "apartment" : "home_work");
}

/** Unit status derived from leases (see api/routers/entity_overview.py). */
export type UnitStatus = "occupied" | "expiring" | "overdue" | "vacant" | "reserved";
export const UNIT_STATUS: Record<UnitStatus, { ar: string; en: string; tone: string; icon: string }> = {
  occupied: { ar: "مؤجرة", en: "Leased", tone: "ok", icon: "check_circle" },
  expiring: { ar: "ينتهي قريباً", en: "Ending soon", tone: "soon", icon: "hourglass_bottom" },
  overdue: { ar: "متأخرات", en: "Arrears", tone: "bad", icon: "error" },
  vacant: { ar: "شاغرة", en: "Vacant", tone: "idle", icon: "radio_button_unchecked" },
  reserved: { ar: "محجوزة", en: "Reserved", tone: "info", icon: "event_available" },
};
