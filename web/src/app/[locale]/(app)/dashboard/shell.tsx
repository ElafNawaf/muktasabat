import { Topbar } from "@/components/Topbar";
import { requireAuth } from "@/lib/auth";
import { canServer } from "@/lib/perm";

import { DashTabs, PeriodPicker, type DashKey } from "./kit";

/** Header + dashboard tab bar shared by every dashboard page. */
export async function DashShell({
  locale, active, title, subtitle, months, error, children,
}: {
  locale: string; active: DashKey; title: string; subtitle: string; months?: number; error?: string | null; children: React.ReactNode;
}) {
  const me = await requireAuth(locale);
  const [dash, hr] = await Promise.all([canServer(locale, "dashboard", "view"), canServer(locale, "hr", "view")]);
  const allowed: DashKey[] = [
    ...(dash ? (["portfolio", "finance", "operations"] as DashKey[]) : []),
    ...(hr ? (["people"] as DashKey[]) : []),
    ...(dash ? (["growth"] as DashKey[]) : []),
  ];
  const ar = locale === "ar";
  return (
    <>
      <Topbar title={ar ? "لوحات المؤشرات" : "Dashboards"} user={me} />
      <div className="page screen-enter dash-page">
        <div className="page-header dash-head">
          <div>
            <h2 className="page-title">{title}</h2>
            <div className="page-subtitle">{subtitle}</div>
          </div>
          {months != null && <PeriodPicker value={months} locale={locale} />}
        </div>
        <DashTabs locale={locale} active={active} allowed={allowed} />
        {error && (
          <div className="badge badge-danger" role="alert" style={{ padding: "10px 14px", margin: "12px 0" }}>
            {ar ? "تعذّر تحميل البيانات" : "Couldn't load the data"} — {error}
          </div>
        )}
        {children}
      </div>
    </>
  );
}

export function monthsParam(v: string | string[] | undefined, fallback = 12): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return [3, 6, 12, 24].includes(n) ? n : fallback;
}
