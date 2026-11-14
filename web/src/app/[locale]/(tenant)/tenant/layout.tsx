import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { OwnerShell } from "@/components/owner/OwnerShell";
import { requireAuth } from "@/lib/auth";
import { tenantApi } from "@/lib/tenant";

import "../../(owner)/owner/owner.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, title: "بوابة المستأجرين · Tenant portal" };

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireAuth(locale);
  if (user.role === "owner") redirect(`/${locale}/owner`);
  const isTenant = user.role === "tenant";
  const me = isTenant ? await tenantApi.me(locale).catch(() => null) : null;
  return (
    <Suspense>
      <OwnerShell kind="tenant" locale={locale} ownerName={me?.name ?? (locale === "ar" ? "معاينة الموظف" : "Staff preview")} isPreview={!isTenant}>
        {children}
      </OwnerShell>
    </Suspense>
  );
}
