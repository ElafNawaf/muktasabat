import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";

import { InsightsDashboard, type Insights } from "./InsightsDashboard";
import { DashShell } from "./shell";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("dashboard");
  const me = await requireAuth(locale);
  if (!(await canServer(locale, "dashboard", "view"))) {
    // Landing page after sign-in: send roles without dashboard access to their own area.
    // The company dashboard is for administrators only.
    if (await canServer(locale, "properties", "view")) redirect(`/${locale}/properties`);
    if (await canServer(locale, "maintenance", "view")) redirect(`/${locale}/maintenance`);
    if (await canServer(locale, "payments", "view")) redirect(`/${locale}/payments`);
    if (await canServer(locale, "hr", "view")) redirect(`/${locale}/dashboard/people`);
    if (await canServer(locale, "website", "view")) redirect(`/${locale}/website`);
    redirect(`/${locale}/my-hr`);
  }
  const ar = locale === "ar";

  let data: Insights | null = null;
  let error: string | null = null;
  try {
    data = await api.get<Insights>(`/api/v1/analytics/insights?locale=${locale}`);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <DashShell
      locale={locale}
      active="portfolio"
      title={ar ? "لوحة المحفظة" : "Portfolio dashboard"}
      subtitle={ar ? "صورة كاملة عن المحفظة: التحصيل والإشغال والعقود والمخاطر، محدّثة لحظيًا من بياناتك." : "The whole portfolio at a glance — collections, occupancy, leases and risks, live from your data."}
      error={error ? `${t("loadFailed")} — ${error}` : null}
    >
      {data && <InsightsDashboard data={data} locale={locale} />}
    </DashShell>
  );
}
