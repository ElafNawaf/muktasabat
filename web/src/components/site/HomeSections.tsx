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

/** "Why Muktasabat" — a bento grid with cursor spotlight + coverage map card. */
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
              <h3>{t("coverageTitle")}</h3>
              <p>{t("coverageBody")}</p>
              <p className="mk-bento__cities">
                <Link href={L("/real-estate/riyadh")}>{locale === "ar" ? "عقارات الرياض" : "Riyadh property"}</Link>
                <Link href={L("/real-estate/makkah")}>{locale === "ar" ? "عقارات مكة المكرمة" : "Makkah property"}</Link>
              </p>
            </div>
            <KsaMap locale={locale} />
          </article>
        </div>
      </div>
    </section>
  );
}

/** Stylised map of the Kingdom with pulsing pins on Riyadh and Makkah. */
function KsaMap({ locale }: { locale: string }) {
  const ar = locale === "ar";
  return (
    <svg className="mk-ksa" viewBox="0 0 290 225" role="img" aria-label={ar ? "الرياض ومكة المكرمة على خريطة المملكة" : "Riyadh and Makkah on a map of Saudi Arabia"}>
      <path
        className="mk-ksa__land"
        d="M40 53 L57 40 L58 28 L72 20 L106 33 L138 56 L160 57 L174 64 L183 70 L197 82 L203 92 L212 106 L221 114 L233 131 L264 134 L270 142 L262 166 L226 178 L191 183 L172 201 L159 200 L132 197 L122 202 L113 209 L106 194 L96 178 L82 160 L72 148 L68 136 L52 114 L41 96 L24 70 L17 69 Z"
      />
      <path className="mk-ksa__route" d="M80 149 Q 118 112 162 110" />
      <g className="mk-ksa__pin" transform="translate(162 110)">
        <circle className="mk-ksa__pulse" r="14" />
        <circle r="5" />
        <text x="10" y="-10">{ar ? "الرياض" : "Riyadh"}</text>
      </g>
      <g className="mk-ksa__pin mk-ksa__pin--2" transform="translate(80 149)">
        <circle className="mk-ksa__pulse" r="14" />
        <circle r="5" />
        <text x="-12" y="24" textAnchor="middle">{ar ? "مكة المكرمة" : "Makkah"}</text>
      </g>
    </svg>
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
