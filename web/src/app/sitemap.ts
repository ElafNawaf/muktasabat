import type { MetadataRoute } from "next";

import { cms, SITE_URL } from "@/lib/cms";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [services, projects, posts, jobs] = await Promise.all([cms.services(), cms.projects(), cms.posts(), cms.jobs()]);
  const paths: { p: string; lm?: string; pr: number }[] = [
    { p: "", pr: 1 },
    { p: "/about", pr: 0.7 },
    { p: "/for-owners", pr: 0.9 },
    { p: "/services", pr: 0.9 },
    { p: "/projects", pr: 0.9 },
    { p: "/news", pr: 0.6 },
    { p: "/careers", pr: 0.5 },
    { p: "/contact", pr: 0.8 },
    ...services.map((s) => ({ p: `/services/${s.slug}`, lm: s.updated_at, pr: 0.8 })),
    ...projects.map((s) => ({ p: `/projects/${s.slug}`, lm: s.updated_at, pr: 0.7 })),
    ...posts.map((s) => ({ p: `/news/${s.slug}`, lm: s.updated_at, pr: 0.6 })),
    ...jobs.map((s) => ({ p: `/careers/${s.slug}`, lm: s.updated_at, pr: 0.5 })),
  ];
  return paths.flatMap(({ p, lm, pr }) =>
    (["ar", "en"] as const).map((l) => ({
      url: `${SITE_URL}/${l}${p}`,
      lastModified: lm ? new Date(lm) : undefined,
      priority: pr,
      alternates: { languages: { ar: `${SITE_URL}/ar${p}`, en: `${SITE_URL}/en${p}` } },
    })),
  );
}
