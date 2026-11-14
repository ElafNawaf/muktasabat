import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { HrReq } from "@/lib/hr-labels";
import type { Asset, Company, ContractsDesk, ContractTemplate, Placeholder } from "@/lib/hr-people";
import { canServer } from "@/lib/perm";
import type { SitesData } from "@/components/hr/AttendanceZones";
import type { Loan, PayRun, PaySettings } from "@/lib/payroll";

import { HrClient, type Dash, type Emp, type Expiring, type Report, type HrSettings } from "./HrClient";

export const dynamic = "force-dynamic";

export default async function HrPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const title = locale === "ar" ? "الموارد البشرية" : "Human resources";
  if (!(await canServer(locale, "hr", "view"))) return <NoAccess locale={locale} title={title} user={me} />;
  const month = new Date().toISOString().slice(0, 7);
  const [dash, requests, employees, settings, report, canCreate, assets, companies, expiring, desk, tpls, sites] = await Promise.all([
    api.get<Dash>(`/api/v1/hr/dashboard?locale=${locale}`),
    api.get<HrReq[]>(`/api/v1/hr/requests?locale=${locale}`),
    api.get<Emp[]>(`/api/v1/hr/employees?locale=${locale}`),
    api.get<HrSettings>(`/api/v1/hr/settings?locale=${locale}`),
    api.get<Report>(`/api/v1/hr/attendance/report?month=${month}&locale=${locale}`),
    canServer(locale, "hr", "create"),
    api.get<Asset[]>(`/api/v1/hr/assets?locale=${locale}`),
    api.get<Company[]>(`/api/v1/hr/companies?locale=${locale}`),
    api.get<Expiring[]>(`/api/v1/hr/expiring?locale=${locale}`),
    api.get<ContractsDesk>(`/api/v1/hr/contracts-desk?locale=${locale}`),
    api.get<{ templates: ContractTemplate[]; placeholders: Placeholder[] }>(`/api/v1/hr/contract-templates?locale=${locale}`),
    api.get<SitesData>(`/api/v1/hr/sites?locale=${locale}`),
  ]);
  // Salaries are only for HR approvers (HR manager, CEO, admins).
  const canPay = await canServer(locale, "hr", "approve");
  const payroll = canPay
    ? await Promise.all([
        api.get<PayRun[]>(`/api/v1/hr/payroll/runs?locale=${locale}`),
        api.get<Loan[]>(`/api/v1/hr/payroll/loans?locale=${locale}`),
        api.get<PaySettings>(`/api/v1/hr/payroll/settings`),
      ]).then(([runs, loans, settings]) => ({ runs, loans, settings })).catch(() => null)
    : null;
  return (
    <>
      <Topbar title={title} user={me} />
      <HrClient locale={locale} dash={dash} requests={requests} employees={employees} settings={settings} report={report} month={month} canCreate={canCreate} assets={assets} companies={companies} expiring={expiring} desk={desk} templates={tpls.templates} placeholders={tpls.placeholders} sites={sites} payroll={payroll} />
    </>
  );
}
