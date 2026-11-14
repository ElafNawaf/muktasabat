import Link from "next/link";

import { L, day, money, type ActivityEvent } from "@/lib/owner";

const ICON: Record<ActivityEvent["kind"], [string, string]> = {
  collected: ["payments", "is-ok"],
  transferred: ["account_balance", "is-ok"],
  missed: ["schedule", "is-warn"],
  lease_started: ["key", "is-info"],
  lease_ended: ["logout", ""],
  expense: ["receipt", ""],
  work_order: ["handyman", "is-info"],
};

/** "What happened on my properties" — every collection, payout, missed due
 *  date, lease change, expense and work order, newest first. */
export function ActivityFeed({ locale, events, qs }: { locale: string; events: ActivityEvent[]; qs: string }) {
  const t = (ar: string, en: string) => L(locale, ar, en);
  const where = (e: ActivityEvent) => [e.building, e.unit ? `${t("وحدة", "Unit")} ${e.unit}` : null].filter(Boolean).join(" · ");
  const text = (e: ActivityEvent): React.ReactNode => {
    switch (e.kind) {
      case "collected":
        return <>{t("سدّد", "")} {e.tenant ?? t("المستأجر", "Tenant")} {t("دفعة بقيمة", "paid")} <b>{money(locale, e.amount)}</b> · {t("حصتك", "your share")} {money(locale, e.net)}</>;
      case "transferred":
        return <>{t("حوّلنا لك", "We sent you")} <b>{money(locale, e.amount)}</b>{e.reference ? <> · {t("مرجع", "ref")} <span dir="ltr">{e.reference}</span></> : null}</>;
      case "missed":
        return <>{t("لم تُسدّد دفعة", "Instalment not paid")} <b>{money(locale, e.amount)}</b> {t("في موعدها — نتابع مع", "on time — following up with")} {e.tenant ?? t("المستأجر", "the tenant")}</>;
      case "lease_started":
        return <>{t("بدأ عقد جديد مع", "New lease started with")} {e.tenant ?? "—"} · {money(locale, e.amount)} {t("سنوياً", "/ year")}</>;
      case "lease_ended":
        return <>{t("انتهى عقد", "Lease ended:")} {e.tenant ?? "—"}</>;
      case "expense":
        return <>{t("مصروف", "Expense")}: {e.description || e.category} · <b>{money(locale, e.amount)}</b> {e.deducted ? t("(من حصتك)", "(from your share)") : t("(لا يُخصم منك)", "(not charged to you)")}</>;
      case "work_order":
        return <>{t("طلب صيانة", "Work order")} {e.number}: {e.title}</>;
    }
  };
  const href = (e: ActivityEvent) =>
    e.contract_id ? `/${locale}/owner/contracts/${e.contract_id}${qs}` : e.kind === "work_order" ? `/${locale}/owner/maintenance${qs}` : e.building_id ? `/${locale}/owner/properties/${e.building_id}${qs}` : null;

  return (
    <section className="ow-card">
      <header className="ow-card__h">
        <h2>{t("آخر المستجدات", "Recent activity")}</h2>
        <span className="ow-muted">{t("آخر 4 أشهر", "last 4 months")}</span>
      </header>
      {events.length === 0 ? (
        <p className="ow-muted">{t("لا توجد أحداث في هذه الفترة.", "Nothing happened in this period.")}</p>
      ) : (
        <ol className="ow-feed">
          {events.slice(0, 14).map((e, i) => {
            const [icon, tone] = ICON[e.kind];
            const h = href(e);
            const body = (
              <>
                <span className={`ow-feed__icon ${tone}`} aria-hidden><span className="ms">{icon}</span></span>
                <span className="ow-feed__body">
                  <span>{text(e)}</span>
                  <small>{day(locale, e.at)}{where(e) ? ` · ${where(e)}` : ""}</small>
                </span>
              </>
            );
            return <li key={i}>{h ? <Link href={h} className="ow-feed__row">{body}</Link> : <div className="ow-feed__row">{body}</div>}</li>;
          })}
        </ol>
      )}
      {events.length > 14 && (
        <p className="ow-note"><Link className="ow-link" href={`/${locale}/owner/payments${qs}${qs ? "&" : "?"}year=all`}>{t("كل الدفعات والتحويلات", "All payments & payouts")}</Link></p>
      )}
    </section>
  );
}
