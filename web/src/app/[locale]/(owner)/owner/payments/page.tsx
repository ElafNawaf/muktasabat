import { YearPicker } from "@/components/owner/OwnerShell";
import { L, day, money, num, ownerApi } from "@/lib/owner";

import { load, one, type SP } from "../guard";

export default async function OwnerPayments({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  const sp = await searchParams;
  const as = one(sp.as);
  const thisYear = new Date().getFullYear();
  const year = Number(one(sp.year)) || thisYear;
  const filter = one(sp.status);
  const res = await load(locale, () => ownerApi.payments(locale, year, as));
  if ("error" in res) return res.error;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const all = res.data;
  const rows = filter && ["paid", "overdue", "upcoming"].includes(filter) ? all.filter((p) => p.status === filter) : all;
  const sum = (s: string) => all.filter((p) => p.status === s).reduce((a, p) => a + p.amount, 0);
  const base = `/${locale}/owner/payments?year=${year}${as ? `&as=${as}` : ""}`;
  const label = { paid: t("محصّلة", "Paid"), overdue: t("متأخرة", "Overdue"), upcoming: t("قادمة", "Upcoming") } as const;
  return (
    <>
      <section className="ow-hero">
        <div><h1>{t("التحصيل", "Collections")}</h1><p className="ow-muted">{t("جدول دفعات المستأجرين وحالة كل دفعة", "Every tenant instalment and its status")}</p></div>
        <YearPicker year={year} years={[thisYear + 1, thisYear, thisYear - 1, thisYear - 2]} label={t("السنة", "Year")} />
      </section>
      <section className="ow-kpis ow-kpis--3">
        {(["paid", "overdue", "upcoming"] as const).map((s) => (
          <a key={s} href={`${base}&status=${s}`} className={`ow-kpi ow-kpi--link${filter === s ? " is-on" : ""}${s === "overdue" && sum(s) > 0 ? " ow-kpi--warn" : ""}`}>
            <h2>{label[s]}</h2>
            <p className="ow-kpi__v">{money(locale, sum(s))}</p>
            <p className="ow-kpi__s">{num(locale, all.filter((p) => p.status === s).length)} {t("دفعة", "payments")}</p>
          </a>
        ))}
      </section>
      <section className="ow-card">
        {filter && <p><a className="ow-link" href={base}>{t("عرض الكل", "Show all")}</a></p>}
        {rows.length === 0 ? (
          <p className="ow-muted">{t("لا توجد دفعات في هذه الفترة.", "No payments in this period.")}</p>
        ) : (
          <div className="ow-table-wrap">
            <table className="ow-table">
              <thead><tr><th>{t("الاستحقاق", "Due")}</th><th>{t("العقار / الوحدة", "Property / unit")}</th><th>{t("المستأجر", "Tenant")}</th><th className="num">{t("المبلغ", "Amount")}</th><th className="num">{t("الصافي لك", "Net to you")}</th><th>{t("الحالة", "Status")}</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{day(locale, p.due_date)}{p.paid_date && <small>{t("سُدّدت", "paid")} {day(locale, p.paid_date)}</small>}</td>
                    <td>{p.building}<small>{t("وحدة", "Unit")} {p.unit}</small></td>
                    <td>{p.tenant ?? "—"}</td>
                    <td className="num">{money(locale, p.amount)}</td>
                    <td className="num">{money(locale, p.net)}</td>
                    <td><span className={`ow-chip ${p.status === "paid" ? "is-ok" : p.status === "overdue" ? "is-warn" : ""}`}>{label[p.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
