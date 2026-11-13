import { DeliveryHealth } from "@/components/cms/DeliveryHealth";
import { SettingsForm } from "@/components/cms/SettingsForm";
import { api } from "@/lib/api";
import type { SiteData } from "@/lib/cms";

import { websitePerms } from "../perms";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [perms, settings] = await Promise.all([
    websitePerms(locale),
    api.get<{ data: SiteData; private: { lead_notify_emails: string[]; careers_notify_emails: string[] } }>("/api/v1/cms/admin/settings"),
  ]);
  return (
    <>
      {perms.edit && <DeliveryHealth locale={locale} />}
      <SettingsForm initial={settings} locale={locale} canEdit={perms.edit} />
    </>
  );
}
