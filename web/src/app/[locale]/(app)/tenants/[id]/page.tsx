import { notFound } from "next/navigation";

import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";
import type { Tenant } from "@/lib/types";

import { TenantProfile, type TenantOverview } from "./TenantProfile";

export const dynamic = "force-dynamic";

export default async function TenantPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const me = await requireAuth(locale);
  if (!(await canServer(locale, "tenants", "view"))) return <NoAccess locale={locale} title={locale === "ar" ? "المستأجرون" : "Tenants"} user={me} />;
  let ov: TenantOverview;
  let tenant: Tenant;
  try {
    [ov, tenant] = await Promise.all([api.get<TenantOverview>(`/api/v1/tenants/${id}/overview`), api.get<Tenant>(`/api/v1/tenants/${id}`)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const name = locale === "ar" ? ov.name : ov.name_en || ov.name;
  return (
    <>
      <Topbar title={name} user={me} />
      <TenantProfile ov={ov} tenant={tenant} locale={locale} />
    </>
  );
}
