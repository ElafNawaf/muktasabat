import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { faqLd } from "@/lib/seo";

import { JsonLd } from "./JsonLd";
import { Shurfat } from "./Shurfat";

/** "Why Muktasabat": the promise on one side, four concrete commitments as a
 *  ruled list on the other, and the rent-estimate offer as the one dark block. */
export async function WhySection({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "site.why" });
  const cards = t.raw("cards") as [string, string, string][];
  const L = (p: string) => `/${locale}${p}`;
  return (
    <section className="mk-section mk-why" aria-labelledby="why-h">
      <div className="mk-wrap mk-why__grid">
        <div className="mk-why__intro" data-reveal="right">
          <h2 id="why-h" className="mk-h2">{t("title")}</h2>
          <p className="mk-lead">{t("lead")}</p>
          <div className="mk-offer" data-tilt data-spot>
            <span className="ms mk-offer__icon" aria-hidden="true">real_estate_agent</span>
            <div>
              <h3>{t("ctaTitle")}</h3>
              <p>{t("ctaBody")}</p>
            </div>
            <Link className="mk-btn mk-btn--light" href={L("/contact?kind=valuation")}>{t("ctaLink")}</Link>
            <Shurfat className="mk-offer__motif" teeth={12} />
          </div>
        </div>
        <ul className="mk-points" data-stagger>
          {cards.map(([icon, title, body]) => (
            <li key={icon}>
              <span className="ms mk-points__icon" aria-hidden="true">{icon}</span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ul>
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
        <header data-reveal="right">
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

/** A slow, endless band of what we do — two rows drifting in opposite
 *  directions, each item with its own accent colour. Pauses on hover; static
 *  under reduced motion. Decorative (the same content is in Services). */
export function Marquee({ locale }: { locale: string }) {
  const ar = locale === "ar";
  const a: [string, string][] = ar
    ? [["apartment", "إدارة الأملاك"], ["key", "تأجير سكني"], ["storefront", "تأجير تجاري"], ["sell", "بيع العقارات"], ["contract", "عقود موثّقة في إيجار"], ["query_stats", "تقييم إيجاري مجاني"]]
    : [["apartment", "Property management"], ["key", "Residential leasing"], ["storefront", "Commercial leasing"], ["sell", "Property sales"], ["contract", "Ejar-registered leases"], ["query_stats", "Free rent estimate"]];
  const b: [string, string][] = ar
    ? [["campaign", "تسويق عقاري احترافي"], ["payments", "تحصيل الإيجارات"], ["handyman", "صيانة وتشغيل"], ["monitoring", "تقارير شهرية للملاك"], ["verified_user", "مكتب مرخّص"], ["support_agent", "متابعة المستأجرين"]]
    : [["campaign", "Professional marketing"], ["payments", "Rent collection"], ["handyman", "Maintenance"], ["monitoring", "Monthly owner reports"], ["verified_user", "Licensed office"], ["support_agent", "Tenant follow-up"]];
  const Row = ({ items, reverse }: { items: [string, string][]; reverse?: boolean }) => (
    <div className={`mk-mq__row${reverse ? " mk-mq__row--rev" : ""}`}>
      <ul className="mk-mq__track">
        {[...items, ...items, ...items, ...items].map(([icon, text], i) => (
          <li key={i} className={`mk-mq__item mk-tone-${(i % 4) + 1}`}>
            <span className="ms" aria-hidden="true">{icon}</span>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="mk-mq" aria-hidden="true">
      <Row items={a} />
      <Row items={b} reverse />
    </div>
  );
}
