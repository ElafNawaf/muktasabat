import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

import { UsersClient, type AdminUserRow } from "./UsersClient";

export default async function UsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("usersPage");
  const me = await requireAuth(locale);

  const [users, roles] = await Promise.all([
    api.get<AdminUserRow[]>("/api/v1/auth/admin/users"),
    api.get<Role[]>("/api/v1/roles"),
  ]);

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <UsersClient users={users} roles={roles} meId={me.id} locale={locale} />
    </>
  );
}
