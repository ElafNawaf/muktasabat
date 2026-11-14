import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

import { FormsClient } from "./FormsClient";

export const dynamic = "force-dynamic";

type FormsList = { forms: { entity: string; ar: string; en: string; icon: string; version: number; custom: number; archived: number; system: number; pending: number; updated_at?: string | null; updated_by?: string | null }[]; is_super_admin: boolean };

export default async function FormsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const title = locale === "ar" ? "تصميم النماذج" : "Form designer";
  let data: FormsList;
  try {
    data = await api.get<FormsList>("/api/v1/forms");
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return <NoAccess locale={locale} title={title} user={me} />;
    throw e;
  }
  return (
    <>
      <Topbar title={title} user={me} />
      <FormsClient forms={data.forms} isSuper={data.is_super_admin} locale={locale} />
    </>
  );
}
