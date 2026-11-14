import Link from "next/link";

import { pick, type Project } from "@/lib/cms";

const CATEGORY_ICON: Record<string, string> = {
  residential: "home",
  commercial: "storefront",
  development: "construction",
  mixed: "location_city",
  hospitality: "hotel",
};

export function ProjectCard({
  project,
  locale,
  categoryLabel,
  statusLabel,
  large = false,
}: {
  project: Project;
  locale: string;
  categoryLabel: string;
  statusLabel?: string;
  large?: boolean;
}) {
  const title = pick(locale, project, "title");
  const city = pick(locale, project, "city");
  return (
    <Link href={`/${locale}/projects/${project.slug}`} className={`mk-project${large && project.cover_url ? " mk-project--large" : ""}${project.cover_url ? "" : " mk-project--nophoto"}`}>
      {project.cover_url ? (
        <div className="mk-project__media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={project.cover_url} alt="" loading="lazy" />
          {project.status !== "completed" && statusLabel && <span className="mk-project__badge">{statusLabel}</span>}
        </div>
      ) : (
        // No cover photo: a compact, info-first header.
        <div className="mk-project__head">
          <span className="mk-typeicon" aria-hidden="true"><span className="ms">{CATEGORY_ICON[project.category] ?? "domain"}</span></span>
          {project.status !== "completed" && statusLabel && <span className="mk-project__badge">{statusLabel}</span>}
        </div>
      )}
      <div className="mk-project__body">
        <p className="mk-project__meta">
          <span>{categoryLabel}</span>
          {city && <span>{city}</span>}
        </p>
        <h3 className="mk-project__title">{title}</h3>
      </div>
    </Link>
  );
}
