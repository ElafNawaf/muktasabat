import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { AccountActivity, Profile } from "@/lib/types";

import { AccountClient, type AccountTab } from "./AccountClient";

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  const { tab } = await searchParams;
  const t = await getTranslations("account");
  const me = await requireAuth(locale);

  const [profile, activity] = await Promise.all([
    api.get<Profile>("/api/v1/account/profile"),
    api.get<AccountActivity[]>("/api/v1/account/activity").catch(() => [] as AccountActivity[]),
  ]);

  const initialTab: AccountTab =
    tab === "security" || tab === "preferences" ? tab : "profile";

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <AccountClient profile={profile} activity={activity} locale={locale} initialTab={initialTab} />
    </>
  );
}
