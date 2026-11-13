import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHead } from "@/components/site/PageHead";
import { cms, pick } from "@/lib/cms";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return { title: t("nav.careers"), description: t("sections.careersBody"), alternates: { languages: { ar: "/ar/careers", en: "/en/careers" } } };
}

export default async function CareersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [jobs, t] = await Promise.all([cms.jobs(), getTranslations({ locale, namespace: "site" })]);
  return (
    <>
      <PageHead title={t("sections.careersTitle")} lead={t("sections.careersBody")} />
      <section className="mk-section">
        <div className="mk-wrap">
          {jobs.length === 0 ? (
            <p className="mk-empty">
              {t("careers.empty")} <Link href={`/${locale}/contact`}>{t("nav.contact")}</Link>
            </p>
          ) : (
            <ul className="mk-jobs">
              {jobs.map((j) => (
                <li key={j.id}>
                  <Link href={`/${locale}/careers/${j.slug}`} className="mk-job">
                    <span className="mk-job__title">{pick(locale, j, "title")}</span>
                    <span className="mk-job__meta">
                      {pick(locale, j, "department") && <span>{pick(locale, j, "department")}</span>}
                      {pick(locale, j, "location") && <span>{pick(locale, j, "location")}</span>}
                      <span>{t(`careers.${j.employment_type}`)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
