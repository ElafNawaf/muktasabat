import { cache } from "react";

import { api } from "./api";
import { requireAuth } from "./auth";
import type { ModuleId, PermissionAction, Role } from "./types";

const roles = cache(() => api.get<Role[]>("/api/v1/roles"));

/** Server-side UI check (FastAPI enforces the same rule on every call). */
export async function canServer(locale: string, module: ModuleId, action: PermissionAction = "view"): Promise<boolean> {
  const me = await requireAuth(locale);
  if (me.role === "admin") return true;
  const role = (await roles()).find((r) => r.code === me.role);
  return !!role?.permissions?.[module]?.[action];
}
