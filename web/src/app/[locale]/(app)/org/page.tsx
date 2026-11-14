import { OrgChart } from "@/components/hr/OrgChart";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Company, OrgNode } from "@/lib/hr-people";
import { canServer } from "@/lib/perm";

export const dynamic = "force-dynamic";

export default async function OrgPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const [org, companies, canApprove, canView] = await Promise.all([
    api.get<{ nodes: OrgNode[]; can_edit: boolean }>(`/api/v1/hr/org?locale=${locale}`),
    api.get<Company[]>(`/api/v1/hr/companies?locale=${locale}`),
    canServer(locale, "hr", "approve"),
    canServer(locale, "hr", "view"),
  ]);
  return (
    <>
      <Topbar title={locale === "ar" ? "الهيكل التنظيمي" : "Organization chart"} user={me} />
      <OrgChart locale={locale} nodes={org.nodes} companies={companies} canEdit={org.can_edit} canManageCompanies={canApprove} canOpenFiles={canView} />
    </>
  );
}
