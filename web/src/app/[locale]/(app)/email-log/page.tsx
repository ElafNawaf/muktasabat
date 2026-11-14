import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

import { EmailLogClient, type EmailLogPage } from "./EmailLogClient";

export default async function EmailLogRoute({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; category?: string; days?: string; page?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const me = await requireAuth(locale);
  if (!me.is_super_admin) redirect(`/${locale}/dashboard`);
  const t = await getTranslations("emailLog");

  const page = Math.max(1, Number(sp.page) || 1);
  const limit = 50;
  const qs = new URLSearchParams();
  if (sp.q) qs.set("q", sp.q);
  if (sp.status) qs.set("status", sp.status);
  if (sp.category) qs.set("category", sp.category);
  qs.set("days", sp.days && /^\d+$/.test(sp.days) ? sp.days : "30");
  qs.set("limit", String(limit));
  qs.set("offset", String((page - 1) * limit));
  const data = await api.get<EmailLogPage>(`/api/v1/admin/email-logs?${qs}`);

  return (
    <>
      <Topbar title={t("title")} user={me} />
      <EmailLogClient
        data={data}
        locale={locale}
        filters={{ q: sp.q ?? "", status: sp.status ?? "", category: sp.category ?? "", days: qs.get("days")! }}
        page={page}
        limit={limit}
      />
    </>
  );
}
