import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { LeadForm } from "@/components/site/LeadForm";
import { OwnerShowcase, ProcessSteps } from "@/components/site/OwnerShowcase";
import { ProjectCard } from "@/components/site/ProjectCard";
import { Shurfat } from "@/components/site/Shurfat";
import { StatsRow } from "@/components/site/StatsRow";
import { FacadeArt } from "@/components/site/FacadeArt";
import { cms, pick, tr, waLink } from "@/lib/cms";

export const revalidate = 300;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [home, t] = await Promise.all([cms.home(), getTranslations({ locale, namespace: "site" })]);
  const { site } = home;
  const L = (p: string) => `/${locale}${p}`;
  const fmtDate = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium" });
  const wa = waLink(site.whatsapp, t("contact.whatsappMsg"));

  return (
    <>
      {/* ── Hero ── */}
      <section className="mk-hero">
        <div className="mk-wrap mk-hero__grid">
          <div className="mk-hero__copy">
            <h1 className="mk-display">{tr(locale, site.hero_title) || tr(locale, site.brand_name)}</h1>
            {tr(locale, site.hero_subtitle) && <p className="mk-hero__lead">{tr(locale, site.hero_subtitle)}</p>}
            <div className="mk-hero__ctas">
              <Link href={L("/services")} className="mk-btn mk-btn--light">{t("hero.ctaServices")}</Link>
              <Link href={L("/contact")} className="mk-btn mk-btn--ghost-light">{t("hero.ctaContact")}</Link>
            </div>
          </div>
          <div className="mk-hero__media">
            {site.hero_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.hero_image_url} alt="" fetchPriority="high" />
            ) : (
              <FacadeArt variant="hero" />
            )}
          </div>
        </div>
        <Shurfat className="mk-hero__crown" />
      </section>

      <div className="mk-wrap">
        <StatsRow
          locale={locale}
          stats={site.stats.map((s) => ({ value: s.value, suffix: s.suffix, label: tr(locale, s.label) }))}
        />
      </div>

      {/* ── About ── */}
      {tr(locale, site.about_body) && (
        <section className="mk-section mk-about">
          <div className="mk-wrap mk-split">
            <div>
              <h2 className="mk-h2">{tr(locale, site.about_title)}</h2>
              <p className="mk-lead">{tr(locale, site.about_body)}</p>
              <Link href={L("/about")} className="mk-link">{t("sections.readMore")}</Link>
            </div>
            <dl className="mk-vm">
              {tr(locale, site.vision) && (<div><dt>{t("sections.vision")}</dt><dd>{tr(locale, site.vision)}</dd></div>)}
              {tr(locale, site.mission) && (<div><dt>{t("sections.mission")}</dt><dd>{tr(locale, site.mission)}</dd></div>)}
            </dl>
          </div>
        </section>
      )}

      {/* ── Services ── */}
      {home.services.length > 0 && (
        <section className="mk-section mk-section--sand">
          <div className="mk-wrap">
            <header className="mk-sechead">
              <h2 className="mk-h2">{t("sections.servicesTitle")}</h2>
              <p className="mk-lead">{t("sections.servicesLead")}</p>
            </header>
            <ul className="mk-services">
              {home.services.map((s) => (
                <li key={s.id}>
                  <Link href={L(`/services/${s.slug}`)} className="mk-service">
                    <span className="ms mk-service__icon" aria-hidden="true">{s.icon || "home_work"}</span>
                    <span className="mk-service__text">
                      <span className="mk-service__title">{pick(locale, s, "title")}</span>
                      {pick(locale, s, "summary") && <span className="mk-service__summary">{pick(locale, s, "summary")}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Projects ── */}
      {home.projects.length > 0 && (
        <section className="mk-section">
          <div className="mk-wrap">
            <header className="mk-sechead mk-sechead--row">
              <h2 className="mk-h2">{t("sections.projectsTitle")}</h2>
              <Link href={L("/projects")} className="mk-link">{t("sections.allProjects")}</Link>
            </header>
            <div className="mk-projects">
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

      {/* ── Owner portal (value proposition for owners under management) ── */}
      <OwnerShowcase locale={locale} />
      <ProcessSteps locale={locale} />

      {/* ── Testimonials ── */}
      {home.testimonials.length > 0 && (
        <section className="mk-section">
          <div className="mk-wrap">
            <h2 className="mk-h2">{t("sections.testimonialsTitle")}</h2>
            <div className="mk-quotes">
              {home.testimonials.map((q) => (
                <figure key={q.id} className="mk-quote">
                  <blockquote>{pick(locale, q, "quote")}</blockquote>
                  <figcaption>
                    {q.avatar_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.avatar_url} alt="" loading="lazy" />
                    )}
                    <span>
                      <strong>{pick(locale, q, "name")}</strong>
                      {pick(locale, q, "role") && <small>{pick(locale, q, "role")}</small>}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Partners ── */}
      {home.partners.length > 0 && (
        <section className="mk-section mk-section--tight">
          <div className="mk-wrap">
            <h2 className="mk-h3 mk-center">{t("sections.partnersTitle")}</h2>
            <ul className="mk-partners">
              {home.partners.map((p) => {
                const name = pick(locale, p, "name");
                const inner = p.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logo_url} alt={name} loading="lazy" />
                ) : (
                  <span>{name}</span>
                );
                return (
                  <li key={p.id}>
                    {p.website ? <a href={p.website} target="_blank" rel="noopener noreferrer">{inner}</a> : inner}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* ── News ── */}
      {home.posts.length > 0 && (
        <section className="mk-section mk-section--sand">
          <div className="mk-wrap">
            <header className="mk-sechead mk-sechead--row">
              <h2 className="mk-h2">{t("sections.newsTitle")}</h2>
              <Link href={L("/news")} className="mk-link">{t("sections.allNews")}</Link>
            </header>
            <div className="mk-posts">
              {home.posts.map((p) => (
                <Link key={p.id} href={L(`/news/${p.slug}`)} className="mk-post">
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
            </ul>
          </div>
          <LeadForm locale={locale} />
        </div>
      </section>
    </>
  );
}
