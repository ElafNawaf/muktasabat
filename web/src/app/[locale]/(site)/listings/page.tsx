import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LeadForm } from "@/components/site/LeadForm";
import { ListingsBrowser } from "@/components/site/ListingsBrowser";
import { PageHead } from "@/components/site/PageHead";
import { cms } from "@/lib/cms";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site.listings" });
  return { title: t("title"), description: t("lead"), alternates: { languages: { ar: "/ar/listings", en: "/en/listings" } } };
}

export default async function ListingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [listings, t] = await Promise.all([cms.listings(), getTranslations({ locale, namespace: "site" })]);
  return (
    <>
      <PageHead title={t("listings.title")} lead={t("listings.lead")} />
      <section className="mk-section mk-section--top">
        <div className="mk-wrap">
          {listings.length === 0 ? (
            <div className="mk-split mk-split--form">
              <p className="mk-lead">{t("listings.empty")}</p>
              <LeadForm locale={locale} defaultKind="tenant" kinds={["tenant", "buyer", "investor"]} />
            </div>
          ) : (
            <ListingsBrowser listings={listings} locale={locale} />
          )}
        </div>
      </section>
    </>
  );
}
