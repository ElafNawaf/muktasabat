import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

import { OwnerAccessClient, type AccessRow } from "./OwnerAccessClient";

export const dynamic = "force-dynamic";

export default async function OwnerAccessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const rows = await api.get<AccessRow[]>(`/api/v1/owner-portal/admin/access?locale=${locale}`);
  return (
    <>
      <Topbar title={locale === "ar" ? "وصول الملاك إلى البوابة" : "Owner portal access"} user={me} />
      <OwnerAccessClient rows={rows} locale={locale} />
    </>
  );
}
