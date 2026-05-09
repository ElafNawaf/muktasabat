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

  const [expenses, owners, buildings, units] = await Promise.all([
    api.get<ExpenseRow[]>("/api/v1/expenses"),
    api.get<Owner[]>("/api/v1/owners"),
    api.get<Building[]>("/api/v1/buildings"),
    api.get<Unit[]>("/api/v1/units"),
  ]);

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <ExpensesClient
        expenses={expenses}
        owners={owners}
        buildings={buildings}
        units={units}
        locale={locale}
      />
    </>
  );
}
