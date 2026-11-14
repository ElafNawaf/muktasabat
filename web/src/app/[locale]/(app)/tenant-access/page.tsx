import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";

import { OwnerAccessClient, type AccessRow } from "../owner-access/OwnerAccessClient";

export const dynamic = "force-dynamic";

type TenantRow = Omit<AccessRow, "owner_id"> & { id: number };

export default async function TenantAccessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const title = locale === "ar" ? "وصول المستأجرين إلى البوابة" : "Tenant portal access";
  if (!(await canServer(locale, "tenants", "view"))) return <NoAccess locale={locale} title={title} user={me} />;
  const rows = await api.get<TenantRow[]>(`/api/v1/tenant-portal/admin/access?locale=${locale}`);
  // Tenants with a current lease first — they're the ones to invite.
  const sorted = [...rows].sort((a, b) => Number(b.has_lease) - Number(a.has_lease));
  return (
    <>
      <Topbar title={title} user={me} />
      <OwnerAccessClient kind="tenant" rows={sorted.map(({ id, ...r }) => ({ ...r, owner_id: id }))} locale={locale} />
    </>
  );
}
