import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { cms } from "@/lib/cms";
import type { TicketStats, TicketSummary } from "@/lib/types";

import { SupportClient } from "./SupportClient";

export default async function SupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { locale } = await params;
  const { new: openNew } = await searchParams;
  const t = await getTranslations("support");
  const me = await requireAuth(locale);

  const [ctx, stats, tickets] = await Promise.all([
    api.get<{ is_staff: boolean; is_technician?: boolean }>("/api/v1/support/me"),
    api.get<TicketStats>("/api/v1/support/stats"),
    api.get<TicketSummary[]>("/api/v1/support/tickets"),
  ]);

  const site = await cms.site().catch(() => null);
  const contact = site ? { phone: site.phone, whatsapp: site.whatsapp, email: site.email } : undefined;
  return (
    <>
      <Topbar title={t("title")} user={me} />
      <SupportClient
        contact={contact}
        tickets={tickets}
        stats={stats}
        isStaff={ctx.is_staff}
        isTechnician={Boolean(ctx.is_technician)}
        meId={me.id}
        locale={locale}
        openNew={openNew === "1"}
      />
    </>
  );
}
