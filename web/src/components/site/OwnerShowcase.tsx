import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** The owner-portal pitch: copy, an illustrative dashboard, and the feature list. */
export async function OwnerShowcase({ locale, full = false }: { locale: string; full?: boolean }) {
  const t = await getTranslations({ locale, namespace: "site.owners" });
  const features = t.raw("features") as [string, string, string][];
  const ar = locale === "ar";
  const bars = [42, 55, 48, 63, 58, 71, 66, 74, 69, 80, 77, 86];
  return (
    <section className={`mk-owners${full ? " mk-owners--full" : ""}`} aria-labelledby="owners-title">
      <div className="mk-wrap mk-owners__grid">
        <div className="mk-owners__copy">
          {full ? <h1 id="owners-title" className="mk-display mk-display--md">{t("title")}</h1> : <h2 id="owners-title" className="mk-h2">{t("title")}</h2>}
          <p className="mk-lead">{t("lead")}</p>
          <div className="mk-hero__ctas">
            <Link href={`/${locale}/contact`} className="mk-btn mk-btn--light">{t("cta")}</Link>
            <Link href={`/${locale}/login`} className="mk-btn mk-btn--ghost-light">{t("login")}</Link>
          </div>
        </div>

        <figure className="mk-mock" aria-label={t("illustrative")}>
          <div className="mk-mock__bar"><span /><span /><span /></div>
          <div className="mk-mock__body" dir={ar ? "rtl" : "ltr"}>
            <div className="mk-mock__kpis">
              <div className="is-hero"><small>{t("mock.net")}</small><strong>{ar ? "٤٨٢٬٣٠٠ ر.س" : "SAR 482,300"}</strong></div>
              <div><small>{t("mock.collected")}</small><strong>{ar ? "٥٣٦٬٠٠٠" : "536,000"}</strong></div>
              <div><small>{t("mock.occupancy")}</small><strong>{ar ? "٩٦٪" : "96%"}</strong></div>
              <div><small>{t("mock.overdue")}</small><strong>{ar ? "٠" : "0"}</strong></div>
            </div>
            <div className="mk-mock__chart" aria-hidden="true">
              {bars.map((h, i) => (
                <span key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <figcaption>{t("illustrative")}</figcaption>
        </figure>
      </div>

      <div className="mk-wrap">
        <ul className="mk-ofeatures">
          {features.map(([icon, title, body]) => (
            <li key={title}>
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
        <h2 className="mk-h2">{t("processTitle")}</h2>
        <ol className="mk-steps">
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </section>
  );
}
