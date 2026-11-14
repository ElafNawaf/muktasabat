import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { FaqSection } from "@/components/site/HomeSections";
import { JsonLd } from "@/components/site/JsonLd";
import { LeadForm } from "@/components/site/LeadForm";
import { ListingCard } from "@/components/site/ListingCard";
import { PageHead } from "@/components/site/PageHead";
import { cms, SITE_URL, type Listing } from "@/lib/cms";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

/** Local-SEO landing pages: "عقارات الرياض", "عقارات مكة المكرمة", … */
const CITIES = {
  riyadh: { match: ["riyadh", "الرياض"], kw: { ar: ["عقارات الرياض", "شقق للإيجار في الرياض", "فلل للبيع في الرياض", "أراضي للبيع في الرياض", "إدارة أملاك الرياض", "مكتب عقاري في الرياض"], en: ["Riyadh real estate", "apartments for rent in Riyadh", "villas for sale in Riyadh", "property management Riyadh"] } },
  makkah: { match: ["makkah", "mecca", "مكة", "مكة المكرمة"], kw: { ar: ["عقارات مكة", "عقارات مكة المكرمة", "شقق للإيجار في مكة", "عمائر للبيع في مكة", "إدارة أملاك مكة"], en: ["Makkah real estate", "Mecca property for rent", "apartments for rent in Makkah", "property management Makkah"] } },
} as const;
type City = keyof typeof CITIES;

export function generateStaticParams() {
  return Object.keys(CITIES).map((city) => ({ city }));
}

function inCity(l: Listing, city: City) {
  const names = [l.city_ar, l.city_en].filter(Boolean).map((s) => s!.trim().toLowerCase());
  return names.some((n) => CITIES[city].match.some((m) => n.includes(m)));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; city: string }> }): Promise<Metadata> {
  const { locale, city } = await params;
  if (!(city in CITIES)) return {};
  const t = await getTranslations({ locale, namespace: "site.city" });
  return pageMeta({
    locale,
    path: `/real-estate/${city}`,
    title: t(`${city}.metaTitle`),
    description: t(`${city}.lead`),
    keywords: [...CITIES[city as City].kw[locale === "ar" ? "ar" : "en"]],
    absoluteTitle: true,
  });
}

export default async function CityPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale, city } = await params;
  if (!(city in CITIES)) notFound();
  const c = city as City;
  const [all, t, tl] = await Promise.all([
    cms.listings(),
    getTranslations({ locale, namespace: "site.city" }),
    getTranslations({ locale, namespace: "site.listings" }),
  ]);
  const name = t(`${c}.name`);
  const listings = all.filter((l) => inCity(l, c));
  const L = (p: string) => `/${locale}${p}`;
  const cityParam = encodeURIComponent(name);
  const other = (Object.keys(CITIES) as City[]).filter((k) => k !== c);
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US");
  const ar = locale === "ar";

  const faq: [string, string][] = ar
    ? [
        [`كيف أجد عقارًا للإيجار في ${name}؟`, `تصفّح عقارات ${name} على هذه الصفحة أو في صفحة العقارات مع فلتر المدينة، أو اترك طلبك بنوع العقار والحي والميزانية وسنرسل لك العقارات المطابقة فور توفرها.`],
        [`هل تديرون عقارات في ${name}؟`, `نعم، نقدم إدارة أملاك متكاملة في ${name}: تسويق الوحدات، واختيار المستأجرين، وتوثيق العقود في منصة إيجار، والتحصيل، والصيانة، وتقارير مالية شهرية عبر بوابة الملاك.`],
        [`كم يستحق عقاري في ${name} من إيجار؟`, `أرسل لنا موقع العقار ومساحته ونعود إليك بتقدير مجاني مبني على صفقات الحي الفعلية خلال يوم عمل.`],
      ]
    : [
        [`How do I find a property for rent in ${name}?`, `Browse ${name} listings on this page or on the listings page with the city filter — or leave a request with the property type, district and budget, and we'll send you matches as soon as they're available.`],
        [`Do you manage properties in ${name}?`, `Yes. We offer full-service property management in ${name}: marketing, tenant selection, Ejar lease documentation, collections, maintenance and monthly financial reports in the owner portal.`],
        [`What rent could my property in ${name} earn?`, `Send us the location and size and we'll reply within one business day with a free estimate based on real transactions in the district.`],
      ];

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t(`${c}.title`),
    numberOfItems: listings.length,
    itemListElement: listings.slice(0, 30).map((l, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/${locale}/listings/${l.slug}`,
      name: ar ? l.title_ar || l.title_en : l.title_en || l.title_ar,
    })),
  };

  return (
    <>
      <PageHead
        locale={locale}
        crumbs={[{ name: tl("title"), path: "/listings" }, { name: t(`${c}.title`), path: `/real-estate/${c}` }]}
        title={t(`${c}.title`)}
        lead={t(`${c}.lead`)}
      >
        <div className="mk-citylinks">
          <Link className="mk-btn mk-btn--primary" href={L(`/listings?purpose=rent&city=${cityParam}`)}>{t("rentIn", { city: name })}</Link>
          <Link className="mk-btn mk-btn--outline" href={L(`/listings?purpose=sale&city=${cityParam}`)}>{t("saleIn", { city: name })}</Link>
        </div>
      </PageHead>

      <section className="mk-section mk-section--top">
        <div className="mk-wrap">
          <header className="mk-sechead mk-sechead--row" data-reveal>
            <h2 className="mk-h2">{t("available", { city: name })}{listings.length > 0 && ` (${nf.format(listings.length)})`}</h2>
            <Link className="mk-link" href={L(`/listings?city=${cityParam}`)}>{t("browse", { city: name })}</Link>
          </header>
          {listings.length > 0 ? (
            <div className="mk-listings" data-stagger>
              {listings.slice(0, 12).map((l, i) => (
                <ListingCard key={l.id} listing={l} locale={locale} index={i} />
              ))}
            </div>
          ) : (
            <div className="mk-split mk-split--form">
              <p className="mk-lead">{t("none", { city: name })}</p>
              <LeadForm locale={locale} defaultKind="tenant" kinds={["tenant", "buyer", "investor"]} />
            </div>
          )}
        </div>
      </section>

      <section className="mk-section mk-section--sand">
        <div className="mk-wrap mk-narrow" data-reveal>
          <p className="mk-lead mk-lead--big">{t(`${c}.body`)}</p>
        </div>
      </section>

      <section className="mk-section mk-section--tight">
        <div className="mk-wrap">
          <div className="mk-citycta" data-reveal="zoom">
            <div>
              <h2 className="mk-h2">{t("ownersTitle", { city: name })}</h2>
              <p>{t("ownersBody")}</p>
            </div>
            <Link className="mk-btn mk-btn--light" href={L("/contact?kind=valuation")}>
              {ar ? "اطلب تقديرًا مجانيًا" : "Get a free estimate"}
            </Link>
          </div>
          <p className="mk-small mk-mt">
            {t("other")}:{" "}
            {other.map((o) => (
              <Link key={o} className="mk-link" href={L(`/real-estate/${o}`)}>{t(`${o}.title`)}</Link>
            ))}
          </p>
        </div>
      </section>

      <FaqSection locale={locale} items={faq} title={ar ? `أسئلة عن عقارات ${name}` : `${name} property FAQ`} />
      {listings.length > 0 && <JsonLd data={itemList} />}
    </>
  );
}
