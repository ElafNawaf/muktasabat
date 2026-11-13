import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHead } from "@/components/site/PageHead";
import { cms, pick } from "@/lib/cms";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return {
    title: t("sections.servicesTitle"),
    description: t("sections.servicesLead"),
    alternates: { languages: { ar: "/ar/services", en: "/en/services" } },
  };
}

export default async function ServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [services, t] = await Promise.all([cms.services(), getTranslations({ locale, namespace: "site" })]);
  return (
    <>
      <PageHead title={t("sections.servicesTitle")} lead={t("sections.servicesLead")} />
      <section className="mk-section">
        <div className="mk-wrap">
          <ul className="mk-services mk-services--detailed">
            {services.map((s) => (
              <li key={s.id}>
                <Link href={`/${locale}/services/${s.slug}`} className="mk-service">
                  <span className="ms mk-service__icon" aria-hidden="true">{s.icon || "home_work"}</span>
                  <span className="mk-service__text">
                    <span className="mk-service__title">{pick(locale, s, "title")}</span>
                    {pick(locale, s, "summary") && <span className="mk-service__summary">{pick(locale, s, "summary")}</span>}
                    <span className="mk-link">{t("services.details")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
