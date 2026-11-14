import { NoAccess } from "@/components/NoAccess";
import { canServer } from "@/lib/perm";
import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Building, Owner, Unit } from "@/lib/types";

import { ExpensesClient, type ExpenseRow } from "./ExpensesClient";

export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("expensesPage");
  const me = await requireAuth(locale);
  if (!(await canServer(locale, "expenses", "view"))) return <NoAccess locale={locale} title={t("title")} user={me} />;

  const [expenses, owners, buildings, units, wos] = await Promise.all([
    api.get<ExpenseRow[]>("/api/v1/expenses"),
    api.get<Owner[]>("/api/v1/owners"),
    api.get<Building[]>("/api/v1/buildings"),
    api.get<Unit[]>("/api/v1/units"),
    (await canServer(locale, "maintenance", "view"))
      ? api.get<{ id: number; number: string; expense_id?: number | null }[] | { items: { id: number; number: string; expense_id?: number | null }[] }>(`/api/v1/maintenance/work-orders?locale=${locale}`).catch(() => [])
      : Promise.resolve([]),
  ]);
  const woList = Array.isArray(wos) ? wos : wos.items ?? [];
  const workOrders = Object.fromEntries(woList.filter((w) => w.expense_id).map((w) => [w.expense_id as number, { id: w.id, number: w.number }]));

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <ExpensesClient
        expenses={expenses}
        owners={owners}
        buildings={buildings}
        units={units}
        locale={locale}
        workOrders={workOrders}
      />
    </>
  );
}
