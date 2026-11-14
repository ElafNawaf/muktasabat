import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Carousel } from "@/components/site/Carousel";
import { OfficeMap, TrustStrip, ValuationBand } from "@/components/site/Company";
import { HeroCinema } from "@/components/site/HeroCinema";
import { FaqSection, WhySection } from "@/components/site/HomeSections";
import { LeadForm } from "@/components/site/LeadForm";
import { ListingCard } from "@/components/site/ListingCard";
import { OwnerShowcase, ProcessSteps } from "@/components/site/OwnerShowcase";
import { ProjectCard } from "@/components/site/ProjectCard";
import { StatsRow } from "@/components/site/StatsRow";
import { cms, pick, tr, waLink, type ListingType } from "@/lib/cms";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

const TYPES: ListingType[] = ["apartment", "villa", "floor", "duplex", "land", "building", "office", "shop", "warehouse", "rest_house"];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const site = await cms.site();
  return pageMeta({
    locale,
    path: "",
    title: tr(locale, site.seo_title) || tr(locale, site.brand_name),
    description: tr(locale, site.seo_description) || tr(locale, site.tagline),
    image: site.og_image_url || site.hero_slides?.find(Boolean) || site.hero_image_url,
    absoluteTitle: true,
  });
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [home, t] = await Promise.all([cms.home(), getTranslations({ locale, namespace: "site" })]);
  const { site } = home;
  const L = (p: string) => `/${locale}${p}`;
  const ar = locale === "ar";
  const fmtDate = new Intl.DateTimeFormat(ar ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium" });
  const wa = waLink(site.whatsapp, t("contact.whatsappMsg"));
  const slides = [...(site.hero_slides ?? []), site.hero_image_url].filter((s): s is string => !!s);

  // City options come only from published listings (no hard-coded cities);
  // the hero hides the city picker when there are fewer than two.
  const cities = Array.from(new Set(home.listings.map((l) => pick(locale, l, "city")).filter(Boolean)));

  return (
    <>
      <HeroCinema
        locale={locale}
        kicker={t("cinema.kicker")}
        title={tr(locale, site.hero_title) || tr(locale, site.brand_name)}
        subtitle={tr(locale, site.hero_subtitle) || undefined}
        badge={t("cinema.badge")}
        rotateLead={t("cinema.rotateLead")}
        rotate={t.raw("cinema.rotate") as string[]}
        slides={slides}
        video={site.hero_video_url}
        types={TYPES.map((v) => ({ value: v, label: t(`listings.t_${v}`) }))}
        cities={cities.map((c) => ({ value: c, label: c }))}
        chips={t.raw("cinema.chips") as [string, string][]}
        labels={{
          searchLabel: t("cinema.searchLabel"),
          tabRent: t("cinema.tabRent"),
          tabSale: t("cinema.tabSale"),
          tabOwner: t("cinema.tabOwner"),
          anyType: t("cinema.anyType"),
          anyCity: t("cinema.anyCity"),
          search: t("cinema.search"),
          ownerCta: t("cinema.ownerCta"),
          ownerHint: t("cinema.ownerHint"),
          popular: t("cinema.popular"),
          scroll: t("cinema.scroll"),
          prev: t("cinema.prev"),
          next: t("cinema.next"),
          pause: t("cinema.pause"),
          play: t("cinema.play"),
          slide: t("cinema.slide"),
        }}
      />

      <div className="mk-wrap">
        <StatsRow
          locale={locale}
          stats={site.stats.map((s) => ({ value: s.value, suffix: s.suffix, label: tr(locale, s.label) }))}
        />
      </div>

      <WhySection locale={locale} />

      {/* ── Latest listings ── */}
      {home.listings.length > 0 && (
        <section className="mk-section mk-section--sand mk-latest">
          <div className="mk-wrap">
            <header className="mk-sechead mk-sechead--row">
              <div>
                <h2 className="mk-h2">{t("listings.latest")}</h2>
                <p className="mk-lead">{t("listings.lead")}</p>
              </div>
              <Link href={L("/listings")} className="mk-btn mk-btn--outline">
                {t("listings.all")}
                <span className="ms mk-flip" aria-hidden="true">arrow_forward</span>
              </Link>
            </header>
            <Carousel label={t("listings.latest")} prevLabel={t("cinema.prev")} nextLabel={t("cinema.next")}>
              {home.listings.map((l, i) => (
                <ListingCard key={l.id} listing={l} locale={locale} index={i} />
              ))}
            </Carousel>
          </div>
        </section>
      )}

      {/* ── Services ── */}
      {home.services.length > 0 && (
        <section className="mk-section mk-svc" aria-labelledby="svc-h">
          <div className="mk-wrap">
            <header className="mk-sechead mk-sechead--row">
              <div>
                <h2 id="svc-h" className="mk-h2">{t("sections.servicesTitle")}</h2>
                <p className="mk-lead">{t("sections.servicesLead")}</p>
              </div>
              <Link href={L("/services")} className="mk-link">{t("nav.services")}</Link>
            </header>
            <ul className="mk-svclist">
              {home.services.map((s) => (
                <li key={s.id}>
                  <Link href={L(`/services/${s.slug}`)} className="mk-svcrow">
                    <span className="ms mk-svcrow__icon" aria-hidden="true">{s.icon || "home_work"}</span>
                    <span className="mk-svcrow__text">
                      <span className="mk-svcrow__title">{pick(locale, s, "title")}</span>
                      {pick(locale, s, "summary") && <span className="mk-svcrow__summary">{pick(locale, s, "summary")}</span>}
                    </span>
                    <span className="ms mk-svcrow__go mk-flip" aria-hidden="true">arrow_forward</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Owner portal (value proposition for owners under management) ── */}
      <OwnerShowcase locale={locale} />
      <ProcessSteps locale={locale} />

      {/* ── Projects ── */}
      {home.projects.length > 0 && (
        <section className="mk-section">
          <div className="mk-wrap">
            <header className="mk-sechead mk-sechead--row">
              <div>
                <h2 className="mk-h2">{t("sections.projectsTitle")}</h2>
              </div>
              <Link href={L("/projects")} className="mk-link">{t("sections.allProjects")}</Link>
            </header>
            <div className="mk-projects" >
              {home.projects.map((p, i) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  locale={locale}
                  categoryLabel={t(`projects.${p.category}`)}
                  statusLabel={t(`projects.${p.status}`)}
                  large={i === 0 && home.projects.length > 2}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <ValuationBand locale={locale} />
      <TrustStrip locale={locale} site={site} />

      {/* ── Testimonials ── */}
      {home.testimonials.length > 0 && (
        <section className="mk-section mk-section--sand">
          <div className="mk-wrap">
            <header className="mk-sechead">
              <h2 className="mk-h2">{t("sections.testimonialsTitle")}</h2>
            </header>
            <Carousel label={t("sections.testimonialsTitle")} prevLabel={t("cinema.prev")} nextLabel={t("cinema.next")} className="mk-carousel--quotes">
              {home.testimonials.map((q) => (
                <figure key={q.id} className="mk-quote mk-quote--card">
                  {q.rating > 0 && (
                    <p className="mk-stars" aria-label={`${q.rating}/5`}>
                      {"★★★★★".slice(0, Math.round(q.rating))}
                      <span>{"★★★★★".slice(Math.round(q.rating))}</span>
                    </p>
                  )}
                  <blockquote>{pick(locale, q, "quote")}</blockquote>
                  <figcaption>
                    {q.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.avatar_url} alt="" loading="lazy" />
                    ) : (
                      <span className="mk-quote__ini" aria-hidden="true">{pick(locale, q, "name").slice(0, 1)}</span>
                    )}
                    <span>
                      <strong>{pick(locale, q, "name")}</strong>
                      {pick(locale, q, "role") && <small>{pick(locale, q, "role")}</small>}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </Carousel>
          </div>
        </section>
      )}

      {/* ── Partners (marquee) ── */}
      {home.partners.length > 0 && (
        <section className="mk-section mk-section--tight">
          <div className="mk-wrap">
            <h2 className="mk-h3 mk-center">{t("sections.partnersTitle")}</h2>
          </div>
          <div className="mk-logos">
            <div className="mk-logos__track">
              {[0, 1].map((dup) => (
                <ul key={dup} aria-hidden={dup === 1 || undefined}>
                  {home.partners.map((p) => {
                    const name = pick(locale, p, "name");
                    const inner = p.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.logo_url} alt={dup ? "" : name} loading="lazy" />
                    ) : (
                      <span>{name}</span>
                    );
                    return (
                      <li key={p.id}>
                        {p.website && !dup ? <a href={p.website} target="_blank" rel="noopener noreferrer">{inner}</a> : inner}
                      </li>
                    );
                  })}
                </ul>
              ))}
            </div>
          </div>
        </section>
      )}

      <FaqSection locale={locale} />

      {/* ── News ── */}
      {home.posts.length > 0 && (
        <section className="mk-section mk-section--sand">
          <div className="mk-wrap">
            <header className="mk-sechead mk-sechead--row">
              <h2 className="mk-h2">{t("sections.newsTitle")}</h2>
              <Link href={L("/news")} className="mk-link">{t("sections.allNews")}</Link>
            </header>
            <div className="mk-posts" >
              {home.posts.map((p) => (
                <Link key={p.id} href={L(`/news/${p.slug}`)} className="mk-post">
                  {p.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover_url} alt="" loading="lazy" />
                  )}
                  {p.published_on && <time dateTime={p.published_on}>{fmtDate.format(new Date(p.published_on))}</time>}
                  <h3>{pick(locale, p, "title")}</h3>
                  {pick(locale, p, "excerpt") && <p>{pick(locale, p, "excerpt")}</p>}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Careers strip ── */}
      {home.open_jobs > 0 && (
        <section className="mk-section mk-section--tight">
          <div className="mk-wrap"><div className="mk-careers-strip">
            <div>
              <h2 className="mk-h3">{t("sections.careersTitle")}</h2>
              <p>{t("sections.openRoles", { count: home.open_jobs })}</p>
            </div>
            <Link href={L("/careers")} className="mk-btn mk-btn--outline">{t("sections.careersCta")}</Link>
          </div></div>
        </section>
      )}

      {/* ── Contact ── */}
      <section className="mk-section mk-contact" id="contact">
        <div className="mk-wrap mk-split mk-split--form">
          <div>
            <h2 className="mk-h2">{t("sections.contactTitle")}</h2>
            <p className="mk-lead">{t("sections.contactLead")}</p>
            <ul className="mk-contactlist">
              {site.phone && (
                <li><span className="ms" aria-hidden="true">call</span><a href={`tel:${site.phone.replace(/\s/g, "")}`} dir="ltr">{site.phone}</a></li>
              )}
              {wa && (
                <li><span className="ms" aria-hidden="true">chat</span><a href={wa} target="_blank" rel="noopener noreferrer">{t("contact.whatsapp")}</a></li>
              )}
              {site.email && (
                <li><span className="ms" aria-hidden="true">mail</span><a href={`mailto:${site.email}`}>{site.email}</a></li>
              )}
              {tr(locale, site.working_hours) && (
                <li><span className="ms" aria-hidden="true">schedule</span>{tr(locale, site.working_hours)}</li>
              )}
            </ul>
            <OfficeMap locale={locale} site={site} />
          </div>
          <div>
            <LeadForm locale={locale} />
          </div>
        </div>
      </section>
    </>
  );
}
