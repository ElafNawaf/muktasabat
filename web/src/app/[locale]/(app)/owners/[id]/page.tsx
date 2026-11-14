import { notFound } from "next/navigation";

import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";
import type { Agent, Owner } from "@/lib/types";

import { OwnerProfile, type OwnerOverview } from "./OwnerProfile";

export const dynamic = "force-dynamic";

export default async function OwnerPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const me = await requireAuth(locale);
  if (!(await canServer(locale, "owners", "view"))) return <NoAccess locale={locale} title={locale === "ar" ? "الملاك" : "Owners"} user={me} />;
  let ov: OwnerOverview;
  let owner: Owner;
  let agents: Agent[];
  try {
    [ov, owner, agents] = await Promise.all([
      api.get<OwnerOverview>(`/api/v1/owners/${id}/overview`),
      api.get<Owner>(`/api/v1/owners/${id}`),
      api.get<Agent[]>("/api/v1/agents").catch(() => [] as Agent[]),
    ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const name = locale === "ar" ? ov.name_ar || ov.name : ov.name_en || ov.name;
  return (
    <>
      <Topbar title={name} user={me} />
      <OwnerProfile ov={ov} owner={owner} agents={agents} locale={locale} />
    </>
  );
}
