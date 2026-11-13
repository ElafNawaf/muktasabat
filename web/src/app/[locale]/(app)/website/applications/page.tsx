import { ApplicationsInbox } from "@/components/cms/Inbox";
import { api } from "@/lib/api";

import { websitePerms } from "../perms";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [perms, rows] = await Promise.all([websitePerms(locale), api.get<Parameters<typeof ApplicationsInbox>[0]["rows"]>("/api/v1/cms/admin/applications")]);
  return <ApplicationsInbox rows={rows} locale={locale} canEdit={perms.edit} canDelete={perms.delete} />;
}
