import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { FacadeArt } from "@/components/site/FacadeArt";
import { Markdown } from "@/components/site/Markdown";
import { ProjectMap } from "@/components/site/ProjectMap";
import { cms, pick } from "@/lib/cms";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

type P = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await cms.project(slug);
  if (!p) return {};
  return pageMeta({ locale, path: `/projects/${slug}`, title: pick(locale, p, "title"), description: pick(locale, p, "summary"), image: p.cover_url });
}

export default async function ProjectDetail({ params }: P) {
  const { locale, slug } = await params;
  const [p, t] = await Promise.all([cms.project(slug), getTranslations({ locale, namespace: "site" })]);
  if (!p) notFound();
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US");
  const title = pick(locale, p, "title");
  const facts: [string, string][] = [
    [t("projects.category"), t(`projects.${p.category}`)],
    [t("projects.status"), t(`projects.${p.status}`)],
  ];
  if (pick(locale, p, "city")) facts.push([t("projects.city"), pick(locale, p, "city")]);
  if (p.area_sqm) facts.push([t("projects.area"), `${nf.format(p.area_sqm)} ${t("projects.sqm")}`]);
  if (p.units_count) facts.push([t("projects.units"), nf.format(p.units_count)]);
  if (p.year) facts.push([t("projects.year"), String(p.year)]);

  return (
    <>
      <section className="mk-projecthero">
        {p.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.cover_url} alt="" fetchPriority="high" />
        ) : (
          <FacadeArt variant={p.category} className="mk-projecthero__art" />
        )}
        <div className="mk-wrap mk-projecthero__copy">
          <Link href={`/${locale}/projects`} className="mk-back">{t("nav.projects")}</Link>
          <h1 className="mk-display mk-display--md">{title}</h1>
          {pick(locale, p, "summary") && <p className="mk-hero__lead">{pick(locale, p, "summary")}</p>}
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-wrap mk-article-grid">
          <article>
            <Markdown>{pick(locale, p, "body")}</Markdown>
            {p.gallery.length > 0 && (
              <>
                <h2 className="mk-h3 mk-mt">{t("projects.gallery")}</h2>
                <div className="mk-gallery">
                  {p.gallery.map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`${title} ${i + 1}`} loading="lazy" />
                    </a>
                  ))}
                </div>
              </>
            )}
          </article>
          <aside className="mk-aside">
            <dl className="mk-facts">
              {facts.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {p.lat != null && p.lng != null && (
              <>
                <h2 className="mk-h3 mk-mt">{t("projects.location")}</h2>
                <ProjectMap lat={p.lat} lng={p.lng} label={title} />
              </>
            )}
            <Link href={`/${locale}/contact`} className="mk-btn mk-btn--primary mk-mt">{t("hero.ctaContact")}</Link>
          </aside>
        </div>
      </section>
    </>
  );
}
