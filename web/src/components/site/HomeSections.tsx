import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { faqLd } from "@/lib/seo";

import { JsonLd } from "./JsonLd";
import { Shurfat } from "./Shurfat";

/** Infinite ticker of what we do — a band of motion between sections. */
export async function Ticker({ locale, dark = false }: { locale: string; dark?: boolean }) {
  const t = await getTranslations({ locale, namespace: "site" });
  const items = t.raw("ticker") as string[];
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined}>
      {items.map((s, i) => (
        <li key={i}>
          <span>{s}</span>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0 L12 6 L6 12 L0 6 Z" /></svg>
        </li>
      ))}
    </ul>
  );
  return (
    <div className={`mk-ticker${dark ? " mk-ticker--dark" : ""}`} id="mk-after-hero">
      <div className="mk-ticker__track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/** "Why Muktasabat" — a bento grid with cursor spotlight + a rent-estimate CTA card. */
export async function WhySection({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "site.why" });
  const cards = t.raw("cards") as [string, string, string][];
  const L = (p: string) => `/${locale}${p}`;
  return (
    <section className="mk-section mk-why" aria-labelledby="why-h">
      <div className="mk-wrap">
        <header className="mk-sechead mk-sechead--center" data-reveal>
          <p className="mk-eyebrow">{t("eyebrow")}</p>
          <h2 id="why-h" className="mk-h2">{t("title")}</h2>
          <p className="mk-lead">{t("lead")}</p>
        </header>
        <div className="mk-bento">
          {cards.map(([icon, title, body], i) => (
            <article key={icon} className={`mk-bento__card mk-bento__card--${i}`} data-reveal data-spot data-tilt style={{ ["--i" as string]: i }}>
              <span className="mk-bento__icon" aria-hidden="true"><span className="ms">{icon}</span></span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
          <article className="mk-bento__card mk-bento__map" data-reveal data-spot style={{ ["--i" as string]: 4 }}>
            <div>
              <span className="mk-bento__icon mk-bento__icon--light" aria-hidden="true"><span className="ms">real_estate_agent</span></span>
              <h3>{t("ctaTitle")}</h3>
              <p>{t("ctaBody")}</p>
            </div>
            <Link className="mk-btn mk-btn--light" href={L("/contact?kind=valuation")}>
              {t("ctaLink")}
              <span className="ms mk-flip" aria-hidden="true">arrow_forward</span>
            </Link>
            <Shurfat className="mk-bento__motif" teeth={10} />
          </article>
        </div>
      </div>
    </section>
  );
}

/** FAQ with FAQPage structured data (eligible for rich results). */
export async function FaqSection({ locale, items: custom, title: customTitle }: { locale: string; items?: [string, string][]; title?: string }) {
  const t = await getTranslations({ locale, namespace: "site.faq" });
  const items = custom ?? (t.raw("items") as [string, string][]);
  return (
    <section className="mk-section mk-faqsec" aria-labelledby="faq-h">
      <div className="mk-wrap mk-faqsec__grid">
        <header data-reveal>
          <p className="mk-eyebrow">{t("eyebrow")}</p>
          <h2 id="faq-h" className="mk-h2">{customTitle ?? t("title")}</h2>
          <Shurfat className="mk-faqsec__motif" teeth={6} />
        </header>
        <div className="mk-faq mk-faq--fancy" data-stagger>
          {items.map(([q, a], i) => (
            <details key={i} open={i === 0}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
      <JsonLd data={faqLd(items.map(([q, a]) => ({ q, a })))} />
    </section>
  );
}
