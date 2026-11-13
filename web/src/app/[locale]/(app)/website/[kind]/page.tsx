import { notFound } from "next/navigation";

import { ContentManager } from "@/components/cms/ContentManager";
import { api } from "@/lib/api";
import { isKind } from "@/lib/cms-fields";

import { websitePerms } from "../perms";

export const dynamic = "force-dynamic";

export default async function KindPage({ params }: { params: Promise<{ locale: string; kind: string }> }) {
  const { locale, kind } = await params;
  if (!isKind(kind)) notFound();
  const [perms, rows] = await Promise.all([
    websitePerms(locale),
    api.get<(Record<string, unknown> & { id: number; published: boolean })[]>(`/api/v1/cms/admin/${kind}`),
  ]);
  return <ContentManager key={kind} kind={kind} rows={rows} locale={locale} canEdit={perms.edit || perms.create} canDelete={perms.delete} />;
}
