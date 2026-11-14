import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { FacadeArt } from "@/components/site/FacadeArt";
import { LeadForm } from "@/components/site/LeadForm";
import { ListingCard, ListingSpecs, PriceTag } from "@/components/site/ListingCard";
import { Markdown } from "@/components/site/Markdown";
import { ProjectMap } from "@/components/site/ProjectMap";
import { ShareButton } from "@/components/site/ShareButton";
import { SITE_URL, artVariant, cms, pick, waLink, type Listing } from "@/lib/cms";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

type P = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, slug } = await params;
  const l = await cms.listing(slug);
  if (!l) return {};
  const cover = l.cover_url || l.gallery[0];
  return pageMeta({ locale, path: `/listings/${slug}`, title: pick(locale, l, "title"), description: pick(locale, l, "summary"), image: cover });
}

function lines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((x) => x.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function youtubeId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,20})/);
  return m ? m[1] : null;
}

export default async function ListingDetail({ params }: P) {
  const { locale, slug } = await params;
  const [l, all, site, t] = await Promise.all([
    cms.listing(slug),
    cms.listings(),
    cms.site(),
    getTranslations({ locale, namespace: "site" }),
  ]);
  if (!l) notFound();

  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US");
  const title = pick(locale, l, "title");
  const city = pick(locale, l, "city");
  const district = pick(locale, l, "district");
  const where = [district, city].filter(Boolean).join(locale === "ar" ? "، " : ", ");
  const ref = l.ref || `#${l.id}`;
  const url = `${SITE_URL}/${locale}/listings/${l.slug}`;
  const wa = waLink(site.whatsapp, `${t("listings.waMsg", { ref, title })}\n${url}`);
  const photos = [l.cover_url, ...l.gallery].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  const features = lines(pick(locale, l, "features"));
  const yt = youtubeId(l.video_url);
  const closed = l.status !== "available";

  const facts: [string, string][] = [[t("listings.type"), t(`listings.t_${l.property_type}`)]];
  if (where) facts.push([t("listings.location"), where]);
  if (l.area_sqm) facts.push([t("projects.area"), `${nf.format(l.area_sqm)} ${t("listings.sqm")}`]);
  if (l.bedrooms != null) facts.push([t("listings.minBeds"), nf.format(l.bedrooms)]);
  if (l.bathrooms != null) facts.push([t("listings.baths"), nf.format(l.bathrooms)]);
  if (l.living_rooms != null) facts.push([t("listings.living"), nf.format(l.living_rooms)]);
  if (l.floor) facts.push([t("listings.floor"), l.floor]);
  if (l.street_width_m) facts.push([t("listings.street"), `${nf.format(l.street_width_m)} ${locale === "ar" ? "م" : "m"}`]);
  if (l.facade) facts.push([t("listings.facade"), t(`listings.${l.facade}`)]);
  if (l.age_years != null) facts.push([t("listings.age"), l.age_years === 0 ? t("listings.new") : `${nf.format(l.age_years)} ${t("listings.years")}`]);
  if (l.furnished) facts.push([t("listings.furnished"), "✓"]);
  facts.push([t("listings.ref"), ref]);
  if (l.ad_licence) facts.push([t("listings.adLicence"), l.ad_licence]);

  const similar = all
    .filter((x: Listing) => x.id !== l.id && x.purpose === l.purpose && x.status === "available" && (pick(locale, x, "city") === city || x.property_type === l.property_type))
    .slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: title,
    url,
    description: pick(locale, l, "summary") || undefined,
    image: photos.length ? photos.map((p) => (p.startsWith("/") ? `${SITE_URL}${p}` : p)) : undefined,
    datePosted: l.updated_at,
    offers: l.price
      ? { "@type": "Offer", price: l.price, priceCurrency: "SAR", availability: closed ? "https://schema.org/SoldOut" : "https://schema.org/InStock", businessFunction: l.purpose === "rent" ? "http://purl.org/goodrelations/v1#LeaseOut" : "http://purl.org/goodrelations/v1#Sell" }
      : undefined,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className="mk-section mk-section--top">
        <div className="mk-wrap">
          <Link href={`/${locale}/listings`} className="mk-back mk-back--dark">{t("listings.back")}</Link>

          <div className={`mk-shots mk-shots--${Math.min(photos.length, 5)}`}>
            {photos.length === 0 ? (
              <div className="mk-shots__main"><FacadeArt variant={artVariant(l.property_type)} /></div>
            ) : (
              photos.slice(0, 5).map((src, i) => (
                <a key={src} href={src} target="_blank" rel="noopener noreferrer" className={i === 0 ? "mk-shots__main" : undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`${title} ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} />
                  {i === 4 && photos.length > 5 && <span className="mk-shots__more">+{photos.length - 5}</span>}
                </a>
              ))
            )}
          </div>

          <div className="mk-article-grid mk-mt">
            <article>
              <p className="mk-listing__type mk-listing__type--lg">
                <span className={`mk-pill mk-pill--${l.purpose}`}>{t(`listings.${l.purpose}`)}</span>
                {l.exclusive && <span className="mk-pill">{t("listings.exclusive")}</span>}
                {closed && <span className="mk-pill mk-pill--closed">{t(`listings.status_${l.status}`)}</span>}
                {where && <span>{where}</span>}
              </p>
              <h1 className="mk-display mk-display--md mk-display--ink">{title}</h1>
              {pick(locale, l, "summary") && <p className="mk-lead mk-lead--big">{pick(locale, l, "summary")}</p>}
              <ListingSpecs listing={l} locale={locale} />

              {features.length > 0 && (
                <>
                  <h2 className="mk-h3 mk-mt">{t("listings.features")}</h2>
                  <ul className="mk-ticks">
                    {features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </>
              )}

              {pick(locale, l, "body") && (
                <>
                  <h2 className="mk-h3 mk-mt">{t("listings.description")}</h2>
                  <Markdown>{pick(locale, l, "body")}</Markdown>
                </>
              )}

              <h2 className="mk-h3 mk-mt">{t("listings.details")}</h2>
              <dl className="mk-facts">
                {facts.map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>

              {yt && (
                <p className="mk-mt">
                  <a className="mk-btn mk-btn--outline" href={`https://www.youtube.com/watch?v=${yt}`} target="_blank" rel="noopener noreferrer">
                    <span className="ms" aria-hidden="true">play_circle</span>
                    {t("listings.video")}
                  </a>
                </p>
              )}

              {l.lat != null && l.lng != null && (
                <>
                  <h2 className="mk-h3 mk-mt">{t("listings.location")}</h2>
                  <ProjectMap lat={l.lat} lng={l.lng} label={title} />
                </>
              )}
            </article>

            <aside className="mk-aside">
              <div className="mk-deal">
                <PriceTag listing={l} locale={locale} size="lg" />
                <div className="mk-deal__actions">
                  {wa && !closed && (
                    <a className="mk-btn mk-btn--primary" href={wa} target="_blank" rel="noopener noreferrer">
                      <span className="ms" aria-hidden="true">chat</span>
                      {t("listings.askWhatsapp")}
                    </a>
                  )}
                  {site.phone && (
                    <a className="mk-btn mk-btn--outline" href={`tel:${site.phone.replace(/\s/g, "")}`}>
                      <span className="ms" aria-hidden="true">call</span>
                      {t("listings.call")}
                    </a>
                  )}
                  <ShareButton title={title} label={t("listings.share")} copiedLabel={t("listings.copied")} />
                </div>
                {!closed && (
                  <div className="mk-deal__form">
                    <h2 className="mk-h3">{t("listings.bookViewing")}</h2>
                    <p className="mk-small">{t("listings.bookLead")}</p>
                    <LeadForm
                      locale={locale}
                      defaultKind="viewing"
                      hideKinds
                      sourcePage={`/${locale}/listings/${l.slug}`}
                      defaultMessage={t("listings.viewingMsg", { ref, title })}
                    />
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      {similar.length > 0 && (
        <section className="mk-section mk-section--sand">
          <div className="mk-wrap">
            <h2 className="mk-h2">{t("listings.similar")}</h2>
            <div className="mk-listings">
              {similar.map((x) => (
                <ListingCard key={x.id} listing={x} locale={locale} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
