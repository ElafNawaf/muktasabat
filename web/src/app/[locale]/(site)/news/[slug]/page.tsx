import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Markdown } from "@/components/site/Markdown";
import { cms, pick } from "@/lib/cms";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

type P = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await cms.post(slug);
  if (!p) return {};
  const m = pageMeta({ locale, path: `/news/${slug}`, title: pick(locale, p, "title"), description: pick(locale, p, "excerpt"), image: p.cover_url, type: "article" });
  return { ...m, openGraph: { ...m.openGraph, type: "article", publishedTime: p.published_on ?? undefined } };
}

export default async function PostPage({ params }: P) {
  const { locale, slug } = await params;
  const [p, t] = await Promise.all([cms.post(slug), getTranslations({ locale, namespace: "site" })]);
  if (!p) notFound();
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "long" });
  return (
    <article className="mk-section">
      <div className="mk-wrap mk-narrow">
        <Link href={`/${locale}/news`} className="mk-back">{t("news.back")}</Link>
        {p.published_on && <time className="mk-date" dateTime={p.published_on}>{fmt.format(new Date(p.published_on))}</time>}
        <h1 className="mk-h1">{pick(locale, p, "title")}</h1>
        {pick(locale, p, "excerpt") && <p className="mk-lead">{pick(locale, p, "excerpt")}</p>}
        {p.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="mk-cover" src={p.cover_url} alt="" />
        )}
        <Markdown>{pick(locale, p, "body")}</Markdown>
      </div>
    </article>
  );
}
