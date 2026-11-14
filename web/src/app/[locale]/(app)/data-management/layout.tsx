import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth";

export default async function DataManagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireAuth(locale);
  if (user.role !== "admin") {
    redirect(`/${locale}/dashboard`);
  }
  return <>{children}</>;
}
