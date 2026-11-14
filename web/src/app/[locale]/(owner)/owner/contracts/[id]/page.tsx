import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api";
import { L, day, money, num, ownerApi, type CollectState, type TransferState } from "@/lib/owner";

import { load, one, type SP } from "../../guard";

const COLLECT: Record<CollectState, [string, string, string]> = {
  paid: ["محصّلة", "Collected", "is-ok"],
  reported: ["أبلغ المستأجر بالسداد", "Tenant reported paying", "is-info"],
  overdue: ["متأخرة", "Overdue", "is-warn"],
  due_soon: ["مستحقة قريباً", "Due soon", "is-soon"],
  upcoming: ["قادمة", "Upcoming", ""],
};
const TRANSFER: Record<TransferState, [string, string]> = {
  transferred: ["حُوّلت لك", "Sent to you"],
  pending: ["قيد التحويل", "Transfer scheduled"],
  late: ["تحويل متأخر", "Transfer late"],
  not_paid: ["", ""],
};

export default async function OwnerLease({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: SP }) {
  const { locale, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const as = one((await searchParams).as);
  let res;
  try {
    res = await load(locale, () => ownerApi.lease(locale, Number(id), as));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  if ("error" in res) return res.error;
  const c = res.data;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const qs = as ? `?as=${as}` : "";
  const total = Math.max(1, (new Date(c.end_date).getTime() - new Date(c.start_date).getTime()) / 864e5);
  const elapsed = Math.min(100, Math.max(0, (100 * (total - c.days_left)) / total));
  const tt = c.totals;

  return (
    <>
      <section className="ow-hero">
        <div>
          <h1>
            <Link className="ow-plain" href={`/${locale}/owner/properties/${c.building_id}${qs}`}>{c.building}</Link> · {t("وحدة", "Unit")} {c.unit}
          </h1>
          <p className="ow-muted">
            {t("عقد", "Lease")} <span dir="ltr">{c.contract_number}</span>
            {c.ejar_contract_number ? <> · {t("إيجار", "Ejar")} <span dir="ltr">{c.ejar_contract_number}</span></> : null}
          </p>
        </div>
        <span className={`ow-chip ${c.active ? "is-ok" : "is-muted"}`}>{c.active ? t("ساري", "Active") : t("منتهٍ", "Ended")}</span>
      </section>

      <section className="ow-grid2">
        <article className="ow-card">
          <h2 className="ow-card__t">{t("بيانات العقد", "Lease details")}</h2>
          <div className="ow-term">
            <div className="ow-term__bar"><span style={{ width: `${elapsed}%` }} /></div>
            <div className="ow-term__ends"><span>{day(locale, c.start_date)}</span><span>{day(locale, c.end_date)}</span></div>
            <p className="ow-muted">{c.days_left >= 0 ? `${t("متبقٍّ", "Remaining")}: ${num(locale, c.days_left)} ${t("يوماً", "days")}` : t("انتهى العقد", "Lease has ended")}</p>
          </div>
          <dl className="ow-mini">
            <div><dt>{t("المستأجر", "Tenant")}</dt><dd>{c.tenant?.name ?? "—"}</dd></div>
            <div><dt>{t("الإيجار السنوي", "Annual rent")}</dt><dd>{money(locale, c.annual_rent)}</dd></div>
            <div><dt>{t("قيمة العقد", "Contract value")}</dt><dd>{money(locale, c.total_amount)}</dd></div>
            <div><dt>{t("عدد الدفعات", "Instalments")}</dt><dd>{num(locale, c.payment_count)}</dd></div>
            <div><dt>{t("أتعاب الإدارة", "Management fee")}</dt><dd>{num(locale, c.management_pct, 2)}%</dd></div>
            {c.agent_pct > 0 && <div><dt>{t("عمولة الوساطة", "Brokerage")}</dt><dd>{num(locale, c.agent_pct, 2)}%</dd></div>}
            {c.ejar_fee > 0 && <div><dt>{t("رسوم توثيق إيجار (مرة واحدة)", "Ejar fee (once)")}</dt><dd>{money(locale, c.ejar_fee)}</dd></div>}
            <div><dt>{t("منصة إيجار", "Ejar")}</dt><dd>{c.ejar_status === "registered" ? t("موثّق", "Registered") : c.ejar_status ?? "—"}</dd></div>
          </dl>
        </article>
        <article className="ow-card">
          <h2 className="ow-card__t">{t("ملخص مالي للعقد", "Lease money summary")}</h2>
          <dl className="ow-waterfall">
            <div><dt>{t("إجمالي الدفعات المجدولة", "Scheduled")}</dt><dd>{money(locale, tt.scheduled)}</dd></div>
            <div><dt>{t("المحصّل حتى الآن", "Collected so far")}</dt><dd>{money(locale, tt.collected)}</dd></div>
            <div className="is-neg"><dt>{t("الأتعاب المخصومة", "Fees deducted")}</dt><dd>− {money(locale, tt.fees)}</dd></div>
            <div className="is-total"><dt>{t("حصتك من المحصّل", "Your share collected")}</dt><dd>{money(locale, tt.owner_share)}</dd></div>
          </dl>
          <dl className="ow-mini">
            <div><dt>{t("حُوّل لك", "Sent to you")}</dt><dd>{money(locale, tt.transferred)}</dd></div>
            <div><dt>{t("بانتظار التحويل", "Waiting to be sent")}</dt><dd>{money(locale, tt.owner_share - tt.transferred)}</dd></div>
            {tt.outstanding > 0 && <div><dt>{t("متأخرات المستأجر", "Tenant arrears")}</dt><dd className="is-warn">{money(locale, tt.outstanding)}</dd></div>}
          </dl>
        </article>
      </section>

      <section className="ow-card">
        <h2 className="ow-card__t">{t("جدول الدفعات", "Payment schedule")}</h2>
        <ol className="ow-steps">
          {c.schedule.map((i) => {
            const s = COLLECT[i.status];
            return (
              <li key={i.id} className={`ow-step ow-step--${i.status}`}>
                <div className="ow-step__head">
                  <span className="ow-step__n">{num(locale, i.seq)}</span>
                  <div>
                    <strong>{money(locale, i.amount)}</strong>
                    <small>{t("استحقاق", "Due")} {day(locale, i.due_date)}</small>
                  </div>
                  <span className={`ow-chip ${s[2]}`}>{t(s[0], s[1])}</span>
                </div>
                {i.status === "paid" && (
                  <dl className="ow-step__trail">
                    <div><dt>{t("سدّد المستأجر", "Tenant paid")}</dt><dd>{day(locale, i.paid_date)}{i.receipt ? ` · ${i.receipt}` : ""}</dd></div>
                    <div><dt>{t("الخصومات", "Deductions")}</dt><dd>− {money(locale, i.fees)}</dd></div>
                    <div><dt>{t("حصتك", "Your share")}</dt><dd>{money(locale, i.net)}</dd></div>
                    <div>
                      <dt>{t(TRANSFER[i.transfer.state][0], TRANSFER[i.transfer.state][1])}</dt>
                      <dd className={i.transfer.state === "late" ? "is-warn" : undefined}>
                        {i.transfer.state === "transferred" ? `${day(locale, i.transfer.date)}${i.transfer.reference ? ` · ${i.transfer.reference}` : ""}` : `${t("موعد", "by")} ${day(locale, i.transfer.due_date)}`}
                      </dd>
                    </div>
                  </dl>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
