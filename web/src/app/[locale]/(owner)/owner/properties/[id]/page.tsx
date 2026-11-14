import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api";
import { L, day, money, num, ownerApi, unitType } from "@/lib/owner";

import { load, one, type SP } from "../../guard";

const WO: Record<string, [string, string, string]> = {
  new: ["جديد", "New", ""],
  assigned: ["أُسند لفني", "Assigned", "is-info"],
  awaiting_approval: ["بانتظار موافقتك", "Needs your approval", "is-soon"],
  approved: ["معتمد", "Approved", "is-info"],
  scheduled: ["مجدول", "Scheduled", "is-info"],
  in_progress: ["قيد التنفيذ", "In progress", "is-info"],
  completed: ["مكتمل", "Completed", "is-ok"],
  closed: ["مغلق", "Closed", "is-muted"],
  rejected: ["مرفوض", "Declined", "is-muted"],
  cancelled: ["ملغى", "Cancelled", "is-muted"],
};

export default async function OwnerProperty({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: SP }) {
  const { locale, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const as = one((await searchParams).as);
  let res;
  try {
    res = await load(locale, () => ownerApi.property(locale, Number(id), as));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  if ("error" in res) return res.error;
  const p = res.data;
  const k = p.kpis;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const qs = as ? `?as=${as}` : "";
  const sep = as ? "&" : "?";

  return (
    <>
      <section className="ow-hero">
        <div>
          <h1>{p.name}</h1>
          <p className="ow-muted">
            {[p.address, p.district, p.city].filter(Boolean).join("، ") || "—"}
            {p.deed_number ? ` · ${t("صك", "Deed")} ${p.deed_number}` : ""}
          </p>
        </div>
        <div className="ow-filters">
          {p.lat != null && p.lng != null && (
            <a className="ow-btn ow-btn--ghost" href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer">
              <span className="ms">map</span>{t("الموقع", "Map")}
            </a>
          )}
          <Link className="ow-btn" href={`/${locale}/owner/payments${qs}${sep}building=${p.id}&year=all`}>
            <span className="ms">receipt_long</span>{t("دفعات هذا العقار", "This property's payments")}
          </Link>
        </div>
      </section>

      <section className="ow-kpis ow-kpis--4">
        <article className="ow-kpi ow-kpi--hero">
          <h2>{t("صافي آخر 12 شهراً", "Net, last 12 months")}</h2>
          <p className="ow-kpi__v">{money(locale, k.net_12m)}</p>
          <p className="ow-kpi__s">{t("محصّل", "Collected")} {money(locale, k.collected_12m)} − {t("أتعاب", "fees")} {money(locale, k.fees_12m)} − {t("مصروفات", "expenses")} {money(locale, k.expenses_12m)}</p>
        </article>
        <article className="ow-kpi">
          <h2>{t("الإشغال", "Occupancy")}</h2>
          <p className="ow-kpi__v">{num(locale, k.occupancy, 0)}%</p>
          <p className="ow-kpi__s">{num(locale, k.occupied)} {t("من", "of")} {num(locale, k.units)} {t("وحدات مؤجرة", "units leased")}</p>
        </article>
        <article className="ow-kpi">
          <h2>{t("القيمة الإيجارية السنوية", "Annual rent roll")}</h2>
          <p className="ow-kpi__v">{money(locale, k.annual_rent_roll)}</p>
          <p className="ow-kpi__s">{t("للعقود السارية", "from active leases")}</p>
        </article>
        <article className={`ow-kpi${k.overdue > 0 ? " ow-kpi--warn" : ""}`}>
          <h2>{t("متأخرات", "Overdue")}</h2>
          <p className="ow-kpi__v">{money(locale, k.overdue)}</p>
          <p className="ow-kpi__s">{k.overdue > 0 ? t("نتابعها مع المستأجرين", "we're following up") : t("لا متأخرات", "nothing overdue")}</p>
        </article>
      </section>

      <section className="ow-card">
        <h2 className="ow-card__t">{t("الوحدات", "Units")}</h2>
        <div className="ow-units">
          {p.units.map((u) => (
            <article key={u.id} className={`ow-unit${u.occupied ? "" : " is-vacant"}`}>
              <header>
                <div>
                  <strong>{t("وحدة", "Unit")} {u.number}</strong>
                  <small>{[unitType(locale, u.type), u.area_sqm ? `${num(locale, u.area_sqm)} ${t("م²", "m²")}` : null, u.rooms ? `${num(locale, u.rooms)} ${t("غرف", "rooms")}` : null].filter(Boolean).join(" · ")}</small>
                </div>
                <span className={`ow-chip ${u.occupied ? "is-ok" : "is-muted"}`}>{u.occupied ? t("مؤجرة", "Leased") : t("شاغرة", "Vacant")}</span>
              </header>
              {u.lease ? (
                <dl className="ow-mini">
                  <div><dt>{t("المستأجر", "Tenant")}</dt><dd>{u.lease.tenant ?? "—"}</dd></div>
                  <div><dt>{t("الإيجار السنوي", "Annual rent")}</dt><dd>{money(locale, u.lease.annual_rent)}</dd></div>
                  <div><dt>{t("ينتهي العقد", "Lease ends")}</dt><dd>{day(locale, u.lease.end_date)} <span className={`ow-chip${u.lease.days_left <= 60 ? " is-soon" : ""}`}>{num(locale, u.lease.days_left)} {t("يوم", "d")}</span></dd></div>
                  <div><dt>{t("الدفعة القادمة", "Next instalment")}</dt><dd>{u.next_due ? `${money(locale, u.next_due.amount)} · ${day(locale, u.next_due.date)}` : "—"}</dd></div>
                  {u.overdue > 0 && <div><dt>{t("متأخرات", "Overdue")}</dt><dd className="is-warn">{money(locale, u.overdue)}</dd></div>}
                  <div><dt>{t("محصّل خلال 12 شهراً", "Collected (12 mo)")}</dt><dd>{money(locale, u.collected_12m)}</dd></div>
                </dl>
              ) : (
                <dl className="ow-mini">
                  <div><dt>{t("الإيجار المعروض", "Asking rent")}</dt><dd>{money(locale, u.listed_rent)}</dd></div>
                  <div><dt>{t("شاغرة منذ", "Vacant for")}</dt><dd>{u.vacant_days != null ? `${num(locale, u.vacant_days)} ${t("يوم", "days")}` : "—"}</dd></div>
                </dl>
              )}
              {u.lease && (
                <Link className="ow-link" href={`/${locale}/owner/contracts/${u.lease.id}${qs}`}>
                  {t("تفاصيل العقد والدفعات", "Lease & payments")}
                </Link>
              )}
              {u.history.length > 1 && (
                <details className="ow-history">
                  <summary>{t("العقود السابقة", "Previous leases")} ({num(locale, u.history.length - (u.lease ? 1 : 0))})</summary>
                  <ul className="ow-list">
                    {u.history.filter((h) => h.id !== u.lease?.id).map((h) => (
                      <li key={h.id}>
                        <div><Link className="ow-plain" href={`/${locale}/owner/contracts/${h.id}${qs}`}>{h.tenant ?? "—"}</Link><small>{day(locale, h.start_date)} – {day(locale, h.end_date)}</small></div>
                        <span>{money(locale, h.annual_rent)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="ow-grid2">
        <article className="ow-card">
          <h2 className="ow-card__t">{t("الصيانة", "Maintenance")}</h2>
          {p.work_orders.length === 0 ? (
            <p className="ow-muted">{t("لا توجد أوامر صيانة لهذا العقار.", "No maintenance work orders for this property.")}</p>
          ) : (
            <ul className="ow-list">
              {p.work_orders.map((w) => {
                const s = WO[w.status] ?? [w.status, w.status, ""];
                return (
                  <li key={w.id}>
                    <div>
                      <strong>{w.title}</strong>
                      <small>{w.number}{w.unit ? ` · ${t("وحدة", "Unit")} ${w.unit}` : ""} · {day(locale, w.created_at)}{w.cost ? ` · ${money(locale, w.cost)}` : w.estimate ? ` · ${t("تقدير", "est.")} ${money(locale, w.estimate)}` : ""}</small>
                    </div>
                    <span className={`ow-chip ${s[2]}`}>{t(s[0], s[1])}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="ow-note"><Link className="ow-link" href={`/${locale}/owner/maintenance${qs}`}>{t("كل طلبات الصيانة والموافقات", "All maintenance & approvals")}</Link></p>
        </article>
        <article className="ow-card">
          <h2 className="ow-card__t">{t("المصروفات (12 شهراً)", "Expenses (12 months)")}</h2>
          {p.expenses.length === 0 ? (
            <p className="ow-muted">{t("لا توجد مصروفات مسجّلة.", "No expenses recorded.")}</p>
          ) : (
            <ul className="ow-list">
              {p.expenses.map((e, i) => (
                <li key={i}>
                  <div>
                    <strong>{e.description || e.category}</strong>
                    <small>{day(locale, e.date)}{e.unit ? ` · ${t("وحدة", "Unit")} ${e.unit}` : ""}{e.vendor ? ` · ${e.vendor}` : ""}{e.receipt ? ` · ${t("إيصال", "Receipt")} ${e.receipt}` : ""}</small>
                  </div>
                  <span className="ow-amt">
                    {money(locale, e.amount)}
                    <small>{e.deducted ? t("خُصمت من حصتك", "deducted from your share") : e.paid_by === "tenant" ? t("على المستأجر", "paid by tenant") : t("على الشركة", "paid by us")}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </>
  );
}
