import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHead } from "@/components/site/PageHead";
import { cms, pick } from "@/lib/cms";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return { title: t("sections.newsTitle"), alternates: { languages: { ar: "/ar/news", en: "/en/news" } } };
}

export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [posts, t] = await Promise.all([cms.posts(), getTranslations({ locale, namespace: "site" })]);
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "long" });
  return (
    <>
      <PageHead title={t("sections.newsTitle")} />
      <section className="mk-section">
        <div className="mk-wrap">
          {posts.length === 0 ? (
            <p className="mk-empty">{t("news.empty")}</p>
          ) : (
            <div className="mk-posts mk-posts--list">
              {posts.map((p) => (
                <Link key={p.id} href={`/${locale}/news/${p.slug}`} className="mk-post">
                  {p.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover_url} alt="" loading="lazy" />
                  )}
                  {p.published_on && <time dateTime={p.published_on}>{fmt.format(new Date(p.published_on))}</time>}
                  <h2>{pick(locale, p, "title")}</h2>
                  {pick(locale, p, "excerpt") && <p>{pick(locale, p, "excerpt")}</p>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
