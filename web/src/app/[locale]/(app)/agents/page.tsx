import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Agent, Owner } from "@/lib/types";

import { type AgentSummary } from "./AgentCards";
import { AgentsClient } from "./AgentsClient";

export default async function AgentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("agents");
  const me = await requireAuth(locale);

  const [agents, owners, summary] = await Promise.all([
    api.get<Agent[]>("/api/v1/agents"),
    api.get<Owner[]>("/api/v1/owners"),
    api.get<AgentSummary[]>("/api/v1/agents/summary").catch(() => [] as AgentSummary[]),
  ]);

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <AgentsClient summary={summary} agents={agents} owners={owners} locale={locale} />
    </>
  );
}
