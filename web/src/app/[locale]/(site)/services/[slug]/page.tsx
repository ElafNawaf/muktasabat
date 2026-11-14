import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { LeadForm } from "@/components/site/LeadForm";
import { Markdown } from "@/components/site/Markdown";
import { PageHead } from "@/components/site/PageHead";
import { cms, pick } from "@/lib/cms";

export const revalidate = 300;

type P = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, slug } = await params;
  const s = await cms.service(slug);
  if (!s) return {};
  return {
    title: pick(locale, s, "title"),
    description: pick(locale, s, "summary"),
    alternates: { languages: { ar: `/ar/services/${slug}`, en: `/en/services/${slug}` } },
    openGraph: s.image_url ? { images: [s.image_url] } : undefined,
  };
}

export default async function ServiceDetail({ params }: P) {
  const { locale, slug } = await params;
  const [s, all, t] = await Promise.all([cms.service(slug), cms.services(), getTranslations({ locale, namespace: "site" })]);
  if (!s) notFound();
  const others = all.filter((o) => o.id !== s.id);
  return (
    <>
      <PageHead title={pick(locale, s, "title")} lead={pick(locale, s, "summary")} />
      <section className="mk-section">
        <div className="mk-wrap mk-article-grid">
          <article>
            {s.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="mk-cover" src={s.image_url} alt="" />
            )}
            <Markdown>{pick(locale, s, "body")}</Markdown>
          </article>
          <aside className="mk-aside">
            <h2 className="mk-h3">{t("services.askAbout")}</h2>
            <LeadForm locale={locale} defaultKind="owner" />
            {others.length > 0 && (
              <>
                <h2 className="mk-h3 mk-mt">{t("services.other")}</h2>
                <ul className="mk-plainlist">
                  {others.map((o) => (
                    <li key={o.id}><Link href={`/${locale}/services/${o.slug}`}>{pick(locale, o, "title")}</Link></li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}
