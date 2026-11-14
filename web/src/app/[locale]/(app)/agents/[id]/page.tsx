import { notFound } from "next/navigation";

import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";
import type { Agent } from "@/lib/types";

import { AgentProfile, type AgentOverview } from "./AgentProfile";

export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const me = await requireAuth(locale);
  if (!(await canServer(locale, "agents", "view"))) return <NoAccess locale={locale} title={locale === "ar" ? "الوسطاء" : "Agents"} user={me} />;
  let ov: AgentOverview;
  let agent: Agent;
  try {
    [ov, agent] = await Promise.all([
      api.get<AgentOverview>(`/api/v1/agents/${id}/overview`),
      api.get<Agent>(`/api/v1/agents/${id}`),
    ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const name = locale === "ar" ? ov.name_ar || ov.name : ov.name_en || ov.name;
  return (
    <>
      <Topbar title={name} user={me} />
      <AgentProfile ov={ov} agent={agent} locale={locale} />
    </>
  );
}
