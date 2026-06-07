import type { ModuleId, PermissionAction, Role } from "./types";

export type PermissionMap = Role["permissions"];

export function can(
  permissions: PermissionMap | undefined,
  module: ModuleId,
  action: PermissionAction,
  roleCode?: string,
): boolean {
  if (roleCode === "admin") return true;
  return Boolean(permissions?.[module]?.[action]);
}
