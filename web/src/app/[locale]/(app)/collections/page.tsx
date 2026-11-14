import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";

import { CollectionsClient, type CRow, type CStats } from "./CollectionsClient";

export const dynamic = "force-dynamic";

export default async function CollectionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const title = locale === "ar" ? "التحصيل" : "Collections";
  if (!(await canServer(locale, "payments", "view"))) return <NoAccess locale={locale} title={title} user={me} />;
  const [rows, stats, canEdit] = await Promise.all([
    api.get<CRow[]>(`/api/v1/collections?locale=${locale}`),
    api.get<CStats>("/api/v1/collections/stats"),
    canServer(locale, "payments", "edit"),
  ]);
  return (
    <>
      <Topbar title={title} user={me} />
      <CollectionsClient locale={locale} rows={rows} stats={stats} canEdit={canEdit} />
    </>
  );
}
