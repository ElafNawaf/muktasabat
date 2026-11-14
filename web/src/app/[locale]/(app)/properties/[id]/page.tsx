import { notFound } from "next/navigation";

import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";
import type { Building, Owner, Unit } from "@/lib/types";

import type { UserPick } from "../page";
import { BuildingDetail, type BuildingOverview } from "./BuildingDetail";

export const dynamic = "force-dynamic";

export default async function BuildingPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const me = await requireAuth(locale);
  if (!(await canServer(locale, "properties", "view"))) return <NoAccess locale={locale} title={locale === "ar" ? "العقارات" : "Properties"} user={me} />;
  let ov: BuildingOverview;
  let building: Building;
  try {
    [ov, building] = await Promise.all([
      api.get<BuildingOverview>(`/api/v1/buildings/${id}/overview`),
      api.get<Building>(`/api/v1/buildings/${id}`),
    ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [owners, users, units] = await Promise.all([
    api.get<Owner[]>("/api/v1/owners").catch(() => [] as Owner[]),
    api.get<UserPick[]>("/api/v1/auth/users").catch(() => [] as UserPick[]),
    api.get<Unit[]>("/api/v1/units").catch(() => [] as Unit[]),
  ]);
  const name = locale === "ar" ? building.name_ar || building.name : building.name_en || building.name;
  return (
    <>
      <Topbar title={name} user={me} />
      <BuildingDetail ov={ov} building={building} owners={owners} users={users} units={units.filter((u) => u.building_id === building.id)} locale={locale} />
    </>
  );
}
