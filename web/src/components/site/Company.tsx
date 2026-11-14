import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { mapLinks, tr, type SiteData } from "@/lib/cms";

/** Google Maps embed of the office, with "open" and "directions" buttons. */
export async function OfficeMap({ locale, site }: { locale: string; site: SiteData }) {
  const t = await getTranslations({ locale, namespace: "site" });
  const brand = tr(locale, site.brand_name);
  const links = mapLinks(site, brand);
  if (!links.embed && !links.open) return null;
  return (
    <figure className="mk-officemap">
      {links.embed && (
        <iframe
          src={links.embed}
          title={`${t("map.title")}: ${brand}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      )}
      <figcaption>
        <span>
          <strong>{brand}</strong>
          {tr(locale, site.address) && <small>{tr(locale, site.address)}</small>}
        </span>
        <span className="mk-officemap__btns">
          {links.open && links.open !== links.directions && (
            <a className="mk-btn mk-btn--outline mk-btn--sm" href={links.open} target="_blank" rel="noopener noreferrer">
              <span className="ms" aria-hidden="true">map</span>
              {t("map.open")}
            </a>
          )}
          {links.directions && (
            <a className="mk-btn mk-btn--primary mk-btn--sm" href={links.directions} target="_blank" rel="noopener noreferrer">
              <span className="ms" aria-hidden="true">directions</span>
              {t("map.directions")}
            </a>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

/** Credentials that matter in the Saudi market, stated plainly. */
export async function TrustStrip({ locale, site }: { locale: string; site: SiteData }) {
  const t = await getTranslations({ locale, namespace: "site.trust" });
  const coverage = tr(locale, site.coverage);
  const items = [
    { icon: "verified", text: t("verified") },
    { icon: "gavel", text: t("licensed") },
    { icon: "contract", text: t("ejar") },
    { icon: "monitoring", text: t("reports") },
  ];
  return (
    <section className="mk-section mk-section--tight mk-trust" aria-labelledby="trust-h">
      <div className="mk-wrap">
        <div className="mk-trust__head">
          <h2 id="trust-h" className="mk-h3">{t("title")}</h2>
          {coverage && (
            <p className="mk-trust__where">
              <span className="ms" aria-hidden="true">location_on</span>
              {t("coverage")} {coverage}
            </p>
          )}
        </div>
        <ul className="mk-trust__list">
          {items.map((i) => (
            <li key={i.icon}>
              <span className="ms" aria-hidden="true">{i.icon}</span>
              {i.text}
            </li>
          ))}
        </ul>
        {site.aqar_url && (
          <a className="mk-link" href={site.aqar_url} target="_blank" rel="noopener noreferrer">{t("aqarCta")}</a>
        )}
      </div>
    </section>
  );
}

/** The owner-acquisition hook: a free rent estimate. */
export async function ValuationBand({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "site.valuation" });
  return (
    <section className="mk-valuation">
      <div className="mk-wrap mk-valuation__inner">
        <div>
          <h2 className="mk-h2">{t("title")}</h2>
          <p>{t("lead")}</p>
        </div>
        <Link href={`/${locale}/contact?kind=valuation`} className="mk-btn mk-btn--light">{t("cta")}</Link>
      </div>
    </section>
  );
}
