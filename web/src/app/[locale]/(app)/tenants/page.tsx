import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Building, Contract, Tenant, Unit } from "@/lib/types";

import type { TenantSummary } from "./TenantCards";
import { TenantsClient } from "./TenantsClient";

export default async function TenantsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("tenants");
  const me = await requireAuth(locale);

  const [tenants, contracts, units, buildings, summary] = await Promise.all([
    api.get<Tenant[]>("/api/v1/tenants"),
    api.get<Contract[]>("/api/v1/contracts"),
    api.get<Unit[]>("/api/v1/units"),
    api.get<Building[]>("/api/v1/buildings"),
    api.get<TenantSummary[]>("/api/v1/tenants/summary").catch(() => [] as TenantSummary[]),
  ]);

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <TenantsClient
        summary={summary}
        tenants={tenants}
        contracts={contracts}
        units={units}
        buildings={buildings}
        locale={locale}
      />
    </>
  );
}
