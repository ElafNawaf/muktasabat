import { SelfTabs } from "@/components/hr/SelfTabs";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { DayStatus } from "@/lib/hr-labels";

import { MyHrClient, type MyHr } from "./MyHrClient";

export const dynamic = "force-dynamic";

export default async function MyHrPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAuth(locale);
  const month = new Date().toISOString().slice(0, 7);
  const [data, days] = await Promise.all([
    api.get<MyHr>(`/api/v1/hr/me?locale=${locale}`),
    api.get<(DayStatus & { day: string })[]>(`/api/v1/hr/me/attendance?month=${month}`),
  ]);
  return (
    <>
      <Topbar title={locale === "ar" ? "خدماتي الوظيفية" : "My HR"} user={me} />
      <div className="self-wrap"><SelfTabs locale={locale} current="hr" /></div>
      <MyHrClient locale={locale} data={data} days={days} month={month} meId={me.id} />
    </>
  );
}
