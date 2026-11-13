import Link from "next/link";

import { pick, type Project } from "@/lib/cms";

import { FacadeArt } from "./FacadeArt";

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
    <Link href={`/${locale}/projects/${project.slug}`} className={`mk-project${large ? " mk-project--large" : ""}`}>
      <div className="mk-project__media">
        {project.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.cover_url} alt="" loading="lazy" />
        ) : (
          <FacadeArt variant={project.category} />
        )}
        {project.status !== "completed" && statusLabel && <span className="mk-project__badge">{statusLabel}</span>}
      </div>
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
