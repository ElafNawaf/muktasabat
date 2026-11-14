import Link from "next/link";

import { L, day, money, num } from "@/lib/owner";
import { tenantApi } from "@/lib/tenant";

import { one, type SP } from "../../../(owner)/owner/guard";
import { load } from "../guard";

export default async function TenantContracts({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  const as = one((await searchParams).as);
  const res = await load(locale, () => tenantApi.contracts(locale, as));
  if ("error" in res) return res.error;
  const list = res.data;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const qs = as ? `?as=${as}` : "";
  const STATE = { active: [t("ساري", "Active"), "is-ok"], upcoming: [t("يبدأ قريباً", "Starts soon"), "is-info"], ended: [t("منتهٍ", "Ended"), "is-muted"] } as const;
  return (
    <>
      <section className="ow-hero">
        <div>
          <h1>{list.length > 1 ? t("عقودي", "My leases") : t("عقدي", "My lease")}</h1>
          <p className="ow-muted">{t("تفاصيل العقد، والمبالغ، ومستندات العقد.", "Lease details, amounts and documents.")}</p>
        </div>
      </section>
      {list.length === 0 && (
        <div className="ow-empty"><span className="ms">description</span><p>{t("لا توجد عقود مرتبطة بحسابك بعد.", "No leases are linked to your account yet.")}</p></div>
      )}
      {list.map((c) => {
        const pct = c.scheduled_amount ? Math.round((100 * c.paid_amount) / c.scheduled_amount) : 0;
        const [label, tone] = STATE[c.state];
        return (
          <Link key={c.id} href={`/${locale}/tenant/contracts/${c.id}${qs}`} className={`ow-card tp-lease${c.state === "ended" ? " is-dim" : ""}`}>
            <div>
              <h2>{c.property} · {t("وحدة", "Unit")} {c.unit} <span className={`ow-chip ${tone}`}>{label}</span></h2>
              <p className="ow-muted">
                {t("عقد", "Lease")} <span dir="ltr">{c.contract_number}</span> · {day(locale, c.start_date)} – {day(locale, c.end_date)}
              </p>
            </div>
            <div className="tp-lease__pay">
              <div className="ow-bar tp-bar"><span style={{ width: `${pct}%` }} /></div>
              <small>{num(locale, c.payments_paid)}/{num(locale, c.payments_total)} {t("دفعات", "instalments")} · {t("المتبقي", "left")} {money(locale, c.remaining_amount)}</small>
            </div>
            <span className="ms tp-lease__go" aria-hidden>chevron_right</span>
          </Link>
        );
      })}
    </>
  );
}
