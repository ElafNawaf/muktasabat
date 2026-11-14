import type { Metadata } from "next";

import { SITE_URL, tr, type SiteData } from "@/lib/cms";

/**
 * SEO helpers for the public site.
 *
 * Every public page should build its metadata with `pageMeta` so it gets:
 *   - a self-referencing canonical URL (no duplicate-content dilution),
 *   - hreflang ar / en / x-default pointing at the SAME page in each language,
 *   - Open Graph + Twitter cards with an absolute URL and image.
 */

export const BRAND = { ar: "مكتسبات العقارية", en: "Muktasabat Real Estate" };

/** Search phrases people actually type, per language. Used in meta keywords
 *  (ignored by Google but read by Bing/Yandex) and as a checklist for copy. */
export const KEYWORDS = {
  ar: [
    "مكتسبات",
    "شركة مكتسبات العقارية",
    "مكتسبات العقارية",
    "عقار",
    "عقارات",
    "عقارات للإيجار",
    "عقارات للبيع",
    "شقق للإيجار في الرياض",
    "شقق للبيع في الرياض",
    "فلل للبيع",
    "أراضي للبيع",
    "عقارات مكة المكرمة",
    "إدارة أملاك",
    "إدارة الأملاك في الرياض",
    "تسويق عقاري",
    "مكتب عقاري",
    "وسيط عقاري مرخص",
    "تقييم الإيجار",
    "عقود إيجار",
  ],
  en: [
    "Muktasabat",
    "Muktasabat Real Estate",
    "real estate Riyadh",
    "property for rent Riyadh",
    "apartments for rent Riyadh",
    "property for sale Saudi Arabia",
    "villas for sale Riyadh",
    "property management Riyadh",
    "real estate Makkah",
    "licensed real estate broker Saudi Arabia",
    "Ejar lease",
  ],
};

export function abs(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function pageMeta({
  locale,
  path,
  title,
  description,
  image,
  keywords = [],
  type = "website",
  absoluteTitle = false,
  noindex = false,
}: {
  locale: string;
  /** Path after the locale, starting with "/" (or "" for the homepage). */
  path: string;
  title?: string;
  description?: string;
  image?: string | null;
  keywords?: string[];
  type?: "website" | "article";
  absoluteTitle?: boolean;
  noindex?: boolean;
}): Metadata {
  const url = `/${locale}${path}`;
  const kw = [...keywords, ...(locale === "ar" ? KEYWORDS.ar : KEYWORDS.en)];
  const ogImage = image ? abs(image) : abs(`/og/og-${locale === "ar" ? "ar" : "en"}.png`);
  return {
    ...(title ? { title: absoluteTitle ? { absolute: title } : title } : {}),
    ...(description ? { description } : {}),
    keywords: Array.from(new Set(kw)),
    alternates: {
      canonical: url,
      languages: { ar: `/ar${path}`, en: `/en${path}`, "x-default": `/ar${path}` },
    },
    openGraph: {
      type,
      url,
      siteName: locale === "ar" ? BRAND.ar : BRAND.en,
      locale: locale === "ar" ? "ar_SA" : "en_US",
      alternateLocale: locale === "ar" ? ["en_US"] : ["ar_SA"],
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      images: [{ url: ogImage, width: 1200, height: 630, alt: title || BRAND[locale === "ar" ? "ar" : "en"] }],
    },
    twitter: {
      card: "summary_large_image",
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      images: [ogImage],
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Organization + local business graph, emitted once per page by the site layout. */
export function organizationLd(locale: string, site: SiteData) {
  const name = tr(locale, site.brand_name);
  const altName = locale === "ar" ? tr("en", site.brand_name) : tr("ar", site.brand_name);
  const sameAs = Object.values(site.social || {}).filter(Boolean) as string[];
  if (site.aqar_url) sameAs.push(site.aqar_url);
  if (site.maps_url && !/\/maps\/embed/.test(site.maps_url)) sameAs.push(site.maps_url);
  const tel = site.phone ? (site.phone.startsWith("+") ? site.phone : site.phone) : undefined;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["RealEstateAgent", "LocalBusiness"],
        "@id": `${SITE_URL}/#organization`,
        name,
        alternateName: [altName, "مكتسبات", "Muktasabat"].filter(Boolean),
        legalName: tr("ar", site.brand_name),
        description: tr(locale, site.seo_description) || tr(locale, site.tagline) || undefined,
        url: `${SITE_URL}/${locale}`,
        logo: site.logo_url ? abs(site.logo_url) : abs("/icon.svg"),
        image: abs(`/og/og-${locale === "ar" ? "ar" : "en"}.png`),
        telephone: tel,
        email: site.email || undefined,
        priceRange: "$$",
        address: {
          "@type": "PostalAddress",
          streetAddress: tr(locale, site.address) || undefined,
          addressLocality: locale === "ar" ? "الرياض" : "Riyadh",
          addressCountry: "SA",
        },
        ...(site.map_lat != null && site.map_lng != null
          ? { geo: { "@type": "GeoCoordinates", latitude: site.map_lat, longitude: site.map_lng }, hasMap: `https://www.google.com/maps/search/?api=1&query=${site.map_lat},${site.map_lng}` }
          : {}),
        openingHoursSpecification: [
          {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
            opens: "09:00",
            closes: "21:00",
          },
        ],
        areaServed: [
          { "@type": "City", name: locale === "ar" ? "الرياض" : "Riyadh" },
          { "@type": "City", name: locale === "ar" ? "مكة المكرمة" : "Makkah" },
        ],
        knowsLanguage: ["ar", "en"],
        ...(site.fal_licence ? { hasCredential: { "@type": "EducationalOccupationalCredential", credentialCategory: "FAL licence", identifier: site.fal_licence } } : {}),
        ...(site.cr_number ? { identifier: { "@type": "PropertyValue", propertyID: "CR", value: site.cr_number } } : {}),
        ...(sameAs.length ? { sameAs } : {}),
        contactPoint: tel
          ? [{ "@type": "ContactPoint", telephone: tel, contactType: "customer service", areaServed: "SA", availableLanguage: ["Arabic", "English"] }]
          : undefined,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/${locale}`,
        name,
        alternateName: altName,
        inLanguage: locale === "ar" ? "ar-SA" : "en",
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/${locale}/listings?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

export function breadcrumbLd(locale: string, items: { name: string; path: string }[]) {
  const home = locale === "ar" ? "الرئيسية" : "Home";
  const all = [{ name: home, path: "" }, ...items];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}/${locale}${it.path}`,
    })),
  };
}

export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}
