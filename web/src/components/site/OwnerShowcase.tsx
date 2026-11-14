import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { JsonLd } from "./JsonLd";

/** The owner-portal pitch: copy, an illustrative dashboard, and the feature list. */
export async function OwnerShowcase({ locale, full = false }: { locale: string; full?: boolean }) {
  const t = await getTranslations({ locale, namespace: "site.owners" });
  const features = t.raw("features") as [string, string, string][];
  const ar = locale === "ar";
  const bars = [42, 55, 48, 63, 58, 71, 66, 74, 69, 80, 77, 86];
  return (
    <section className={`mk-owners${full ? " mk-owners--full" : ""}`} aria-labelledby="owners-title">
      <div className="mk-wrap mk-owners__grid">
        <div className="mk-owners__copy" data-reveal="right">
          {full ? <h1 id="owners-title" className="mk-display mk-display--md">{t("title")}</h1> : <h2 id="owners-title" className="mk-h2">{t("title")}</h2>}
          <p className="mk-lead">{t("lead")}</p>
          <div className="mk-hero__ctas">
            <Link href={`/${locale}/contact`} className="mk-btn mk-btn--light">{t("cta")}</Link>
            <Link href={`/${locale}/login`} className="mk-btn mk-btn--ghost-light">{t("login")}</Link>
          </div>
        </div>

        <figure className="mk-mock" aria-label={t("illustrative")} data-reveal="zoom" data-tilt>
          <div className="mk-mock__bar"><span /><span /><span /></div>
          <div className="mk-mock__body" dir={ar ? "rtl" : "ltr"}>
            <div className="mk-mock__kpis">
              <div className="is-hero"><small>{t("mock.net")}</small><strong>{!ar && "SAR "}<span data-count="482300" data-locale={locale}>{ar ? "٤٨٢٬٣٠٠" : "482,300"}</span>{ar && " ر.س"}</strong></div>
              <div><small>{t("mock.collected")}</small><strong><span data-count="536000" data-locale={locale}>{ar ? "٥٣٦٬٠٠٠" : "536,000"}</span></strong></div>
              <div><small>{t("mock.occupancy")}</small><strong><span data-count="96" data-suffix={ar ? "٪" : "%"} data-locale={locale}>{ar ? "٩٦٪" : "96%"}</span></strong></div>
              <div><small>{t("mock.overdue")}</small><strong>{ar ? "٠" : "0"}</strong></div>
            </div>
            <div className="mk-mock__chart" aria-hidden="true" data-reveal>
              {bars.map((h, i) => (
                <span key={i} style={{ height: `${h}%`, ["--i" as string]: i }} />
              ))}
            </div>
          </div>
          <figcaption>{t("illustrative")}</figcaption>
        </figure>
      </div>

      <div className="mk-wrap">
        <ul className="mk-ofeatures" data-stagger>
          {features.map(([icon, title, body]) => (
            <li key={title} data-spot>
              <span className="ms" aria-hidden="true">{icon}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export async function ProcessSteps({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "site.owners" });
  const steps = t.raw("process") as [string, string][];
  return (
    <section className="mk-section mk-section--sand">
      <div className="mk-wrap">
        <h2 className="mk-h2" data-reveal>{t("processTitle")}</h2>
        <ol className="mk-steps" data-progress data-stagger>
          {steps.map(([title, body]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export async function OwnerFaq({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "site.owners" });
  const faq = t.raw("faq") as [string, string][];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  return (
    <section className="mk-section">
      <div className="mk-wrap mk-narrow">
        <h2 className="mk-h2">{t("faqTitle")}</h2>
        <div className="mk-faq">
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
      <JsonLd data={jsonLd} />
    </section>
  );
}
