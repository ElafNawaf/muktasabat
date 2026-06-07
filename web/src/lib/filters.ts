/** Shared list-filter helpers for entity pages. */

export function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

export function matchesSearch(
  haystack: (string | null | undefined)[],
  query: string,
): boolean {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return haystack
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function localizedCity(
  b: { city?: string | null; city_en?: string | null; city_ar?: string | null },
  locale: string,
): string | null {
  if (locale.startsWith("ar")) return b.city_ar ?? b.city ?? null;
  return b.city_en ?? b.city ?? null;
}

export function localizedDistrict(
  b: {
    district?: string | null;
    district_en?: string | null;
    district_ar?: string | null;
  },
  locale: string,
): string | null {
  if (locale.startsWith("ar")) return b.district_ar ?? b.district ?? null;
  return b.district_en ?? b.district ?? null;
}
