import { EmployeeFile } from "@/components/hr/EmployeeFile";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { EmpFile } from "@/lib/hr-people";

export const dynamic = "force-dynamic";

export default async function MyFilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const data = await api.get<EmpFile>(`/api/v1/hr/me/file?locale=${locale}`);
  return (
    <>
      <Topbar title={locale === "ar" ? "ملفي الوظيفي" : "My employee file"} user={me} />
      <EmployeeFile locale={locale} data={data} mode="self" />
    </>
  );
}
