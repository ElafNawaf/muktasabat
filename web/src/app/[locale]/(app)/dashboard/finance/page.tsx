import { getTranslations } from "next-intl/server";

import { NoAccess } from "@/components/NoAccess";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";

import { DashShell, monthsParam } from "../shell";
import { FinanceDashboard, type Finance } from "./FinanceDashboard";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  const sp = await searchParams;
  const me = await requireAuth(locale);
  const t = await getTranslations("dashboard");
  if (!(await canServer(locale, "dashboard", "view"))) return <NoAccess locale={locale} title={t("title")} user={me} />;
  const ar = locale === "ar";
  const months = monthsParam(sp.months);
  let data: Finance | null = null;
  let error: string | null = null;
  try {
    data = await api.get<Finance>(`/api/v1/dashboards/finance?locale=${locale}&months=${months}`);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  void sp;
  return (
    <DashShell locale={locale} active="finance" title={ar ? "اللوحة المالية" : "Finance dashboard"} subtitle={ar ? "إيراد الشركة الحقيقي مقابل أموال الملاك، والهامش وصافي الربح ومستحقات الملاك." : "The company's real revenue vs owners' money, margin, net profit and what you owe owners."} months={months} error={error}>
      {data && <FinanceDashboard data={data} locale={locale} />}
    </DashShell>
  );
}
