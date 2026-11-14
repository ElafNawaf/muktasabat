"use client";

import { useMemo, useState } from "react";

import type { Project, ProjectCategory } from "@/lib/cms";

import { ProjectCard } from "./ProjectCard";

export function ProjectsBrowser({
  projects,
  locale,
  labels,
}: {
  projects: Project[];
  locale: string;
  labels: Record<string, string>;
}) {
  const cats = useMemo(
    () => Array.from(new Set(projects.map((p) => p.category))) as ProjectCategory[],
    [projects],
  );
  const [cat, setCat] = useState<ProjectCategory | "all">("all");
  const shown = cat === "all" ? projects : projects.filter((p) => p.category === cat);

  return (
    <>
      {cats.length > 1 && (
        <div className="mk-filter" role="group" aria-label={labels.category}>
          {(["all", ...cats] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cat === c}
              className={cat === c ? "is-on" : undefined}
              onClick={() => setCat(c)}
            >
              {c === "all" ? labels.filterAll : labels[c]}
            </button>
          ))}
        </div>
      )}
      <div className="mk-projects">
        {shown.map((p, i) => (
          <ProjectCard
            key={p.id}
            project={p}
            locale={locale}
            categoryLabel={labels[p.category]}
            statusLabel={labels[p.status]}
            large={i === 0 && shown.length > 2}
          />
        ))}
      </div>
    </>
  );
}
