import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ApplyForm } from "@/components/site/ApplyForm";
import { Markdown } from "@/components/site/Markdown";
import { cms, pick, SITE_URL } from "@/lib/cms";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

type P = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, slug } = await params;
  const j = await cms.job(slug);
  if (!j) return {};
  return pageMeta({ locale, path: `/careers/${slug}`, title: pick(locale, j, "title") });
}

export default async function JobPage({ params }: P) {
  const { locale, slug } = await params;
  const [j, site, t] = await Promise.all([cms.job(slug), cms.site(), getTranslations({ locale, namespace: "site" })]);
  if (!j) notFound();
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "long" });
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: pick(locale, j, "title"),
    description: pick(locale, j, "body") || pick(locale, j, "title"),
    datePosted: j.updated_at.slice(0, 10),
    validThrough: j.closes_on ?? undefined,
    employmentType: j.employment_type.toUpperCase(),
    hiringOrganization: { "@type": "Organization", name: site.brand_name?.en ?? "Muktasabat", sameAs: SITE_URL },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: j.location_en || undefined, addressCountry: "SA" } },
  };
  return (
    <section className="mk-section">
      <div className="mk-wrap mk-article-grid">
        <article>
          <Link href={`/${locale}/careers`} className="mk-back">{t("careers.back")}</Link>
          <h1 className="mk-h1">{pick(locale, j, "title")}</h1>
          <p className="mk-job__meta">
            {pick(locale, j, "department") && <span>{pick(locale, j, "department")}</span>}
            {pick(locale, j, "location") && <span>{pick(locale, j, "location")}</span>}
            <span>{t(`careers.${j.employment_type}`)}</span>
          </p>
          {j.closes_on && <p className="mk-date">{t("careers.closes")}: {fmt.format(new Date(j.closes_on))}</p>}
          <Markdown>{pick(locale, j, "body")}</Markdown>
        </article>
        <aside className="mk-aside" id="apply">
          <h2 className="mk-h3">{t("careers.applyTitle")}</h2>
          <ApplyForm slug={j.slug} />
        </aside>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </section>
  );
}
