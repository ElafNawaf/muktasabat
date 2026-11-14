import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

import { ApprovalsClient, type Inbox, type HistoryItem } from "./ApprovalsClient";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const title = locale === "ar" ? "الموافقات" : "Approvals";
  const [inbox, history] = await Promise.all([
    api.get<Inbox>(`/api/v1/approvals?locale=${locale}`),
    api.get<HistoryItem[]>(`/api/v1/approvals/history?locale=${locale}&days=60`).catch(() => []),
  ]);
  if (!Object.values(inbox.can).some(Boolean)) return <NoAccess locale={locale} title={title} user={me} />;
  return (
    <>
      <Topbar title={title} user={me} />
      <ApprovalsClient locale={locale} inbox={inbox} history={history} />
    </>
  );
}
