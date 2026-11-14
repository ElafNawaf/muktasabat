import { EmployeeFile } from "@/components/hr/EmployeeFile";
import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Company, EmpFile } from "@/lib/hr-people";
import { canServer } from "@/lib/perm";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const me = await requireAuth(locale);
  const title = locale === "ar" ? "ملف الموظف" : "Employee file";
  if (!(await canServer(locale, "hr", "view"))) return <NoAccess locale={locale} title={title} user={me} />;
  const [data, companies] = await Promise.all([
    api.get<EmpFile>(`/api/v1/hr/people/${Number(id)}?locale=${locale}`),
    api.get<Company[]>(`/api/v1/hr/companies?locale=${locale}`),
  ]);
  return (
    <>
      <Topbar title={title} user={me} />
      <EmployeeFile locale={locale} data={data} mode="hr" companies={companies} />
    </>
  );
}
