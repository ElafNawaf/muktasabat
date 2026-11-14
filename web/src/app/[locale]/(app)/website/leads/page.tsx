import { LeadsInbox } from "@/components/cms/Inbox";
import { api } from "@/lib/api";

import { websitePerms } from "../perms";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [perms, rows] = await Promise.all([websitePerms(locale), api.get<Parameters<typeof LeadsInbox>[0]["rows"]>("/api/v1/cms/admin/leads")]);
  return <LeadsInbox rows={rows} locale={locale} canEdit={perms.edit} canDelete={perms.delete} />;
}
