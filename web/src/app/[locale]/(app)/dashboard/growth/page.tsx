import { getTranslations } from "next-intl/server";

import { NoAccess } from "@/components/NoAccess";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";

import { DashShell, monthsParam } from "../shell";
import { GrowthDashboard, type Growth } from "./GrowthDashboard";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  const sp = await searchParams;
  const me = await requireAuth(locale);
  const t = await getTranslations("dashboard");
  if (!(await canServer(locale, "dashboard", "view"))) return <NoAccess locale={locale} title={t("title")} user={me} />;
  const ar = locale === "ar";
  const months = monthsParam(sp.months);
  let data: Growth | null = null;
  let error: string | null = null;
  try {
    data = await api.get<Growth>(`/api/v1/dashboards/growth?locale=${locale}&months=${months}`);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  void sp;
  return (
    <DashShell locale={locale} active="growth" title={ar ? "لوحة النمو والتسويق" : "Growth dashboard"} subtitle={ar ? "العملاء المحتملون من الموقع والإعلانات المنشورة وطلبات التوظيف." : "Website leads, published listings and job applications."} months={months} error={error}>
      {data && <GrowthDashboard data={data} locale={locale} />}
    </DashShell>
  );
}
