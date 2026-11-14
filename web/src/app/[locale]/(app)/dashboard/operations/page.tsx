import { getTranslations } from "next-intl/server";

import { NoAccess } from "@/components/NoAccess";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";

import { DashShell, monthsParam } from "../shell";
import { OperationsDashboard, type Operations } from "./OperationsDashboard";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  const sp = await searchParams;
  const me = await requireAuth(locale);
  const t = await getTranslations("dashboard");
  if (!(await canServer(locale, "dashboard", "view"))) return <NoAccess locale={locale} title={t("title")} user={me} />;
  const ar = locale === "ar";
  const months = monthsParam(sp.months);
  let data: Operations | null = null;
  let error: string | null = null;
  try {
    data = await api.get<Operations>(`/api/v1/dashboards/operations?locale=${locale}&months=${months}`);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  void sp;
  return (
    <DashShell locale={locale} active="operations" title={ar ? "لوحة التشغيل" : "Operations dashboard"} subtitle={ar ? "الصيانة وتجديد العقود والدعم الفني ومتابعة التحصيل في مكان واحد." : "Maintenance, lease renewals, the support desk and collection follow-up in one place."} months={months} error={error}>
      {data && <OperationsDashboard data={data} locale={locale} />}
    </DashShell>
  );
}
