import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { OfficeMap, TrustStrip } from "@/components/site/Company";
import { FacadeArt } from "@/components/site/FacadeArt";
import { PageHead } from "@/components/site/PageHead";
import { StatsRow } from "@/components/site/StatsRow";
import { cms, tr } from "@/lib/cms";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const site = await cms.site();
  return {
    title: tr(locale, site.about_title),
    description: tr(locale, site.about_body).slice(0, 160),
    alternates: { languages: { ar: "/ar/about", en: "/en/about" } },
  };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [site, t] = await Promise.all([cms.site(), getTranslations({ locale, namespace: "site" })]);
  return (
    <>
      <PageHead title={tr(locale, site.about_title) || t("nav.about")} />
      <section className="mk-section">
        <div className="mk-wrap mk-split">
          <div>
            <p className="mk-lead mk-lead--big">{tr(locale, site.about_body)}</p>
          </div>
          <div className="mk-figure">
            {site.about_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.about_image_url} alt="" />
            ) : (
              <FacadeArt variant="residential" />
            )}
          </div>
        </div>
        <div className="mk-wrap">
          <StatsRow locale={locale} stats={site.stats.map((s) => ({ value: s.value, suffix: s.suffix, label: tr(locale, s.label) }))} />
        </div>
      </section>

      {(tr(locale, site.vision) || tr(locale, site.mission)) && (
        <section className="mk-section mk-section--sand">
          <div className="mk-wrap">
            <dl className="mk-vm mk-vm--wide">
              {tr(locale, site.vision) && (<div><dt>{t("sections.vision")}</dt><dd>{tr(locale, site.vision)}</dd></div>)}
              {tr(locale, site.mission) && (<div><dt>{t("sections.mission")}</dt><dd>{tr(locale, site.mission)}</dd></div>)}
            </dl>
          </div>
        </section>
      )}

      {site.values.length > 0 && (
        <section className="mk-section">
          <div className="mk-wrap">
            <h2 className="mk-h2">{t("sections.values")}</h2>
            <ul className="mk-values">
              {site.values.map((v, i) => (
                <li key={i}>
                  {v.icon && <span className="ms" aria-hidden="true">{v.icon}</span>}
                  <h3>{tr(locale, v.title)}</h3>
                  <p>{tr(locale, v.body)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="mk-section mk-section--tight">
        <div className="mk-wrap"><div className="mk-careers-strip">
          <h2 className="mk-h3">{t("sections.contactTitle")}</h2>
          <Link href={`/${locale}/contact`} className="mk-btn mk-btn--primary">{t("nav.contact")}</Link>
        </div></div>
      </section>
      <TrustStrip locale={locale} site={site} />
      <section className="mk-section mk-section--tight">
        <div className="mk-wrap"><OfficeMap locale={locale} site={site} /></div>
      </section>
    </>
  );
}
