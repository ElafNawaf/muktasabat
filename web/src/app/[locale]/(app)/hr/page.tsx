import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { HrReq } from "@/lib/hr-labels";
import { canServer } from "@/lib/perm";

import { HrClient, type Dash, type Emp, type Report, type HrSettings } from "./HrClient";

export const dynamic = "force-dynamic";

export default async function HrPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const title = locale === "ar" ? "الموارد البشرية" : "Human resources";
  if (!(await canServer(locale, "hr", "view"))) return <NoAccess locale={locale} title={title} user={me} />;
  const month = new Date().toISOString().slice(0, 7);
  const [dash, requests, employees, settings, report, canCreate] = await Promise.all([
    api.get<Dash>(`/api/v1/hr/dashboard?locale=${locale}`),
    api.get<HrReq[]>(`/api/v1/hr/requests?locale=${locale}`),
    api.get<Emp[]>(`/api/v1/hr/employees?locale=${locale}`),
    api.get<HrSettings>(`/api/v1/hr/settings?locale=${locale}`),
    api.get<Report>(`/api/v1/hr/attendance/report?month=${month}&locale=${locale}`),
    canServer(locale, "hr", "create"),
  ]);
  return (
    <>
      <Topbar title={title} user={me} />
      <HrClient locale={locale} dash={dash} requests={requests} employees={employees} settings={settings} report={report} month={month} canCreate={canCreate} />
    </>
  );
}
