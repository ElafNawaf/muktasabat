import { redirect } from "next/navigation";

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
  // Property owners have their own scoped portal; staff screens are not for them.
  if (user.role === "owner") redirect(`/${locale}/owner`);
  const roles = await api.get<Role[]>("/api/v1/roles");
  const myRole = roles.find((r) => r.code === user.role);

  return (
    <PermissionsProvider role={user.role} permissions={myRole?.permissions ?? {}}>
      <AppShell
        user={{
          username: user.username,
          role: user.role,
          full_name: locale === "ar" ? user.full_name_ar || user.full_name : user.full_name || user.full_name_ar,
          avatar_url: user.avatar_url,
        }}
      >{children}</AppShell>
    </PermissionsProvider>
  );
}
