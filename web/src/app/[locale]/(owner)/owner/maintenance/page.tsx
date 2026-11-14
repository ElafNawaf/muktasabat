import { L, day, money, num, ownerApi } from "@/lib/owner";

import { load, one, type SP } from "../guard";
import { OwnerDecision } from "./OwnerDecision";

const STATUS: Record<string, [string, string]> = {
  new: ["جديد", "New"], assigned: ["مُسند", "Assigned"], awaiting_approval: ["بانتظار موافقتك", "Needs your approval"], approved: ["معتمد", "Approved"],
  rejected: ["مرفوض", "Rejected"], in_progress: ["قيد التنفيذ", "In progress"], completed: ["منجز", "Completed"], closed: ["مغلق", "Closed"],
};
const CAT: Record<string, [string, string]> = {
  plumbing: ["سباكة", "Plumbing"], electrical: ["كهرباء", "Electrical"], ac: ["تكييف", "A/C"], carpentry: ["نجارة", "Carpentry"], painting: ["دهانات", "Painting"],
  cleaning: ["نظافة", "Cleaning"], pest: ["مكافحة حشرات", "Pest control"], appliances: ["أجهزة", "Appliances"], structural: ["إنشائي", "Structural"],
  elevator: ["مصاعد", "Elevator"], fire_safety: ["سلامة وحريق", "Fire safety"], other: ["أخرى", "Other"],
};

export default async function OwnerMaintenance({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  const sp = await searchParams;
  const as = one(sp.as);
  const res = await load(locale, () => ownerApi.workOrders(locale, as));
  if ("error" in res) return res.error;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const lb = (m: Record<string, [string, string]>, k: string) => m[k]?.[locale === "ar" ? 0 : 1] ?? k;
  const all = res.data;
  const pending = all.filter((w) => w.status === "awaiting_approval");
  const open = all.filter((w) => ["new", "assigned", "approved", "in_progress"].includes(w.status));
  const done = all.filter((w) => ["completed", "closed"].includes(w.status));
  const year = new Date().getFullYear();
  const spent = done.filter((w) => w.charge_to === "owner" && (w.completed_at ?? w.created_at).startsWith(String(year))).reduce((a, w) => a + (w.actual_cost ?? 0), 0);

  return (
    <>
      <section className="ow-hero">
        <div>
          <h1>{t("الصيانة", "Maintenance")}</h1>
          <p className="ow-muted">{t("كل أعمال الصيانة في عقاراتك. الأعمال التي تتجاوز الحد المفوَّض في عقد الإدارة تنتظر موافقتك قبل البدء.", "Every maintenance job on your properties. Jobs above the limit in your management agreement wait for your approval before work starts.")}</p>
        </div>
      </section>
      <section className="ow-kpis ow-kpis--3">
        <div className={`ow-kpi${pending.length ? " ow-kpi--warn" : ""}`}><h2>{t("بانتظار موافقتك", "Needs your approval")}</h2><p className="ow-kpi__v">{num(locale, pending.length)}</p></div>
        <div className="ow-kpi"><h2>{t("قيد العمل", "In progress")}</h2><p className="ow-kpi__v">{num(locale, open.length)}</p></div>
        <div className="ow-kpi"><h2>{t(`تكلفة الصيانة ${year}`, `Maintenance cost ${year}`)}</h2><p className="ow-kpi__v">{money(locale, spent)}</p><p className="ow-kpi__s">{num(locale, done.length)} {t("عمل منجز", "jobs done")}</p></div>
      </section>

      {pending.length > 0 && (
        <section className="ow-card ow-approvals">
          <h2 className="ow-h2">{t("طلبات تحتاج قرارك", "Waiting for your decision")}</h2>
          {pending.map((w) => (
            <article key={w.id} className="ow-approval">
              <div>
                <strong>{w.title}</strong>
                <p className="ow-muted">{w.building}{w.unit ? ` · ${t("وحدة", "Unit")} ${w.unit}` : ""} · {lb(CAT, w.category)} · {w.number}</p>
                {w.description && <p>{w.description}</p>}
                <p>
                  {t("التكلفة التقديرية", "Estimated cost")}: <strong>{money(locale, w.estimate_amount ?? 0)}</strong>
                  {w.approval_limit != null && <span className="ow-muted"> · {t("الحد المفوَّض", "Pre-authorised limit")} {money(locale, w.approval_limit)}</span>}
                </p>
              </div>
              {as ? <p className="ow-muted">{t("المعاينة للقراءة فقط", "Preview is read-only")}</p> : <OwnerDecision id={w.id} locale={locale} />}
            </article>
          ))}
        </section>
      )}

      <section className="ow-card">
        <h2 className="ow-h2">{t("سجل الأعمال", "All jobs")}</h2>
        {all.length === 0 ? (
          <p className="ow-muted">{t("لا توجد أعمال صيانة مسجلة على عقاراتك.", "No maintenance jobs on your properties yet.")}</p>
        ) : (
          <div className="ow-table-wrap">
            <table className="ow-table">
              <thead><tr><th>{t("العمل", "Job")}</th><th>{t("العقار / الوحدة", "Property / unit")}</th><th>{t("الحالة", "Status")}</th><th className="num">{t("التكلفة", "Cost")}</th><th>{t("التاريخ", "Date")}</th></tr></thead>
              <tbody>
                {all.map((w) => (
                  <tr key={w.id}>
                    <td>{w.title}<small>{lb(CAT, w.category)} · {w.number}</small></td>
                    <td>{w.building}{w.unit && <small>{t("وحدة", "Unit")} {w.unit}</small>}</td>
                    <td><span className={`ow-chip ${["completed", "closed"].includes(w.status) ? "is-ok" : w.status === "awaiting_approval" ? "is-warn" : ""}`}>{lb(STATUS, w.status)}</span></td>
                    <td className="num">{w.actual_cost != null ? money(locale, w.actual_cost) : w.estimate_amount != null ? `≈ ${money(locale, w.estimate_amount)}` : "—"}</td>
                    <td>{day(locale, w.created_at.slice(0, 10))}</td>
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
