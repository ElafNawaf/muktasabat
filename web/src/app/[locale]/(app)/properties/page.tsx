import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Building, Contract, Owner, Tenant, Unit } from "@/lib/types";

import { PropertiesClient } from "./PropertiesClient";

export default async function PropertiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("properties");
  const me = await requireAuth(locale);

  const [owners, buildings, units, contracts, tenants, users] = await Promise.all([
    api.get<Owner[]>("/api/v1/owners"),
    api.get<Building[]>("/api/v1/buildings"),
    api.get<Unit[]>("/api/v1/units"),
    api.get<Contract[]>("/api/v1/contracts"),
    api.get<Tenant[]>("/api/v1/tenants"),
    api.get<UserPick[]>("/api/v1/auth/users"),
  ]);

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <PropertiesClient
        owners={owners}
        buildings={buildings}
        units={units}
        contracts={contracts}
        tenants={tenants}
        users={users}
        locale={locale}
      />
    </>
  );
}

export type UserPick = {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active_user: boolean;
};
