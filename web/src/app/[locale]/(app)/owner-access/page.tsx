import { api } from "@/lib/api";

import { OwnerAccessClient, type AccessRow } from "./OwnerAccessClient";

export const dynamic = "force-dynamic";

export default async function OwnerAccessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const rows = await api.get<AccessRow[]>(`/api/v1/owner-portal/admin/access?locale=${locale}`);
  return <OwnerAccessClient rows={rows} locale={locale} />;
}
