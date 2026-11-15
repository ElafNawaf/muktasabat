import Link from "next/link";

import { L, day, money, num, ownerApi } from "@/lib/owner";

import { load, one, type SP } from "../guard";
import { ClickRow } from "@/components/ClickRow";

export default async function OwnerContracts({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  const as = one((await searchParams).as);
  const res = await load(locale, () => ownerApi.contracts(locale, as));
  if ("error" in res) return res.error;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const { leases, management } = res.data;
  const qs = as ? `?as=${as}` : "";
  const ejar = (s?: string | null) =>
    s === "registered" ? <span className="ow-chip is-ok">{t("موثّق", "Registered")}</span> : s === "pending" ? <span className="ow-chip">{t("قيد التوثيق", "Pending")}</span> : s ? <span className="ow-chip is-warn">{s}</span> : <span className="ow-muted">—</span>;
  return (
    <>
      <section className="ow-hero"><div><h1>{t("العقود", "Contracts")}</h1><p className="ow-muted">{t("عقد إدارة الأملاك وعقود الإيجار الموثّقة على منصة إيجار", "Your management agreement and leases registered on Ejar")}</p></div></section>

      {management.length > 0 && (
        <section className="ow-card">
          <h2 className="ow-card__t">{t("عقد إدارة الأملاك", "Property-management agreement")}</h2>
          {management.map((m) => (
            <dl key={m.id} className="ow-mini ow-mini--row">
              <div><dt>{t("رقم العقد", "Agreement no.")}</dt><dd dir="ltr">{m.contract_number ?? "—"}</dd></div>
              <div><dt>{t("المدة", "Term")}</dt><dd>{day(locale, m.start_date)} – {day(locale, m.end_date)}</dd></div>
              <div><dt>{t("أتعاب الإدارة", "Management fee")}</dt><dd>{m.fee_type === "fixed" ? money(locale, m.fee_fixed_amount) : `${num(locale, m.fee_percentage, 2)}% ${t("من الإيجار المحصّل", "of rent collected")}`}</dd></div>
              <div><dt>{t("حد الصيانة دون موافقة", "Maintenance approval limit")}</dt><dd>{money(locale, m.maintenance_limit_amount)}</dd></div>
              <div><dt>{t("منصة إيجار", "Ejar")}</dt><dd>{ejar(m.ejar_status)}</dd></div>
            </dl>
          ))}
        </section>
      )}

      <section className="ow-card">
        <h2 className="ow-card__t">{t("عقود الإيجار", "Leases")} <span className="ow-muted">({num(locale, leases.length)})</span></h2>
        {leases.length === 0 ? (
          <p className="ow-muted">{t("لا توجد عقود إيجار بعد.", "No leases yet.")}</p>
        ) : (
          <div className="ow-table-wrap">
            <table className="ow-table ow-table--cards">
              <thead><tr><th>{t("العقد", "Lease")}</th><th>{t("المستأجر", "Tenant")}</th><th>{t("المدة", "Term")}</th><th className="num">{t("قيمة العقد", "Value")}</th><th>{t("السداد", "Paid")}</th><th>{t("إيجار", "Ejar")}</th></tr></thead>
              <tbody>
                {leases.map((c) => {
                  const pct = c.payments_total ? Math.round((100 * c.payments_paid) / c.payments_total) : 0;
                  return (
                    <ClickRow key={c.id} href={`/${locale}/owner/contracts/${c.id}${qs}`} className={c.active ? undefined : "is-dim"}>
                      <td><Link className="ow-plain" href={`/${locale}/owner/contracts/${c.id}${qs}`}><strong>{c.building} · {c.unit}</strong></Link><small dir="ltr">{c.contract_number}</small></td>
                      <td data-label={t("المستأجر", "Tenant")}>{c.tenant ?? "—"}</td>
                      <td data-label={t("المدة", "Term")}>{day(locale, c.start_date)}<small>{t("حتى", "to")} {day(locale, c.end_date)}</small></td>
                      <td className="num" data-label={t("قيمة العقد", "Value")}>{money(locale, c.total_rent)}</td>
                      <td data-label={t("السداد", "Paid")}><div className="ow-bar"><span style={{ width: `${pct}%` }} /></div><small>{pct}%</small></td>
                      <td data-label={t("إيجار", "Ejar")}>{ejar(c.ejar_status)}</td>
                    </ClickRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
