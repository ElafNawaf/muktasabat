import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SitePageScroll } from "@/components/site/SitePageScroll";
import { cms, SITE_URL, tr, waLink } from "@/lib/cms";

import "./site.css";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const site = await cms.site();
  const title = tr(locale, site.seo_title) || tr(locale, site.brand_name);
  const description = tr(locale, site.seo_description) || tr(locale, site.tagline);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${tr(locale, site.brand_name)}` },
    description,
    alternates: { languages: { ar: "/ar", en: "/en", "x-default": "/ar" } },
    openGraph: {
      type: "website",
      siteName: tr(locale, site.brand_name),
      locale: locale === "ar" ? "ar_SA" : "en_US",
      title,
      description,
      images: site.og_image_url ? [site.og_image_url] : site.hero_image_url ? [site.hero_image_url] : undefined,
    },
    twitter: { card: "summary_large_image" },
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: tr(locale, site.brand_name),
    url: `${SITE_URL}/${locale}`,
    telephone: site.phone || undefined,
    email: site.email || undefined,
    address: tr(locale, site.address) || undefined,
    logo: site.logo_url || undefined,
    sameAs: Object.values(site.social || {}).filter(Boolean),
    areaServed: "SA",
  };

  return (
    <div className="mk-site" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@500;600;700&display=swap" />
      <SitePageScroll />
      <a href="#main" className="mk-skip">{locale === "ar" ? "تخطَّ إلى المحتوى" : "Skip to content"}</a>
      <SiteHeader
        locale={locale}
        brand={tr(locale, site.brand_name)}
        logoUrl={site.logo_url}
        links={[
          { href: L("/about"), label: t("nav.about") },
          { href: L("/services"), label: t("nav.services") },
          { href: L("/for-owners"), label: t("nav.owners") },
          { href: L("/projects"), label: t("nav.projects") },
          { href: L("/news"), label: t("nav.news") },
          { href: L("/careers"), label: t("nav.careers") },
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
        <a className="mk-wa" href={wa} target="_blank" rel="noopener noreferrer" aria-label={t("contact.whatsapp")}>
          <svg viewBox="0 0 24 24" aria-hidden="true" width="26" height="26">
            <path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/>
          </svg>
        </a>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </div>
  );
}
