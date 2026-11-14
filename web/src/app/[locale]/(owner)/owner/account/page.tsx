import { AccountClient, type AccountTab } from "@/app/[locale]/(app)/account/AccountClient";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { AccountActivity, Profile } from "@/lib/types";

/** Owner portal → My account (same screen as staff, owner-portal links). */
export default async function OwnerAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  const { tab } = await searchParams;
  await requireAuth(locale);
  const [profile, activity] = await Promise.all([
    api.get<Profile>("/api/v1/account/profile"),
    api.get<AccountActivity[]>("/api/v1/account/activity").catch(() => [] as AccountActivity[]),
  ]);
  const initialTab: AccountTab = tab === "security" || tab === "preferences" ? tab : "profile";
  return (
    <div className="ow-embed">
      <AccountClient profile={profile} activity={activity} locale={locale} initialTab={initialTab} base={`/${locale}/owner`} />
    </div>
  );
}
