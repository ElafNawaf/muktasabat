import { notFound } from "next/navigation";

import { WorkOrderPortalView } from "@/components/maintenance/WorkOrderPortalView";
import { ApiError } from "@/lib/api";
import { maintenanceApi } from "@/lib/maintenance-portal";

import { load, one, type SP } from "../../guard";

export const dynamic = "force-dynamic";

export default async function OwnerMaintenanceDetail({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: SP }) {
  const { locale, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const as = one((await searchParams).as);
  let res;
  try {
    res = await load(locale, () => maintenanceApi.ownerGet(locale, Number(id), as));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  if ("error" in res) return res.error;
  return <WorkOrderPortalView wo={res.data} locale={locale} audience="owner" readOnly={!!as} back={`/${locale}/owner/maintenance${as ? `?as=${as}` : ""}`} />;
}
