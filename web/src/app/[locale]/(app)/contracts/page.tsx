import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type {
  Agent,
  Building,
  Contract,
  ManagementContract,
  Owner,
  Tenant,
  Unit,
} from "@/lib/types";

import { ContractsClient } from "./ContractsClient";

export default async function ContractsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("contractsPage");
  const me = await requireAuth(locale);

  const [contracts, units, tenants, buildings, owners, agents, managementContracts] =
    await Promise.all([
      api.get<Contract[]>("/api/v1/contracts"),
      api.get<Unit[]>("/api/v1/units"),
      api.get<Tenant[]>("/api/v1/tenants"),
      api.get<Building[]>("/api/v1/buildings"),
      api.get<Owner[]>("/api/v1/owners"),
      api.get<Agent[]>("/api/v1/agents"),
      api.get<ManagementContract[]>("/api/v1/management/contracts"),
    ]);

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <ContractsClient
        contracts={contracts}
        units={units}
        tenants={tenants}
        buildings={buildings}
        owners={owners}
        agents={agents}
        managementContracts={managementContracts}
        locale={locale}
      />
    </>
  );
}
