import { AppShell } from "@/components/AppShell";
import { requireAuth } from "@/lib/auth";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireAuth(locale);

  return <AppShell user={{ username: user.username, role: user.role }}>{children}</AppShell>;
}
