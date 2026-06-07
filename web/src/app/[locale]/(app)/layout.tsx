import { AppShell } from "@/components/AppShell";
import { PermissionsProvider } from "@/components/PermissionsProvider";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireAuth(locale);
  const roles = await api.get<Role[]>("/api/v1/roles");
  const myRole = roles.find((r) => r.code === user.role);

  return (
    <PermissionsProvider role={user.role} permissions={myRole?.permissions ?? {}}>
      <AppShell user={{ username: user.username, role: user.role }}>{children}</AppShell>
    </PermissionsProvider>
  );
}
