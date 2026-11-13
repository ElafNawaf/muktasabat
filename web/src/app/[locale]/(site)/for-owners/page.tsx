import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LeadForm } from "@/components/site/LeadForm";
import { OwnerFaq, OwnerShowcase, ProcessSteps } from "@/components/site/OwnerShowcase";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site.owners" });
  return { title: t("title"), description: t("lead"), alternates: { languages: { ar: "/ar/for-owners", en: "/en/for-owners" } } };
}

export default async function OwnersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return (
    <>
      <OwnerShowcase locale={locale} full />
      <ProcessSteps locale={locale} />
      <OwnerFaq locale={locale} />
      <section className="mk-section mk-section--sand" id="proposal">
        <div className="mk-wrap mk-split mk-split--form">
          <div>
            <h2 className="mk-h2">{t("owners.cta")}</h2>
            <p className="mk-lead">{t("sections.contactLead")}</p>
          </div>
          <LeadForm locale={locale} defaultKind="owner" />
        </div>
      </section>
    </>
  );
}
