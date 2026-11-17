import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth";

import { PendingScreen } from "./PendingScreen";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Self-registered accounts land here until an administrator assigns a role. */
export default async function PendingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  if (me.role !== "pending") redirect(`/${locale}/dashboard`);
  return <PendingScreen locale={locale} username={me.username} email={me.email} />;
}
