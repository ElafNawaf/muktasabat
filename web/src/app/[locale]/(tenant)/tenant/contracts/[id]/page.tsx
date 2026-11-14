import Link from "next/link";
import { notFound } from "next/navigation";

import { ReportPaid } from "@/components/tenant/TenantActions";
import { ApiError } from "@/lib/api";
import { L, day, money, num } from "@/lib/owner";
import { STATE_LABEL, STATE_TONE, tenantApi, when } from "@/lib/tenant";

import { one, type SP } from "../../../../(owner)/owner/guard";
import { load } from "../../guard";

export default async function TenantLease({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: SP }) {
  const { locale, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const as = one((await searchParams).as);
  let res;
  try {
    res = await load(locale, () => Promise.all([tenantApi.contract(locale, Number(id), as), tenantApi.me(locale, as)]));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  if ("error" in res) return res.error;
  const [c, me] = res.data;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const total = Math.max(1, (new Date(c.end_date).getTime() - new Date(c.start_date).getTime()) / 864e5);
  const elapsed = Math.min(100, Math.max(0, (100 * (total - c.days_left)) / total));
  const where = [c.address, c.district, c.city].filter(Boolean).join("، ");
  const PTYPE: Record<string, [string, string]> = {
    monthly: ["شهري", "Monthly"], quarterly: ["ربع سنوي", "Quarterly"], semi_annual: ["نصف سنوي", "Every 6 months"], annual: ["سنوي", "Yearly"], yearly: ["سنوي", "Yearly"],
  };

  return (
    <>
      <section className="ow-hero">
        <div>
          <h1>{c.property} · {t("وحدة", "Unit")} {c.unit}</h1>
          <p className="ow-muted">
            {t("عقد", "Lease")} <span dir="ltr">{c.contract_number}</span>
            {c.ejar_contract_number ? <> · {t("رقم عقد إيجار", "Ejar no.")} <span dir="ltr">{c.ejar_contract_number}</span></> : null}
          </p>
        </div>
        {c.lat != null && c.lng != null && (
          <a className="ow-btn ow-btn--ghost" href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noopener noreferrer">
            <span className="ms">map</span>{t("الموقع", "Map")}
          </a>
        )}
      </section>

      <section className="ow-grid2">
        <article className="ow-card">
          <h2 className="ow-card__t">{t("مدة العقد", "Lease term")}</h2>
          <div className="ow-term">
            <div className="ow-term__bar"><span style={{ width: `${elapsed}%` }} /></div>
            <div className="ow-term__ends"><span>{day(locale, c.start_date)}</span><span>{day(locale, c.end_date)}</span></div>
            <p className="ow-muted">
              {c.state === "ended" ? t("انتهى العقد", "This lease has ended") : c.state === "upcoming" ? t("لم يبدأ العقد بعد", "Not started yet") : `${t("متبقٍّ", "Remaining")}: ${num(locale, c.days_left)} ${t("يوماً", "days")}`}
            </p>
            {c.state === "active" && c.days_left <= 90 && (
              <p className="tp-note">{t("يقترب موعد انتهاء العقد. سنتواصل معك بخصوص التجديد، ويمكنك مراسلتنا من صفحة الدعم.", "Your lease ends soon. We'll contact you about renewing; you can also message us from Support.")}</p>
            )}
          </div>
          <dl className="ow-mini">
            {where && <div><dt>{t("العنوان", "Address")}</dt><dd>{where}</dd></div>}
            <div><dt>{t("نوع العقد", "Type")}</dt><dd>{c.type === "commercial" ? t("تجاري", "Commercial") : t("سكني", "Residential")}</dd></div>
            <div><dt>{t("منصة إيجار", "Ejar")}</dt><dd>{c.ejar_status === "registered" ? t("موثّق", "Registered") : c.ejar_status ? t("قيد التوثيق", "In progress") : "—"}</dd></div>
          </dl>
        </article>

        <article className="ow-card">
          <h2 className="ow-card__t">{t("المبالغ", "Amounts")}</h2>
          <dl className="ow-waterfall">
            <div><dt>{t("الإيجار السنوي", "Annual rent")}</dt><dd>{money(locale, c.rent_amount)}</dd></div>
            {c.services_amount > 0 && <div><dt>{t("رسوم الخدمات", "Service charge")}</dt><dd>{money(locale, c.services_amount)}</dd></div>}
            {c.insurance_amount > 0 && <div><dt>{t("التأمين", "Deposit")}</dt><dd>{money(locale, c.insurance_amount)}</dd></div>}
            {c.vat_amount > 0 && <div><dt>{t("ضريبة القيمة المضافة", "VAT")}</dt><dd>{money(locale, c.vat_amount)}</dd></div>}
            <div className="is-total"><dt>{t("إجمالي العقد", "Lease total")}</dt><dd>{money(locale, c.total_amount)}</dd></div>
          </dl>
          <dl className="ow-mini">
            <div><dt>{t("طريقة السداد", "Payment plan")}</dt><dd>{c.payment_type ? t(...(PTYPE[c.payment_type] ?? [c.payment_type, c.payment_type])) : "—"} · {num(locale, c.payments_total)} {t("دفعات", "instalments")}</dd></div>
            <div><dt>{t("دفعت", "Paid")}</dt><dd>{money(locale, c.paid_amount)}</dd></div>
            <div><dt>{t("المتبقي", "Left to pay")}</dt><dd>{money(locale, c.remaining_amount)}</dd></div>
            <div><dt>{t("الكهرباء", "Electricity")}</dt><dd>{c.electricity_on_tenant ? t("على المستأجر", "Paid by you") : t("مشمولة", "Included")}{c.electricity_meter_number ? ` · ${t("عداد", "meter")} ${c.electricity_meter_number}` : ""}</dd></div>
            <div><dt>{t("المياه", "Water")}</dt><dd>{c.water_on_tenant ? t("على المستأجر", "Paid by you") : t("مشمولة", "Included")}{c.water_meter_number ? ` · ${t("عداد", "meter")} ${c.water_meter_number}` : ""}</dd></div>
          </dl>
        </article>
      </section>

      <section className="ow-card">
        <h2 className="ow-card__t">{t("جدول الدفعات", "Payment schedule")}</h2>
        <ol className="ow-steps">
          {c.payments.map((p) => (
            <li key={p.id} className={`ow-step ow-step--${p.state}`}>
              <div className="ow-step__head">
                <span className="ow-step__n">{num(locale, p.seq)}</span>
                <div>
                  <strong>{money(locale, p.amount)}</strong>
                  <small>
                    {day(locale, p.due_date)}
                    {p.state === "paid" ? ` · ${t("دُفعت", "paid")} ${day(locale, p.paid_date)}` : p.state === "reported" ? ` · ${t("نتحقق من بلاغك", "checking your report")}` : ` · ${when(locale, p.days)}`}
                  </small>
                </div>
                <span className={`ow-chip ${STATE_TONE[p.state]}`}>{t(...STATE_LABEL[p.state])}</span>
                {(p.state === "overdue" || p.state === "due_soon") && (
                  <ReportPaid locale={locale} paymentId={p.id} amount={p.amount} disabled={me.preview} label={t("دفعتُها", "I've paid")} />
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="ow-card">
        <h2 className="ow-card__t">{t("مستندات العقد", "Lease documents")}</h2>
        {c.attachments.length === 0 ? (
          <p className="ow-muted">
            {t("لا توجد نسخة مرفوعة من العقد بعد. ", "No copy of the lease has been uploaded yet. ")}
            {c.ejar_contract_number ? t("يمكنك الاطلاع على عقدك الموثّق في منصة إيجار برقم العقد أعلاه.", "You can view the registered lease on the Ejar platform with the number above.") : null}
          </p>
        ) : (
          <ul className="ow-list">
            {c.attachments.map((a) => (
              <li key={a.url}>
                <div><strong>{a.name}</strong><small>{a.type ?? ""}</small></div>
                <a className="ow-btn ow-btn--ghost" href={a.url} target="_blank" rel="noopener noreferrer"><span className="ms">download</span>{t("فتح", "Open")}</a>
              </li>
            ))}
          </ul>
        )}
        <p className="ow-note">
          {t("سؤال عن عقدك أو طلب صيانة؟", "A question about your lease, or something needs fixing?")}{" "}
          <Link className="ow-link" href={`/${locale}/tenant/support?new=1`}>{t("راسلنا", "Message us")}</Link>
        </p>
      </section>
    </>
  );
}
