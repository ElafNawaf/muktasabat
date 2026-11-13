import type { Metadata } from "next";
import { Suspense } from "react";

import { OwnerShell } from "@/components/owner/OwnerShell";
import { requireAuth } from "@/lib/auth";
import { ownerApi } from "@/lib/owner";

import "./owner.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, title: "بوابة الملاك · Owner portal" };

export default async function OwnerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireAuth(locale);
  const isOwner = user.role === "owner";
  const me = isOwner ? await ownerApi.me(locale).catch(() => null) : null;
  return (
    <Suspense>
      <OwnerShell locale={locale} ownerName={me?.name ?? (locale === "ar" ? "معاينة الموظف" : "Staff preview")} isPreview={!isOwner}>
        {children}
      </OwnerShell>
    </Suspense>
  );
}
