import { L, money, num, ownerApi } from "@/lib/owner";

import { load, one, type SP } from "../guard";
import { RenewalDecision } from "./RenewalDecision";

const STAGE: Record<string, [string, string]> = {
  due: ["قيد المتابعة", "In progress"], contacted: ["تم التواصل مع المستأجر", "Tenant contacted"], offer_sent: ["عرض مُرسل للمستأجر", "Offer sent to tenant"],
  awaiting_owner: ["بانتظار موافقتك", "Needs your approval"], agreed: ["تم الاتفاق", "Agreed"], renewed: ["جُدّد", "Renewed"], lost: ["لن يُجدّد", "Not renewing"],
};

export default async function OwnerRenewals({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  const as = one((await searchParams).as);
  const res = await load(locale, () => ownerApi.renewals(locale, as));
  if ("error" in res) return res.error;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const st = (k: string) => STAGE[k]?.[locale === "ar" ? 0 : 1] ?? k;
  const all = res.data;
  const pending = all.filter((r) => r.stage === "awaiting_owner");
  const open = all.filter((r) => !["renewed", "lost"].includes(r.stage));
  const closed = all.filter((r) => ["renewed", "lost"].includes(r.stage));
  const rate = closed.length ? Math.round((closed.filter((r) => r.stage === "renewed").length / closed.length) * 100) : null;
  const pct = (p?: number | null) => (p == null ? "" : ` (${p > 0 ? "+" : ""}${p}%)`);

  return (
    <>
      <section className="ow-hero">
        <div>
          <h1>{t("تجديد العقود", "Lease renewals")}</h1>
          <p className="ow-muted">{t("نبدأ التواصل مع المستأجرين قبل انتهاء العقد بـ90 يومًا. أي تجديد بإيجار أقل من الحالي ينتظر موافقتك.", "We contact tenants 90 days before a lease ends. Any renewal at a lower rent waits for your approval.")}</p>
        </div>
      </section>
      <section className="ow-kpis ow-kpis--3">
        <div className={`ow-kpi${pending.length ? " ow-kpi--warn" : ""}`}><h2>{t("بانتظار موافقتك", "Needs your approval")}</h2><p className="ow-kpi__v">{num(locale, pending.length)}</p></div>
        <div className="ow-kpi"><h2>{t("عقود قيد التجديد", "Leases up for renewal")}</h2><p className="ow-kpi__v">{num(locale, open.length)}</p><p className="ow-kpi__s">{money(locale, open.reduce((a, r) => a + r.current_rent, 0))} {t("سنويًا", "a year")}</p></div>
        <div className="ow-kpi"><h2>{t("نسبة التجديد", "Renewal rate")}</h2><p className="ow-kpi__v">{rate == null ? "—" : `${num(locale, rate)}%`}</p></div>
      </section>

      {pending.length > 0 && (
        <section className="ow-card ow-approvals">
          <h2 className="ow-h2">{t("عروض تحتاج قرارك", "Offers waiting for your decision")}</h2>
          {pending.map((r) => (
            <article key={r.id} className="ow-approval">
              <div>
                <strong>{r.building}{r.unit ? ` · ${t("وحدة", "Unit")} ${r.unit}` : ""}</strong>
                <p className="ow-muted">{r.tenant} · {t("ينتهي العقد", "Lease ends")} {r.end_date}</p>
                <p>{t("الإيجار الحالي", "Current rent")}: {money(locale, r.current_rent)} → <strong>{money(locale, r.proposed_rent ?? 0)}</strong><span dir="ltr">{pct(r.change_pct)}</span></p>
              </div>
              {as ? <p className="ow-muted">{t("المعاينة للقراءة فقط", "Preview is read-only")}</p> : <RenewalDecision id={r.id} locale={locale} />}
            </article>
          ))}
        </section>
      )}

      <section className="ow-card">
        <h2 className="ow-h2">{t("كل التجديدات", "All renewals")}</h2>
        {all.length === 0 ? (
          <p className="ow-muted">{t("لا توجد عقود تقترب من الانتهاء حاليًا.", "No leases are close to ending right now.")}</p>
        ) : (
          <div className="ow-table-wrap">
            <table className="ow-table">
              <thead><tr><th>{t("العقار / الوحدة", "Property / unit")}</th><th>{t("المستأجر", "Tenant")}</th><th>{t("ينتهي", "Ends")}</th><th>{t("الحالة", "Status")}</th><th className="num">{t("الإيجار", "Rent")}</th></tr></thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id}>
                    <td>{r.building}{r.unit && <small>{t("وحدة", "Unit")} {r.unit}</small>}</td>
                    <td>{r.tenant ?? "—"}</td>
                    <td>{r.end_date}</td>
                    <td><span className={`ow-chip ${r.stage === "renewed" ? "is-ok" : r.stage === "awaiting_owner" || r.stage === "lost" ? "is-warn" : ""}`}>{st(r.stage)}</span></td>
                    <td className="num">{money(locale, r.proposed_rent ?? r.current_rent)}{r.proposed_rent != null && <small dir="ltr">{pct(r.change_pct)}</small>}</td>
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
