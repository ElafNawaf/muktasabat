import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

import { UsersClient, type AdminUserRow } from "./UsersClient";

export default async function UsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("usersPage");
  const me = await requireAuth(locale);

  const users = await api.get<AdminUserRow[]>("/api/v1/auth/admin/users");

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <UsersClient users={users} meId={me.id} locale={locale} />
    </>
  );
}
