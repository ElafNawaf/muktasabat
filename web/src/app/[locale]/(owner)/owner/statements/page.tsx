import { BrandLogo } from "@/components/BrandLogo";
import { PrintButton } from "@/components/owner/PrintButton";
import { L, MONTHS, day, money, ownerApi } from "@/lib/owner";

import { load, one, type SP } from "../guard";

export default async function OwnerStatements({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  const sp = await searchParams;
  const as = one(sp.as);
  const now = new Date();
  const year = Number(one(sp.year)) || now.getFullYear();
  const mRaw = one(sp.month);
  const month = mRaw === "all" ? null : Number(mRaw) || now.getMonth() + 1;
  const res = await load(locale, () => ownerApi.statement(locale, year, month, as));
  if ("error" in res) return res.error;
  const s = res.data;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const months = MONTHS(locale);
  const csvQ = new URLSearchParams({ year: String(year), locale, ...(month ? { month: String(month) } : {}), ...(as ? { as_owner: as } : {}) });
  return (
    <>
      <section className="ow-hero ow-noprint">
        <div><h1>{t("كشوف الحساب", "Statements")}</h1><p className="ow-muted">{t("كشف مفصّل بالإيرادات والأتعاب والمصروفات وصافي المستحق لك", "Detailed income, fees, expenses and net amount payable to you")}</p></div>
        <form className="ow-filters" method="get">
          {as && <input type="hidden" name="as" value={as} />}
          <label className="ow-select"><span>{t("الشهر", "Month")}</span>
            <select name="month" defaultValue={month ?? "all"}>
              <option value="all">{t("السنة كاملة", "Full year")}</option>
              {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="ow-select"><span>{t("السنة", "Year")}</span>
            <select name="year" defaultValue={year}>
              {[0, 1, 2].map((d) => <option key={d} value={now.getFullYear() - d}>{now.getFullYear() - d}</option>)}
            </select>
          </label>
          <button className="ow-btn">{t("عرض", "Show")}</button>
        </form>
      </section>

      <article className="ow-card ow-statement">
        <header className="ow-statement__h">
          <div className="ow-statement__brand">
            <span className="ow-brand__mark"><BrandLogo size={30} /></span>
            <span><strong>شركة مكتسبات العقارية</strong><small>Muktasabat Real Estate</small></span>
          </div>
          <div>
            <h2>{t("كشف حساب المالك", "Owner statement")}</h2>
            <p>{s.owner.name}</p>
            <p className="ow-muted">{day(locale, s.period_start)} – {day(locale, s.period_end)}</p>
          </div>
          <div className="ow-statement__actions ow-noprint">
            <a className="ow-btn ow-btn--ghost" href={`/api/owner/statement-csv?${csvQ}`}><span className="ms">table_view</span>Excel</a>
            <PrintButton label={t("طباعة / PDF", "Print / PDF")} />
          </div>
        </header>

        <dl className="ow-totals">
          <div><dt>{t("الإيجار المحصّل", "Rent collected")}</dt><dd>{money(locale, s.totals.gross, 2)}</dd></div>
          <div><dt>{t("أتعاب الإدارة", "Management fees")}</dt><dd>− {money(locale, s.totals.management_fee, 2)}</dd></div>
          <div><dt>{t("عمولة الوساطة ورسوم إيجار", "Brokerage & Ejar fees")}</dt><dd>− {money(locale, s.totals.agent_fee + s.totals.ejar_fee, 2)}</dd></div>
          <div><dt>{t("مصروفات مخصومة", "Deducted expenses")}</dt><dd>− {money(locale, s.totals.expenses, 2)}</dd></div>
          <div className="is-total"><dt>{t("صافي المستحق لك", "Net payable to you")}</dt><dd>{money(locale, s.totals.net_payable, 2)}</dd></div>
        </dl>
        {s.owner.iban_last4 && <p className="ow-muted">{t("يُحوَّل إلى", "Transferred to")} {s.owner.bank_name ?? ""} · IBAN ••••{s.owner.iban_last4}</p>}

        <h3>{t("الإيرادات", "Income")}</h3>
        {s.income.length === 0 ? <p className="ow-muted">{t("لا توجد مبالغ محصّلة في هذه الفترة.", "No rent was collected in this period.")}</p> : (
          <div className="ow-table-wrap">
            <table className="ow-table ow-table--dense">
              <thead><tr><th>{t("التاريخ", "Date")}</th><th>{t("العقار / الوحدة", "Property / unit")}</th><th>{t("المستأجر", "Tenant")}</th><th className="num">{t("الإجمالي", "Gross")}</th><th className="num">{t("الأتعاب", "Fees")}</th><th className="num">{t("الصافي", "Net")}</th></tr></thead>
              <tbody>
                {s.income.map((x, i) => (
                  <tr key={i}>
                    <td>{day(locale, x.date)}{x.receipt && <small dir="ltr">#{x.receipt}</small>}</td>
                    <td>{x.building}<small>{t("وحدة", "Unit")} {x.unit}</small></td>
                    <td>{x.tenant ?? "—"}</td>
                    <td className="num">{money(locale, x.gross, 2)}</td>
                    <td className="num">{money(locale, x.management_fee + x.agent_fee + x.ejar_fee, 2)}</td>
                    <td className="num"><strong>{money(locale, x.net, 2)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3>{t("المصروفات", "Expenses")}</h3>
        {s.expenses.length === 0 ? <p className="ow-muted">{t("لا توجد مصروفات في هذه الفترة.", "No expenses in this period.")}</p> : (
          <div className="ow-table-wrap">
            <table className="ow-table ow-table--dense">
              <thead><tr><th>{t("التاريخ", "Date")}</th><th>{t("البند", "Item")}</th><th>{t("العقار", "Property")}</th><th className="num">{t("المبلغ", "Amount")}</th><th>{t("مخصوم من حسابك", "Deducted")}</th></tr></thead>
              <tbody>
                {s.expenses.map((x, i) => (
                  <tr key={i}>
                    <td>{day(locale, x.date)}</td>
                    <td>{x.description}<small>{x.category}{x.vendor ? ` · ${x.vendor}` : ""}</small></td>
                    <td>{x.building ?? "—"}</td>
                    <td className="num">{money(locale, x.amount, 2)}</td>
                    <td>{x.deducted ? t("نعم", "Yes") : t("على حساب الشركة", "Paid by company")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ow-note">{t("صدر هذا الكشف من نظام مكتسبات لإدارة الأملاك. لأي ملاحظة تواصل مع مدير حسابك.", "Generated by the Muktasabat property-management system. Contact your account manager with any questions.")}</p>
      </article>
    </>
  );
}
