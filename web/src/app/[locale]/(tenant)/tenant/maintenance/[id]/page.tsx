import { notFound } from "next/navigation";

import { WorkOrderPortalView } from "@/components/maintenance/WorkOrderPortalView";
import { ApiError } from "@/lib/api";
import { maintenanceApi } from "@/lib/maintenance-portal";

import { one, type SP } from "../../../../(owner)/owner/guard";
import { load } from "../../guard";

export const dynamic = "force-dynamic";

export default async function TenantMaintenanceDetail({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: SP }) {
  const { locale, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const as = one((await searchParams).as);
  let res;
  try {
    res = await load(locale, () => maintenanceApi.tenantGet(locale, Number(id), as));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  if ("error" in res) return res.error;
  return <WorkOrderPortalView wo={res.data} locale={locale} audience="tenant" readOnly={!!as} back={`/${locale}/tenant/maintenance${as ? `?as=${as}` : ""}`} />;
}
