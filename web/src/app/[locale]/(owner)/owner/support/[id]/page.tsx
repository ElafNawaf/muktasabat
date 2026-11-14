import { notFound } from "next/navigation";

import { TicketThread } from "@/app/[locale]/(app)/support/[id]/TicketThread";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { TicketDetail } from "@/lib/types";

export default async function OwnerTicketPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const me = await requireAuth(locale);
  let ticket: TicketDetail;
  try {
    ticket = await api.get<TicketDetail>(`/api/v1/support/tickets/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  return (
    <div className="ow-embed">
      <TicketThread ticket={ticket} isStaff={false} staff={[]} meId={me.id} locale={locale} base={`/${locale}/owner`} />
    </div>
  );
}
