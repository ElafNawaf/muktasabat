import { NoAccess } from "@/components/NoAccess";
import { canServer } from "@/lib/perm";
import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Building, Contract, Tenant, Unit } from "@/lib/types";

import { PaymentsClient, type PaymentRow } from "./PaymentsClient";
import type { TenantReport } from "./TenantReports";

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("paymentsPage");
  const me = await requireAuth(locale);
  if (!(await canServer(locale, "payments", "view"))) return <NoAccess locale={locale} title={t("title")} user={me} />;

  const [payments, contracts, units, tenants, buildings, reports] = await Promise.all([
    api.get<PaymentRow[]>("/api/v1/payments"),
    api.get<Contract[]>("/api/v1/contracts"),
    api.get<Unit[]>("/api/v1/units"),
    api.get<Tenant[]>("/api/v1/tenants"),
    api.get<Building[]>("/api/v1/buildings"),
    api.get<TenantReport[]>(`/api/v1/tenant-portal/admin/reports?locale=${locale}`).catch(() => [] as TenantReport[]),
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
        reports={reports}
      />
    </>
  );
}
