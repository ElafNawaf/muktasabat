import { TextsEditor } from "@/components/cms/TextsEditor";
import { api } from "@/lib/api";
import type { SiteData } from "@/lib/cms";

import { websitePerms } from "../perms";

export const dynamic = "force-dynamic";

export default async function TextsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [perms, settings] = await Promise.all([
    websitePerms(locale),
    api.get<{ data: SiteData }>("/api/v1/cms/admin/settings"),
  ]);
  return <TextsEditor initial={settings.data.texts ?? {}} locale={locale} canEdit={perms.edit} />;
}
