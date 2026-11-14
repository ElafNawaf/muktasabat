import { NoAccess } from "@/components/NoAccess";
import { canServer } from "@/lib/perm";
import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

import { DataManagementClient, type DataSummary } from "./DataManagementClient";

export default async function DataManagementPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("dataManagement");
  const me = await requireAuth(locale);
  if (!(await canServer(locale, "data", "view"))) return <NoAccess locale={locale} title={t("title")} user={me} />;
  const summary = await api.get<DataSummary>("/api/v1/data-io/summary");

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <DataManagementClient summary={summary} locale={locale} />
    </>
  );
}
