import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";

import { AttendanceDashboard, type Live, type Stats } from "./AttendanceDashboard";

export const dynamic = "force-dynamic";

export default async function AttendanceDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const title = locale === "ar" ? "لوحة الحضور" : "Attendance dashboard";
  if (!(await canServer(locale, "hr", "view"))) return <NoAccess locale={locale} title={title} user={me} />;
  const month = new Date().toISOString().slice(0, 7);
  const [live, stats, canSend] = await Promise.all([
    api.get<Live>(`/api/v1/hr/live?locale=${locale}`),
    api.get<Stats>(`/api/v1/hr/stats?month=${month}&locale=${locale}`),
    canServer(locale, "hr", "edit"),
  ]);
  return (
    <>
      <Topbar title={title} user={me} />
      <AttendanceDashboard locale={locale} initialLive={live} initialStats={stats} month={month} canSend={canSend} />
    </>
  );
}
