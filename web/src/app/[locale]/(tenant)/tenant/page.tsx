import Link from "next/link";

import { ReportPaid, Reminders } from "@/components/tenant/TenantActions";
import { L, day, money, num } from "@/lib/owner";
import { STATE_LABEL, STATE_TONE, tenantApi, when } from "@/lib/tenant";

import { one, type SP } from "../../(owner)/owner/guard";
import { load } from "./guard";

export default async function TenantHome({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  const as = one((await searchParams).as);
  const res = await load(locale, () => Promise.all([tenantApi.overview(locale, as), tenantApi.me(locale, as)]));
  if ("error" in res) return res.error;
  const [o, me] = res.data;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const qs = as ? `?as=${as}` : "";
  const k = o.kpis;
  const n = o.next;
  const cal = `/api/tenant/calendar?locale=${locale}${as ? `&as_tenant=${as}` : ""}`;

  return (
    <>
      <section className="ow-hero">
        <div>
          <p className="ow-muted">{t("مرحباً", "Hello")}،</p>
          <h1>{me.name}</h1>
        </div>
      </section>

      <section className="tp-top">
        {n ? (
          <article className={`tp-next tp-next--${n.state}`}>
            <h2>{n.state === "overdue" ? t("دفعة متأخرة", "Overdue instalment") : t("دفعتك القادمة", "Your next payment")}</h2>
            <p className="tp-next__amt">{money(locale, n.amount)}</p>
            <p className="tp-next__when">
              <span className="ms" aria-hidden>event</span>
              {day(locale, n.due_date)} · <strong>{when(locale, n.days)}</strong>
            </p>
            <p className="tp-next__meta">
              {t("الدفعة", "Instalment")} {num(locale, n.seq)} {t("من", "of")} {num(locale, n.of)} · {n.property} · {t("وحدة", "Unit")} {n.unit}
            </p>
            {n.report?.status === "rejected" && (
              <p className="tp-note tp-note--warn">
                {t("لم نتمكن من تأكيد بلاغك السابق", "We couldn't confirm your last report")}: {n.report.review_note}
              </p>
            )}
            <div className="tp-next__actions">
              <ReportPaid locale={locale} paymentId={n.id} amount={n.amount} disabled={me.preview} />
              <Link className="ow-btn ow-btn--ghost tp-on-dark" href={`/${locale}/tenant/contracts/${n.contract_id}${qs}`}>
                {t("عرض العقد", "View lease")}
              </Link>
            </div>
          </article>
        ) : (
          <article className="tp-next tp-next--paid">
            <h2>{k.reported_count ? t("بانتظار التأكيد", "Being confirmed") : t("لا توجد دفعات مستحقة", "Nothing due")}</h2>
            <p className="tp-next__amt"><span className="ms" aria-hidden>verified</span></p>
            <p className="tp-next__meta">
              {k.reported_count
                ? t("نتحقق من الدفعات التي أبلغت عنها وسنؤكدها قريباً.", "We're checking the payments you reported and will confirm them soon.")
                : t("سددت كل دفعاتك. شكراً لك.", "You're all paid up. Thank you.")}
            </p>
          </article>
        )}

        <div className="tp-stats">
          <div className={k.overdue_amount > 0 ? "is-warn" : undefined}>
            <dt>{t("متأخر", "Overdue")}</dt>
            <dd>{money(locale, k.overdue_amount)}</dd>
          </div>
          <div>
            <dt>{t("المتبقي على عقودك", "Left to pay on your lease")}</dt>
            <dd>{money(locale, k.remaining_amount)}</dd>
          </div>
          <div>
            <dt>{t("دفعته حتى الآن", "Paid so far")}</dt>
            <dd>{money(locale, k.paid_amount)}</dd>
          </div>
          {k.reported_count > 0 && (
            <div className="is-info">
              <dt>{t("قيد التأكيد", "Being confirmed")}</dt>
              <dd>{num(locale, k.reported_count)} {t("دفعة", "instalment(s)")}</dd>
            </div>
          )}
        </div>
      </section>

      <section className="ow-grid2">
        <article className="ow-card">
          <header className="ow-card__h">
            <h2>{t("المواعيد القادمة", "Coming up")}</h2>
            <Link className="ow-link" href={`/${locale}/tenant/payments${qs}`}>{t("كل الدفعات", "All payments")}</Link>
          </header>
          {o.upcoming.length === 0 ? (
            <p className="ow-muted">{t("لا توجد دفعات قادمة.", "No upcoming payments.")}</p>
          ) : (
            <ul className="ow-list">
              {o.upcoming.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{money(locale, p.amount)}</strong>
                    <small>{day(locale, p.due_date)} · {when(locale, p.days)}</small>
                  </div>
                  <span className={`ow-chip ${STATE_TONE[p.state]}`}>{t(...STATE_LABEL[p.state])}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="ow-card">
          <h2 className="ow-card__t">{t("لا تفوّت موعداً", "Never miss a date")}</h2>
          <Reminders locale={locale} on={me.email_reminders} preview={me.preview} calendarHref={cal} />
          <p className="ow-note">
            {t("بعد الدفع بالطريقة المتفق عليها في عقدك، اضغط «دفعتُ هذه الدفعة» لنؤكد الاستلام.", "After paying the way your lease sets out, tap “I've paid this” so we can confirm it.")}
          </p>
        </article>
      </section>

      {o.contracts.map((c) => {
        const pct = c.scheduled_amount ? Math.round((100 * c.paid_amount) / c.scheduled_amount) : 0;
        return (
          <Link key={c.id} href={`/${locale}/tenant/contracts/${c.id}${qs}`} className="ow-card tp-lease">
            <div>
              <h2>{c.property} · {t("وحدة", "Unit")} {c.unit}</h2>
              <p className="ow-muted">
                {t("عقد", "Lease")} <span dir="ltr">{c.contract_number}</span> · {day(locale, c.start_date)} – {day(locale, c.end_date)}
              </p>
            </div>
            <div className="tp-lease__pay">
              <div className="ow-bar tp-bar"><span style={{ width: `${pct}%` }} /></div>
              <small>
                {num(locale, c.payments_paid)} {t("من", "of")} {num(locale, c.payments_total)} {t("دفعات مسددة", "instalments paid")} · {money(locale, c.paid_amount)} / {money(locale, c.scheduled_amount)}
              </small>
            </div>
            <span className="ms tp-lease__go" aria-hidden>chevron_right</span>
          </Link>
        );
      })}

      {o.recent_paid.length > 0 && (
        <section className="ow-card">
          <h2 className="ow-card__t">{t("آخر الدفعات المؤكدة", "Recently confirmed")}</h2>
          <ul className="ow-list">
            {o.recent_paid.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{money(locale, p.amount)}</strong>
                  <small>{t("دُفعت", "Paid")} {day(locale, p.paid_date)}{p.receipt_number ? ` · ${t("إيصال", "Receipt")} ${p.receipt_number}` : ""}</small>
                </div>
                <span className="ow-chip is-ok">{t("مؤكدة", "Confirmed")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
