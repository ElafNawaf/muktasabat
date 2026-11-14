import { getTranslations } from "next-intl/server";

import { NoAccess } from "@/components/NoAccess";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";

import { DashShell } from "../shell";
import { PeopleDashboard, type People } from "./PeopleDashboard";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  const sp = await searchParams;
  const me = await requireAuth(locale);
  const t = await getTranslations("dashboard");
  if (!(await canServer(locale, "hr", "view"))) return <NoAccess locale={locale} title={t("title")} user={me} />;
  const ar = locale === "ar";
  
  let data: People | null = null;
  let error: string | null = null;
  try {
    data = await api.get<People>(`/api/v1/dashboards/people?locale=${locale}`);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  void sp;
  return (
    <DashShell locale={locale} active="people" title={ar ? "لوحة الموارد البشرية" : "People dashboard"} subtitle={ar ? "القوى العاملة في المجموعة: الحضور والإجازات والعقود والعُهد والتنبيهات." : "The group's workforce: attendance, leave, contracts, assets and what needs attention."} error={error}>
      {data && <PeopleDashboard data={data} locale={locale} />}
    </DashShell>
  );
}
