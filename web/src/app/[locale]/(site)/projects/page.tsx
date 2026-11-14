import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHead } from "@/components/site/PageHead";
import { ProjectsBrowser } from "@/components/site/ProjectsBrowser";
import { cms } from "@/lib/cms";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return pageMeta({ locale, path: "/projects", title: t("nav.projects"), description: t("sections.projectsTitle") });
}

export default async function ProjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [projects, t] = await Promise.all([cms.projects(), getTranslations({ locale, namespace: "site" })]);
  const keys = ["filterAll", "category", "residential", "commercial", "development", "mixed", "hospitality", "completed", "ongoing", "upcoming"];
  const labels = Object.fromEntries(keys.map((k) => [k, t(`projects.${k}`)]));
  return (
    <>
      <PageHead locale={locale} crumbs={[{ name: t("nav.projects"), path: "/projects" }]} title={t("sections.projectsTitle")} />
      <section className="mk-section">
        <div className="mk-wrap">
          {projects.length === 0 ? <p className="mk-empty">{t("projects.empty")}</p> : <ProjectsBrowser projects={projects} locale={locale} labels={labels} />}
        </div>
      </section>
    </>
  );
}
