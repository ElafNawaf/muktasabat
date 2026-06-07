import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Agent, Owner } from "@/lib/types";

import { AgentsClient } from "./AgentsClient";

export default async function AgentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("agents");
  const me = await requireAuth(locale);

  const [agents, owners] = await Promise.all([
    api.get<Agent[]>("/api/v1/agents"),
    api.get<Owner[]>("/api/v1/owners"),
  ]);

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <AgentsClient agents={agents} owners={owners} locale={locale} />
    </>
  );
}
