import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Building, Contract, Tenant, Unit } from "@/lib/types";

import { PaymentsClient, type PaymentRow } from "./PaymentsClient";

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("paymentsPage");
  const me = await requireAuth(locale);

  const [payments, contracts, units, tenants, buildings] = await Promise.all([
    api.get<PaymentRow[]>("/api/v1/payments"),
    api.get<Contract[]>("/api/v1/contracts"),
    api.get<Unit[]>("/api/v1/units"),
    api.get<Tenant[]>("/api/v1/tenants"),
    api.get<Building[]>("/api/v1/buildings"),
  ]);

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <PaymentsClient
        payments={payments}
        contracts={contracts}
        units={units}
        tenants={tenants}
        buildings={buildings}
        locale={locale}
      />
    </>
  );
}
