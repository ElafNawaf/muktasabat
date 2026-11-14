import Link from "next/link";

import { ReportPaid, Reminders } from "@/components/tenant/TenantActions";
import { L, day, money, num } from "@/lib/owner";
import { METHOD_LABEL, STATE_LABEL, STATE_TONE, tenantApi, when, type TenantPayment } from "@/lib/tenant";

import { one, type SP } from "../../../(owner)/owner/guard";
import { load } from "../guard";

const FILTERS = ["unpaid", "paid", "all"] as const;

export default async function TenantPayments({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  const sp = await searchParams;
  const as = one(sp.as);
  const f = (FILTERS as readonly string[]).includes(one(sp.show) ?? "") ? (one(sp.show) as (typeof FILTERS)[number]) : "unpaid";
  const res = await load(locale, () => Promise.all([tenantApi.payments(locale, as), tenantApi.me(locale, as)]));
  if ("error" in res) return res.error;
  const [all, me] = res.data;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const rows = all.filter((p) => (f === "all" ? true : f === "paid" ? p.state === "paid" : p.state !== "paid"));
  const href = (show: string) => `/${locale}/tenant/payments?show=${show}${as ? `&as=${as}` : ""}`;
  const count = (show: string) => all.filter((p) => (show === "all" ? true : show === "paid" ? p.state === "paid" : p.state !== "paid")).length;
  const cal = `/api/tenant/calendar?locale=${locale}${as ? `&as_tenant=${as}` : ""}`;

  return (
    <>
      <section className="ow-hero">
        <div>
          <h1>{t("دفعاتي", "My payments")}</h1>
          <p className="ow-muted">{t("كل دفعات الإيجار ومواعيدها وحالتها.", "Every rent instalment, its date and its status.")}</p>
        </div>
      </section>

      <nav className="tp-tabs" aria-label={t("تصفية", "Filter")}>
        {FILTERS.map((s) => (
          <Link key={s} href={href(s)} className={f === s ? "is-on" : undefined} aria-current={f === s ? "page" : undefined}>
            {s === "unpaid" ? t("غير مسددة", "To pay") : s === "paid" ? t("مسددة", "Paid") : t("الكل", "All")}
            <span>{num(locale, count(s))}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="ow-empty">
          <span className="ms">verified</span>
          <p>{f === "unpaid" ? t("لا توجد دفعات مستحقة عليك.", "You have nothing left to pay.") : t("لا توجد دفعات هنا.", "No payments here.")}</p>
        </div>
      ) : (
        <ol className="tp-pays">
          {rows.map((p) => (
            <PaymentRow key={p.id} p={p} locale={locale} preview={me.preview} />
          ))}
        </ol>
      )}

      <section className="ow-card">
        <h2 className="ow-card__t">{t("التذكيرات", "Reminders")}</h2>
        <Reminders locale={locale} on={me.email_reminders} preview={me.preview} calendarHref={cal} />
      </section>
    </>
  );
}

function PaymentRow({ p, locale, preview }: { p: TenantPayment; locale: string; preview: boolean }) {
  const t = (ar: string, en: string) => L(locale, ar, en);
  return (
    <li className={`tp-pay tp-pay--${p.state}`}>
      <div className="tp-pay__date">
        <strong>{new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric" }).format(new Date(p.due_date))}</strong>
        <small>{new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { month: "short", year: "numeric" }).format(new Date(p.due_date))}</small>
      </div>
      <div className="tp-pay__body">
        <div className="tp-pay__top">
          <strong className="tp-pay__amt">{money(locale, p.amount)}</strong>
          <span className={`ow-chip ${STATE_TONE[p.state]}`}>{t(...STATE_LABEL[p.state])}</span>
        </div>
        <small>
          {t("الدفعة", "Instalment")} {num(locale, p.seq)}/{num(locale, p.of)} · {p.property} · {t("وحدة", "Unit")} {p.unit}
        </small>
        {p.state === "paid" ? (
          <small>
            {t("دُفعت", "Paid")} {day(locale, p.paid_date)}
            {p.method ? ` · ${t(...(METHOD_LABEL[p.method] ?? [p.method, p.method]))}` : ""}
            {p.receipt_number ? ` · ${t("إيصال", "Receipt")} ${p.receipt_number}` : ""}
          </small>
        ) : p.state === "reported" && p.report ? (
          <small>
            {t("أبلغتنا بالدفع في", "You told us you paid on")} {day(locale, p.report.paid_on)}
            {p.report.reference ? <> · {t("إيصال", "receipt")} <span dir="ltr">{p.report.reference}</span></> : null} — {t("نتحقق منه الآن", "we're checking it")}
            {p.report.receipt_url ? <> · <a href={p.report.receipt_url} target="_blank" rel="noopener noreferrer">{t("المرفق", "attachment")}</a></> : null}
          </small>
        ) : (
          <small className={p.state === "overdue" ? "is-warn" : undefined}>{when(locale, p.days)}</small>
        )}
        {p.report?.status === "rejected" && p.state !== "paid" && (
          <p className="tp-note tp-note--warn">{t("لم نتمكن من تأكيد بلاغك", "We couldn't confirm your report")}: {p.report.review_note}</p>
        )}
      </div>
      {(p.state === "overdue" || p.state === "due_soon" || p.state === "upcoming") && (
        <div className="tp-pay__act">
          <ReportPaid locale={locale} paymentId={p.id} amount={p.amount} disabled={preview} variant={p.state === "upcoming" ? "ghost" : "primary"} label={t("دفعتُها", "I've paid")} />
        </div>
      )}
    </li>
  );
}
