/** Maintenance requests as tenants and owners see them (server-side fetchers + shared labels). */
import { api } from "./api";

import type { PortalWorkOrder, TenantUnit } from "./maintenance-labels";

export * from "./maintenance-labels";

function q(locale: string, key: "as_tenant" | "as_owner", as?: string | null) {
  const p = new URLSearchParams({ locale });
  if (as) p.set(key, as);
  return p.toString();
}

export const maintenanceApi = {
  tenantList: (locale: string, as?: string | null) =>
    api.get<{ units: TenantUnit[]; requests: PortalWorkOrder[] }>(`/api/v1/tenant-portal/maintenance?${q(locale, "as_tenant", as)}`),
  tenantGet: (locale: string, id: number, as?: string | null) => api.get<PortalWorkOrder>(`/api/v1/tenant-portal/maintenance/${id}?${q(locale, "as_tenant", as)}`),
  ownerGet: (locale: string, id: number, as?: string | null) => api.get<PortalWorkOrder>(`/api/v1/owner-portal/work-orders/${id}?${q(locale, "as_owner", as)}`),
};

