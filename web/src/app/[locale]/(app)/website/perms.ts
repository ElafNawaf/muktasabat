import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

export type WebsitePerms = { view: boolean; create: boolean; edit: boolean; delete: boolean };

/** UI hint only — FastAPI enforces the same `website.*` permissions on every call. */
export async function websitePerms(locale: string): Promise<WebsitePerms> {
  const user = await requireAuth(locale);
  if (user.role === "admin") return { view: true, create: true, edit: true, delete: true };
  const roles = await api.get<Role[]>("/api/v1/roles");
  const mod = (roles.find((r) => r.code === user.role)?.permissions as Record<string, Record<string, number>> | undefined)?.website ?? {};
  return { view: !!mod.view, create: !!mod.create, edit: !!mod.edit, delete: !!mod.delete };
}
