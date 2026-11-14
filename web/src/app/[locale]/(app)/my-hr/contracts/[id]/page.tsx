import { notFound } from "next/navigation";

import { ContractDocument } from "@/components/hr/ContractDocument";
import { Topbar } from "@/components/Topbar";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { ContractDoc } from "@/lib/hr-people";

export const dynamic = "force-dynamic";

export default async function ContractPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const me = await requireAuth(locale);
  if (!/^\d+$/.test(id)) notFound();
  let doc: ContractDoc;
  try {
    doc = await api.get<ContractDoc>(`/api/v1/hr/contracts/${id}/document?locale=${locale}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  return (
    <>
      <Topbar title={locale === "ar" ? `عقد العمل ${doc.number}` : `Employment contract ${doc.number}`} user={me} />
      <ContractDocument locale={locale} doc={doc} />
    </>
  );
}
