/**
 * Public-website data layer (marketing pages at /{locale}).
 *
 * Deliberately does NOT use `api` from ./api: that client reads cookies, which
 * would make every marketing page dynamic. These fetches are anonymous and
 * cached with ISR; the portal's Website editor calls `revalidateTag(CMS_TAG)`
 * on every save so changes appear within seconds.
 *
 * If the API is unreachable (e.g. during `next build` inside Docker) we fall
 * back to empty content rather than failing the build; ISR fills it in on the
 * first request after deploy.
 */
// Server-side only: inside Docker this is http://api:8000.
const API_BASE_PUBLIC = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const CMS_TAG = "cms";
export const CMS_REVALIDATE = 300;

export type Bi = { ar?: string | null; en?: string | null };

export type SiteData = {
  brand_name: Bi;
  tagline: Bi;
  logo_url?: string | null;
  hero_title: Bi;
  hero_subtitle: Bi;
  hero_image_url?: string | null;
  hero_video_url?: string | null;
  hero_slides?: (string | null)[];
  about_title: Bi;
  about_body: Bi;
  about_image_url?: string | null;
  vision: Bi;
  mission: Bi;
  values: { icon?: string | null; title: Bi; body: Bi }[];
  stats: { value: number; suffix?: string | null; label: Bi }[];
  portal_title: Bi;
  portal_body: Bi;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address: Bi;
  working_hours: Bi;
  map_lat?: number | null;
  map_lng?: number | null;
  maps_url?: string | null;
  aqar_url?: string | null;
  coverage?: Bi;
  texts?: Record<string, Bi>;
  social: Record<string, string | null>;
  cr_number?: string | null;
  fal_licence?: string | null;
  vat_number?: string | null;
  seo_title: Bi;
  seo_description: Bi;
  og_image_url?: string | null;
};

type Common = { id: number; slug: string; published: boolean; sort_order: number; updated_at: string };

export type Service = Common & {
  icon?: string | null;
  title_ar: string;
  title_en: string;
  summary_ar?: string | null;
  summary_en?: string | null;
  body_ar?: string | null;
  body_en?: string | null;
  image_url?: string | null;
};

export type ProjectCategory = "residential" | "commercial" | "development" | "mixed" | "hospitality";
export type Project = Common & {
  category: ProjectCategory;
  status: "completed" | "ongoing" | "upcoming";
  featured: boolean;
  title_ar: string;
  title_en: string;
  summary_ar?: string | null;
  summary_en?: string | null;
  body_ar?: string | null;
  body_en?: string | null;
  city_ar?: string | null;
  city_en?: string | null;
  lat?: number | null;
  lng?: number | null;
  area_sqm?: number | null;
  units_count?: number | null;
  year?: number | null;
  cover_url?: string | null;
  gallery: string[];
};

export type ListingPurpose = "rent" | "sale";
export type ListingType = "apartment" | "floor" | "villa" | "duplex" | "land" | "building" | "office" | "shop" | "warehouse" | "rest_house";
export type ListingStatus = "available" | "reserved" | "rented" | "sold";
export type Listing = Common & {
  ref?: string | null;
  purpose: ListingPurpose;
  property_type: ListingType;
  status: ListingStatus;
  featured: boolean;
  exclusive: boolean;
  title_ar: string;
  title_en: string;
  summary_ar?: string | null;
  summary_en?: string | null;
  body_ar?: string | null;
  body_en?: string | null;
  city_ar?: string | null;
  city_en?: string | null;
  district_ar?: string | null;
  district_en?: string | null;
  price?: number | null;
  price_period: "year" | "month" | "total";
  area_sqm?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  living_rooms?: number | null;
  floor?: string | null;
  street_width_m?: number | null;
  facade?: string | null;
  age_years?: number | null;
  furnished: boolean;
  features_ar?: string | null;
  features_en?: string | null;
  ad_licence?: string | null;
  lat?: number | null;
  lng?: number | null;
  cover_url?: string | null;
  gallery: string[];
  video_url?: string | null;
};

export type Post = Common & {
  title_ar: string;
  title_en: string;
  excerpt_ar?: string | null;
  excerpt_en?: string | null;
  body_ar?: string | null;
  body_en?: string | null;
  cover_url?: string | null;
  published_on?: string | null;
};

export type Job = Common & {
  title_ar: string;
  title_en: string;
  department_ar?: string | null;
  department_en?: string | null;
  location_ar?: string | null;
  location_en?: string | null;
  employment_type: "full_time" | "part_time" | "contract" | "internship";
  body_ar?: string | null;
  body_en?: string | null;
  closes_on?: string | null;
};

export type Testimonial = Omit<Common, "slug"> & {
  name_ar: string;
  name_en: string;
  role_ar?: string | null;
  role_en?: string | null;
  quote_ar: string;
  quote_en: string;
  avatar_url?: string | null;
  rating: number;
};

export type Partner = Omit<Common, "slug"> & {
  name_ar: string;
  name_en: string;
  logo_url?: string | null;
  website?: string | null;
};

export type HomeData = {
  site: SiteData;
  listings: Listing[];
  services: Service[];
  projects: Project[];
  testimonials: Testimonial[];
  partners: Partner[];
  posts: Post[];
  open_jobs: number;
};

const EMPTY_BI: Bi = {};
export const EMPTY_SITE: SiteData = {
  brand_name: { ar: "شركة مكتسبات العقارية", en: "Muktasabat Real Estate" },
  tagline: EMPTY_BI,
  hero_title: EMPTY_BI,
  hero_subtitle: EMPTY_BI,
  about_title: EMPTY_BI,
  about_body: EMPTY_BI,
  vision: EMPTY_BI,
  mission: EMPTY_BI,
  values: [],
  stats: [],
  portal_title: EMPTY_BI,
  portal_body: EMPTY_BI,
  address: EMPTY_BI,
  working_hours: EMPTY_BI,
  social: {},
  seo_title: EMPTY_BI,
  seo_description: EMPTY_BI,
};

async function cmsGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE_PUBLIC}/api/v1/cms/public${path}`, {
      next: { revalidate: CMS_REVALIDATE, tags: [CMS_TAG] },
    });
    if (res.status === 404) return fallback;
    if (!res.ok) throw new Error(`CMS ${res.status} on ${path}`);
    return (await res.json()) as T;
  } catch (e) {
    console.error("[cms]", e instanceof Error ? e.message : e);
    return fallback;
  }
}

export const cms = {
  site: () => cmsGet<SiteData>("/site", EMPTY_SITE),
  home: () =>
    cmsGet<HomeData>("/home", {
      site: EMPTY_SITE,
      listings: [],
      services: [],
      projects: [],
      testimonials: [],
      partners: [],
      posts: [],
      open_jobs: 0,
    }),
  services: () => cmsGet<Service[]>("/services", []),
  service: (slug: string) => cmsGet<Service | null>(`/services/${encodeURIComponent(slug)}`, null),
  listings: () => cmsGet<Listing[]>("/listings?limit=200", []),
  listing: (slug: string) => cmsGet<Listing | null>(`/listings/${encodeURIComponent(slug)}`, null),
  projects: () => cmsGet<Project[]>("/projects", []),
  project: (slug: string) => cmsGet<Project | null>(`/projects/${encodeURIComponent(slug)}`, null),
  posts: () => cmsGet<Post[]>("/posts", []),
  post: (slug: string) => cmsGet<Post | null>(`/posts/${encodeURIComponent(slug)}`, null),
  jobs: () => cmsGet<Job[]>("/jobs", []),
  job: (slug: string) => cmsGet<Job | null>(`/jobs/${encodeURIComponent(slug)}`, null),
  testimonials: () => cmsGet<Testimonial[]>("/testimonials", []),
  partners: () => cmsGet<Partner[]>("/partners", []),
};

/** Pick the locale's value, falling back to the other language. */
export function tr(locale: string, bi?: Bi | null): string {
  if (!bi) return "";
  const primary = locale === "ar" ? bi.ar : bi.en;
  return (primary || (locale === "ar" ? bi.en : bi.ar) || "").trim();
}

/** Same for flat `<field>_ar` / `<field>_en` columns. */
export function pick<T extends object>(locale: string, row: T, field: string): string {
  const r = row as Record<string, unknown>;
  const a = r[`${field}_${locale === "ar" ? "ar" : "en"}`];
  const b = r[`${field}_${locale === "ar" ? "en" : "ar"}`];
  return String(a || b || "").trim();
}

export function waLink(num?: string | null, text?: string): string | null {
  if (!num) return null;
  const digits = num.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export const SITE_URL = (process.env.SITE_URL ?? process.env.WEB_BASE_URL ?? "https://muktasabat.com").replace(/\/$/, "");

/** Google Maps embed + directions URLs for a place. Accepts whatever the
 *  editor pasted (share link, place URL or embed URL) and falls back to the
 *  saved coordinates. Short links (maps.app.goo.gl) can't be embedded, so the
 *  iframe then uses the coordinates and the button opens the short link. */
export function mapLinks(site: Pick<SiteData, "maps_url" | "map_lat" | "map_lng">, label = ""): { embed: string | null; open: string | null; directions: string | null } {
  const url = (site.maps_url || "").trim();
  const hasLL = site.map_lat != null && site.map_lng != null;
  const ll = hasLL ? `${site.map_lat},${site.map_lng}` : "";
  let embed: string | null = null;
  if (/^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed/i.test(url)) embed = url;
  else if (hasLL) embed = `https://maps.google.com/maps?q=${encodeURIComponent(ll)}&z=17&output=embed`;
  else if (label) embed = `https://maps.google.com/maps?q=${encodeURIComponent(label)}&z=15&output=embed`;
  const open = url && !/\/maps\/embed/i.test(url) ? url : hasLL ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ll)}` : null;
  const directions = hasLL ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ll)}` : open;
  return { embed, open, directions };
}

export function listingPrice(l: Pick<Listing, "price">, locale: string): string | null {
  if (l.price == null || l.price <= 0) return null;
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: 0 }).format(l.price);
}

/** Placeholder-art palette for a property type (until photos are uploaded). */
export function artVariant(type: string): string {
  if (type === "land") return "development";
  if (type === "office" || type === "shop" || type === "warehouse" || type === "building") return "commercial";
  return "residential";
}

/** Material icon for a listing/property type — used instead of placeholder art
 *  because most properties have no photos yet. */
export function typeIcon(type?: string | null): string {
  const map: Record<string, string> = {
    apartment: "apartment",
    floor: "layers",
    villa: "villa",
    duplex: "stairs",
    land: "landscape",
    building: "domain",
    office: "business_center",
    shop: "storefront",
    warehouse: "warehouse",
    rest_house: "cottage",
  };
  return map[type ?? ""] ?? "home_work";
}
