import { MyPay, type MySlip } from "@/components/hr/MyPay";
import { SelfTabs } from "@/components/hr/SelfTabs";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { Loan } from "@/lib/payroll";

export const dynamic = "force-dynamic";

export default async function MyPayslipsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const [slips, loans] = await Promise.all([
    api.get<MySlip[]>(`/api/v1/hr/me/payslips`).catch(() => [] as MySlip[]),
    api.get<Loan[]>(`/api/v1/hr/me/loans?locale=${locale}`).catch(() => [] as Loan[]),
  ]);
  return (
    <>
      <Topbar title={locale === "ar" ? "رواتبي" : "My pay"} user={me} />
      <div className="self-wrap"><SelfTabs locale={locale} current="pay" /></div>
      <MyPay locale={locale} slips={slips} loans={loans} />
    </>
  );
}
