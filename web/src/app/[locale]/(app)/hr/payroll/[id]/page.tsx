import { notFound } from "next/navigation";

import { PayrollRun } from "@/components/hr/PayrollRun";
import { Topbar } from "@/components/Topbar";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { monthLabel, type PayRunFull } from "@/lib/payroll";

export const dynamic = "force-dynamic";

export default async function PayrollRunPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const me = await requireAuth(locale);
  if (!/^\d+$/.test(id)) notFound();
  let run: PayRunFull;
  try {
    run = await api.get<PayRunFull>(`/api/v1/hr/payroll/runs/${id}?locale=${locale}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const ar = locale === "ar";
  return (
    <>
      <Topbar title={ar ? `مسير رواتب ${monthLabel(ar, run.month)}` : `Payroll · ${monthLabel(ar, run.month)}`} user={me} />
      <PayrollRun locale={locale} run={run} />
    </>
  );
}
