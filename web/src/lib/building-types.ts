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
