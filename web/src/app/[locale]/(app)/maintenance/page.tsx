import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";
import type { Building, Unit } from "@/lib/types";

import { MaintenanceClient, type WorkOrder, type WOStats } from "./MaintenanceClient";

export const dynamic = "force-dynamic";

export default async function MaintenancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const title = locale === "ar" ? "الصيانة وأوامر العمل" : "Maintenance & work orders";
  if (!(await canServer(locale, "maintenance", "view"))) return <NoAccess locale={locale} title={title} user={me} />;
  const [orders, stats, buildings, units, users, perms] = await Promise.all([
    api.get<WorkOrder[]>(`/api/v1/maintenance/work-orders?locale=${locale}`),
    api.get<WOStats>("/api/v1/maintenance/stats"),
    api.get<Building[]>("/api/v1/buildings"),
    api.get<Unit[]>("/api/v1/units"),
    api.get<{ id: number; username: string; full_name?: string | null }[]>("/api/v1/auth/users").catch(() => []),
    Promise.all((["create", "edit", "approve", "delete"] as const).map((a) => canServer(locale, "maintenance", a))),
  ]);
  const [canCreate, canEdit, canApprove, canDelete] = perms;
  return (
    <>
      <Topbar title={title} user={me} />
      <MaintenanceClient
        locale={locale}
        orders={orders}
        stats={stats}
        buildings={buildings.map((b) => ({ id: b.id, name: (locale === "ar" ? b.name_ar : b.name_en) || b.name, assignee_id: (b as { assignee_id?: number | null }).assignee_id ?? null }))}
        units={units.map((u) => ({ id: u.id, building_id: u.building_id, label: u.number || u.name }))}
        users={users.map((u) => ({ id: u.id, name: u.full_name || u.username }))}
        can={{ create: canCreate, edit: canEdit, approve: canApprove, delete: canDelete }}
      />
    </>
  );
}
