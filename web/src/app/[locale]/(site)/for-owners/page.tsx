import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ValuationBand } from "@/components/site/Company";
import { LeadForm } from "@/components/site/LeadForm";
import { OwnerFaq, OwnerShowcase, ProcessSteps } from "@/components/site/OwnerShowcase";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site.owners" });
  return pageMeta({
    locale,
    path: "/for-owners",
    title: t("title"),
    description: t("lead"),
    keywords: locale === "ar" ? ["إدارة أملاك", "إدارة الأملاك في الرياض", "شركة إدارة أملاك", "بوابة الملاك", "تحصيل الإيجارات"] : ["property management Riyadh", "owner portal", "rent collection"],
  });
}

export default async function OwnersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return (
    <>
      <OwnerShowcase locale={locale} full />
      <ProcessSteps locale={locale} />
      <ValuationBand locale={locale} />
      <OwnerFaq locale={locale} />
      <section className="mk-section mk-section--sand" id="proposal">
        <div className="mk-wrap mk-split mk-split--form">
          <div>
            <h2 className="mk-h2">{t("owners.cta")}</h2>
            <p className="mk-lead">{t("sections.contactLead")}</p>
          </div>
          <LeadForm locale={locale} defaultKind="owner" kinds={["owner", "valuation", "investor"]} />
        </div>
      </section>
    </>
  );
}
