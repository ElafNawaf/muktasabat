import { Sidebar } from "@/components/Sidebar";
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

  return (
    <div className="app">
      <Sidebar user={{ username: user.username, role: user.role }} />
      <div className="main">{children}</div>
    </div>
  );
}
