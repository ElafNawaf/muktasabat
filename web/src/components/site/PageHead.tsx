import Link from "next/link";

import { breadcrumbLd } from "@/lib/seo";

import { JsonLd } from "./JsonLd";

/** Inner-page header band, with optional breadcrumbs (visible + BreadcrumbList JSON-LD). */
export function PageHead({
  title,
  lead,
  children,
  locale,
  crumbs,
}: {
  title: string;
  lead?: string | null;
  children?: React.ReactNode;
  locale?: string;
  /** Trail after "Home"; the last item is the current page. */
  crumbs?: { name: string; path: string }[];
}) {
  const home = locale === "ar" ? "الرئيسية" : "Home";
  return (
    <section className="mk-pagehead">
      <div className="mk-wrap">
        {locale && crumbs && crumbs.length > 0 && (
          <>
            <nav aria-label={locale === "ar" ? "مسار التنقل" : "Breadcrumb"}>
              <ol className="mk-crumbs">
                <li><Link href={`/${locale}`}>{home}</Link></li>
                {crumbs.map((c, i) => (
                  <li key={c.path}>
                    {i === crumbs.length - 1 ? <span aria-current="page">{c.name}</span> : <Link href={`/${locale}${c.path}`}>{c.name}</Link>}
                  </li>
                ))}
              </ol>
            </nav>
            <JsonLd data={breadcrumbLd(locale, crumbs)} />
          </>
        )}
        <h1>{title}</h1>
        {lead && <p className="mk-lead">{lead}</p>}
        {children}
      </div>
    </section>
  );
}
