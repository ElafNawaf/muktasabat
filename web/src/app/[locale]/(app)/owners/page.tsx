import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Agent, Building, Contract, Owner, Unit } from "@/lib/types";

import { OwnersClient } from "./OwnersClient";

export default async function OwnersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("owners");
  const me = await requireAuth(locale);

  const [owners, agents, buildings, units, contracts] = await Promise.all([
    api.get<Owner[]>("/api/v1/owners"),
    api.get<Agent[]>("/api/v1/agents"),
    api.get<Building[]>("/api/v1/buildings"),
    api.get<Unit[]>("/api/v1/units"),
    api.get<Contract[]>("/api/v1/contracts"),
  ]);

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <OwnersClient
        owners={owners}
        agents={agents}
        buildings={buildings}
        units={units}
        contracts={contracts}
        locale={locale}
      />
    </>
  );
}
