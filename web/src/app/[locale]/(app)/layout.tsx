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

  // Real overdue-payment count for the sidebar accent badge (prototype affordance).
  const today = new Date().toISOString().slice(0, 10);
  let overduePayments = 0;
  try {
    const payments = await api.get<{ status: string; due_date: string }[]>(
      "/api/v1/payments",
    );
    overduePayments = payments.filter(
      (p) => p.status === "overdue" || (p.status !== "paid" && p.due_date < today),
    ).length;
  } catch {
    overduePayments = 0;
  }

  return (
    <PermissionsProvider role={user.role} permissions={myRole?.permissions ?? {}}>
      <AppShell
        user={{ username: user.username, role: user.role }}
        badges={{ payments: overduePayments }}
      >
        {children}
      </AppShell>
    </PermissionsProvider>
  );
}
