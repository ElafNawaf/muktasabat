import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { JsonLd } from "@/components/site/JsonLd";
import { Motion } from "@/components/site/Motion";
import { SitePageScroll } from "@/components/site/SitePageScroll";
import { cms, SITE_URL, tr, waLink } from "@/lib/cms";
import { organizationLd } from "@/lib/seo";

import "./site.css";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const site = await cms.site();
  const brand = tr(locale, site.brand_name);
  const title = tr(locale, site.seo_title) || brand;
  const description = tr(locale, site.seo_description) || tr(locale, site.tagline);
  // Page-level metadata (pageMeta) adds canonical + hreflang for each URL.
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${brand}` },
    description,
    applicationName: brand,
    authors: [{ name: brand, url: `${SITE_URL}/${locale}` }],
    creator: brand,
    publisher: brand,
    category: "real estate",
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    openGraph: {
      type: "website",
      siteName: brand,
      locale: locale === "ar" ? "ar_SA" : "en_US",
      title,
      description,
    },
    twitter: { card: "summary_large_image" },
    verification: {
      google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
      other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
    },
  };
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [site, t] = await Promise.all([cms.site(), getTranslations({ locale, namespace: "site" })]);
  const L = (p: string) => `/${locale}${p}`;
  const wa = waLink(site.whatsapp, t("contact.whatsappMsg"));


  return (
    <div className="mk-site" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SitePageScroll />
      <Motion />
      <a href="#main" className="mk-skip">{locale === "ar" ? "تخطَّ إلى المحتوى" : "Skip to content"}</a>
      <SiteHeader
        locale={locale}
        brand={tr(locale, site.brand_name)}
        logoUrl={site.logo_url}
        links={[
          { href: L("/listings"), label: t("nav.listings") },
          { href: L("/about"), label: t("nav.about") },
          { href: L("/services"), label: t("nav.services") },
          { href: L("/for-owners"), label: t("nav.owners") },
          { href: L("/projects"), label: t("nav.projects") },
          { href: L("/contact"), label: t("nav.contact") },
        ]}
        portalLabel={t("nav.portal")}
        langLabel={t("nav.language")}
        menuLabel={t("nav.menu")}
        closeLabel={t("nav.close")}
      />
      <main id="main">{children}</main>
      <SiteFooter locale={locale} site={site} />
      {wa && (
        <a className="mk-wa" data-reveal="zoom" href={wa} target="_blank" rel="noopener noreferrer" aria-label={t("contact.whatsapp")}>
          <svg viewBox="0 0 24 24" aria-hidden="true" width="26" height="26">
            <path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/>
          </svg>
        </a>
      )}
      <JsonLd data={organizationLd(locale, site)} />
    </div>
  );
}
