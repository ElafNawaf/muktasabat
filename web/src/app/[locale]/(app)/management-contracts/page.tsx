import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type {
  Building,
  ManagementCompany,
  ManagementContract,
  Owner,
  Unit,
} from "@/lib/types";

import { ManagementContractsClient } from "./ManagementContractsClient";

export default async function ManagementContractsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("managementContracts");
  const me = await requireAuth(locale);

  const [contracts, owners, buildings, units, company] = await Promise.all([
    api.get<ManagementContract[]>("/api/v1/management/contracts"),
    api.get<Owner[]>("/api/v1/owners"),
    api.get<Building[]>("/api/v1/buildings"),
    api.get<Unit[]>("/api/v1/units"),
    api.get<ManagementCompany | null>("/api/v1/management/company"),
  ]);

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <ManagementContractsClient
        contracts={contracts}
        owners={owners}
        buildings={buildings}
        units={units}
        company={company}
        locale={locale}
      />
    </>
  );
}
