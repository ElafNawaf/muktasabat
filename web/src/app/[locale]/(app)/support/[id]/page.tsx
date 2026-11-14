import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { TicketDetail, TicketUser } from "@/lib/types";

import { TicketThread } from "./TicketThread";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const t = await getTranslations("support");
  const me = await requireAuth(locale);

  let ticket: TicketDetail;
  try {
    ticket = await api.get<TicketDetail>(`/api/v1/support/tickets/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const { is_staff } = await api.get<{ is_staff: boolean }>("/api/v1/support/me");
  const staff = is_staff || ticket.can_manage ? await api.get<TicketUser[]>("/api/v1/support/staff") : [];

  return (
    <>
      <Topbar title={`${t("title")} · ${ticket.reference}`} user={me} />
      <TicketThread ticket={ticket} isStaff={is_staff} staff={staff} meId={me.id} locale={locale} />
    </>
  );
}
