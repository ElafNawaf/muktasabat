import { notFound } from "next/navigation";

import { PayslipDoc } from "@/components/hr/PayslipDoc";
import { Topbar } from "@/components/Topbar";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { monthLabel, type Payslip } from "@/lib/payroll";

export const dynamic = "force-dynamic";

export default async function PayslipPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const me = await requireAuth(locale);
  if (!/^\d+$/.test(id)) notFound();
  let p: Payslip;
  try {
    p = await api.get<Payslip>(`/api/v1/hr/payroll/payslips/${id}?locale=${locale}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const ar = locale === "ar";
  const back = p.is_self ? `/${locale}/my-hr/payslips` : `/${locale}/hr/payroll/${p.run_id}`;
  return (
    <>
      <Topbar title={ar ? `قسيمة راتب ${monthLabel(ar, p.month)}` : `Payslip · ${monthLabel(ar, p.month)}`} user={me} />
      <PayslipDoc locale={locale} p={p} back={back} />
    </>
  );
}
