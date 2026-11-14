import { SupportClient } from "@/app/[locale]/(app)/support/SupportClient";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { TicketStats, TicketSummary } from "@/lib/types";

/** Owner portal → Help & support (owners only ever see their own tickets). */
export default async function OwnerSupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { locale } = await params;
  const { new: openNew } = await searchParams;
  const me = await requireAuth(locale);
  const [stats, tickets] = await Promise.all([
    api.get<TicketStats>("/api/v1/support/stats"),
    api.get<TicketSummary[]>("/api/v1/support/tickets?scope=mine"),
  ]);
  return (
    <div className="ow-embed">
      <SupportClient
        tickets={tickets}
        stats={stats}
        isStaff={false}
        meId={me.id}
        locale={locale}
        openNew={openNew === "1"}
        base={`/${locale}/owner`}
      />
    </div>
  );
}
