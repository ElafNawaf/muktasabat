import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";

import { RenewalsClient, type Renewal, type RnStats } from "./RenewalsClient";

export const dynamic = "force-dynamic";

export default async function RenewalsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const title = locale === "ar" ? "تجديد العقود" : "Lease renewals";
  if (!(await canServer(locale, "contracts", "view"))) return <NoAccess locale={locale} title={title} user={me} />;
  const [open, closed, stats, users, canEdit, canApprove] = await Promise.all([
    api.get<Renewal[]>(`/api/v1/renewals?locale=${locale}&scope=open`),
    api.get<Renewal[]>(`/api/v1/renewals?locale=${locale}&scope=closed`),
    api.get<RnStats>("/api/v1/renewals/stats"),
    api.get<{ id: number; username: string; full_name?: string | null }[]>("/api/v1/auth/users").catch(() => []),
    canServer(locale, "contracts", "edit"),
    canServer(locale, "contracts", "approve"),
  ]);
  return (
    <>
      <Topbar title={title} user={me} />
      <RenewalsClient
        locale={locale}
        open={open}
        closed={closed}
        stats={stats}
        users={users.map((u) => ({ id: u.id, name: u.full_name || u.username }))}
        can={{ edit: canEdit, approve: canApprove }}
      />
    </>
  );
}
