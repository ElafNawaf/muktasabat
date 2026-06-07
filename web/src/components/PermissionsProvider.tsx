"use client";

import { createContext, useContext, useMemo } from "react";

import { can, type PermissionMap } from "@/lib/permissions";
import type { ModuleId, PermissionAction } from "@/lib/types";

type PermissionsContextValue = {
  role: string;
  permissions: PermissionMap;
  can: (module: ModuleId, action: PermissionAction) => boolean;
};

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({
  role,
  permissions,
  children,
}: {
  role: string;
  permissions: PermissionMap;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      role,
      permissions,
      can: (module: ModuleId, action: PermissionAction) =>
        can(permissions, module, action, role),
    }),
    [role, permissions],
  );

  return (
    <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    return {
      role: "viewer",
      permissions: {} as PermissionMap,
      can: () => false,
    };
  }
  return ctx;
}
