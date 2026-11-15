import { notFound } from "next/navigation";

import { NoAccess } from "@/components/NoAccess";
import { Topbar } from "@/components/Topbar";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";

import { ContractDetail, type ContractOverview } from "./ContractDetail";

export const dynamic = "force-dynamic";

export default async function ContractPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const me = await requireAuth(locale);
  if (!(await canServer(locale, "contracts", "view"))) return <NoAccess locale={locale} title={locale === "ar" ? "عقود الإيجار" : "Leases"} user={me} />;
  let ov: ContractOverview;
  try {
    ov = await api.get<ContractOverview>(`/api/v1/contracts/${id}/overview?locale=${locale}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  return (
    <>
      <Topbar title={ov.contract.contract_number} user={me} />
      <ContractDetail ov={ov} locale={locale} />
    </>
  );
}
