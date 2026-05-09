/**
 * Deterministic color/theme assignment for buildings, owners, and tenants
 * based on their numeric ID. Mirrors the prototype's palette so the look
 * stays consistent.
 */

export type BuildingTheme = "tower" | "office" | "industrial";

export type BuildingMeta = {
  hueA: string;
  hueB: string;
  lat: number;
  lng: number;
  theme: BuildingTheme;
};

const BUILDING_PALETTE: BuildingMeta[] = [
  { hueA: "#7B1A1A", hueB: "#C44141", lat: 24.7136, lng: 46.6753, theme: "tower" },
  { hueA: "#1E3A5F", hueB: "#3B6BA5", lat: 24.7600, lng: 46.6900, theme: "tower" },
  { hueA: "#0F766E", hueB: "#14B8A6", lat: 21.5433, lng: 39.1728, theme: "office" },
  { hueA: "#92400E", hueB: "#D97706", lat: 26.4207, lng: 50.0888, theme: "office" },
  { hueA: "#581C87", hueB: "#9333EA", lat: 26.2172, lng: 50.1971, theme: "industrial" },
];

const OWNER_PALETTE = ["#7B1A1A", "#1E3A5F", "#0F766E", "#92400E", "#581C87", "#B45309"];
const TENANT_PALETTE = ["#1E3A5F", "#0F766E", "#7B1A1A", "#92400E", "#581C87", "#0E7490"];

export function buildingMeta(id: number): BuildingMeta {
  return BUILDING_PALETTE[id % BUILDING_PALETTE.length];
}

export function ownerColor(id: number): string {
  return OWNER_PALETTE[id % OWNER_PALETTE.length];
}

export function tenantColor(id: number): string {
  return TENANT_PALETTE[id % TENANT_PALETTE.length];
}

/**
 * Take 1–2 initials from a person/owner name. Strips honorifics like "bin" / "al-"
 * if present so the result is more recognizable.
 */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w && !/^(bin|al-?|ben|el-?)/i.test(w))
    .map((w) => w[0]!)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
