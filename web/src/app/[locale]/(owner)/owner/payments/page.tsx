import Link from "next/link";

import { ParamSelect } from "@/components/owner/OwnerShell";
import { L, day, money, num, ownerApi, type CollectState, type LedgerItem, type TransferState } from "@/lib/owner";

import { load, one, type SP } from "../guard";

const COLLECT: Record<CollectState, [string, string, string]> = {
  paid: ["محصّلة", "Collected", "is-ok"],
  reported: ["أبلغ المستأجر بالسداد", "Tenant reported paying", "is-info"],
  overdue: ["متأخرة", "Overdue", "is-warn"],
  due_soon: ["مستحقة قريباً", "Due soon", "is-soon"],
  upcoming: ["قادمة", "Upcoming", ""],
};

const TRANSFER: Record<TransferState, [string, string, string]> = {
  transferred: ["حُوّلت لك", "Sent to you", "is-ok"],
  pending: ["قيد التحويل", "Transfer scheduled", "is-info"],
  late: ["تحويل متأخر", "Transfer late", "is-warn"],
  not_paid: ["—", "—", "is-muted"],
};

const METHOD: Record<string, [string, string]> = { bank_transfer: ["تحويل بنكي", "Bank transfer"], cash: ["نقداً", "Cash"], cheque: ["شيك", "Cheque"] };

export default async function OwnerPayments({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  const sp = await searchParams;
  const as = one(sp.as);
  const thisYear = new Date().getFullYear();
  const yearRaw = one(sp.year) ?? "all";
  const year = yearRaw === "all" ? null : Number(yearRaw) || null;
  const building = Number(one(sp.building)) || null;
  const filter = one(sp.status);
  const res = await load(locale, () => ownerApi.ledger(locale, { year, building }, as));
  if ("error" in res) return res.error;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const { items, totals, buildings } = res.data;

  const groups: Record<string, (i: LedgerItem) => boolean> = {
    collected: (i) => i.status === "paid",
    outstanding: (i) => i.status === "overdue" || i.status === "reported",
    upcoming: (i) => i.status === "due_soon" || i.status === "upcoming",
    awaiting: (i) => i.transfer.state === "pending" || i.transfer.state === "late",
  };
  const rows = filter && groups[filter] ? items.filter(groups[filter]) : items;
  const qsBase = new URLSearchParams();
  if (yearRaw !== "all") qsBase.set("year", yearRaw);
  if (building) qsBase.set("building", String(building));
  if (as) qsBase.set("as", as);
  const link = (status?: string) => {
    const p = new URLSearchParams(qsBase);
    if (status) p.set("status", status);
    return `/${locale}/owner/payments?${p}`;
  };
  const qs = as ? `?as=${as}` : "";

  const tiles: { key: string; label: string; value: number; sub: string; tone?: string }[] = [
    { key: "collected", label: t("المحصّل من المستأجرين", "Collected from tenants"), value: totals.collected, sub: `${t("بعد خصم الأتعاب", "after fees")}: ${money(locale, totals.owner_share)}` },
    { key: "awaiting", label: t("بانتظار التحويل لك", "Waiting to be sent to you"), value: totals.awaiting_transfer, sub: totals.late_transfers ? `${num(locale, totals.late_transfers)} ${t("تحويل تجاوز موعده", "past the transfer date")}` : `${t("حُوّل لك", "Sent to you")}: ${money(locale, totals.transferred)}`, tone: totals.late_transfers ? "warn" : undefined },
    { key: "outstanding", label: t("متأخرات المستأجرين", "Tenant arrears"), value: totals.outstanding, sub: t("نتابعها مع المستأجرين", "we're following up"), tone: totals.outstanding > 0 ? "warn" : undefined },
    { key: "upcoming", label: t("مستحقات قادمة", "Coming due"), value: totals.upcoming, sub: `${num(locale, items.filter(groups.upcoming).length)} ${t("دفعة", "instalments")}` },
  ];

  return (
    <>
      <section className="ow-hero">
        <div>
          <h1>{t("التحصيل والتحويلات", "Collections & payouts")}</h1>
          <p className="ow-muted">{t("كل دفعة: متى استُحقت، ومتى سُدّدت، وما خُصم منها، ومتى حُوّلت حصتك.", "Every instalment: when it was due, when it was paid, what was deducted, and when your share was sent.")}</p>
        </div>
        <div className="ow-filters">
          <ParamSelect
            name="year"
            value={year ? String(year) : ""}
            label={t("السنة", "Year")}
            options={[
              { value: "", label: t("كل السنوات", "All years") },
              ...[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => ({ value: String(y), label: String(y) })),
            ]}
          />
          {buildings.length > 1 && (
            <ParamSelect
              name="building"
              value={building ? String(building) : ""}
              label={t("العقار", "Property")}
              options={[{ value: "", label: t("كل العقارات", "All properties") }, ...buildings.map((b) => ({ value: String(b.id), label: b.name }))]}
            />
          )}
        </div>
      </section>

      <section className="ow-kpis ow-kpis--4">
        {tiles.map((k) => (
          <Link key={k.key} href={filter === k.key ? link() : link(k.key)} className={`ow-kpi ow-kpi--link${filter === k.key ? " is-on" : ""}${k.tone === "warn" ? " ow-kpi--warn" : ""}`} aria-pressed={filter === k.key}>
            <h2>{k.label}</h2>
            <p className="ow-kpi__v">{money(locale, k.value)}</p>
            <p className="ow-kpi__s">{k.sub}</p>
          </Link>
        ))}
      </section>

      <section className="ow-card">
        <header className="ow-card__h">
          <h2>{filter ? tiles.find((x) => x.key === filter)?.label : t("كل الدفعات", "All instalments")} <span className="ow-muted">({num(locale, rows.length)})</span></h2>
          {filter && <Link className="ow-link" href={link()}>{t("عرض الكل", "Show all")}</Link>}
        </header>
        {rows.length === 0 ? (
          <p className="ow-muted">{t("لا توجد دفعات مطابقة.", "No matching instalments.")}</p>
        ) : (
          <div className="ow-table-wrap">
            <table className="ow-table ow-table--cards">
              <thead>
                <tr>
                  <th>{t("الدفعة", "Instalment")}</th>
                  <th>{t("العقار / المستأجر", "Property / tenant")}</th>
                  <th>{t("التحصيل", "Collection")}</th>
                  <th className="num">{t("المبلغ", "Amount")}</th>
                  <th className="num">{t("الخصومات", "Deductions")}</th>
                  <th className="num">{t("حصتك", "Your share")}</th>
                  <th>{t("التحويل لك", "Payout to you")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const c = COLLECT[i.status];
                  const tr = TRANSFER[i.transfer.state];
                  return (
                    <tr key={i.id}>
                      <td data-label={t("الدفعة", "Instalment")}>
                        <strong>{day(locale, i.due_date)}</strong>
                        <small>{t("الدفعة", "No.")} {num(locale, i.seq)}/{num(locale, i.of)}</small>
                      </td>
                      <td data-label={t("العقار", "Property")}>
                        <Link className="ow-plain" href={`/${locale}/owner/contracts/${i.contract_id}${qs}`}>
                          {i.building} · {t("وحدة", "Unit")} {i.unit}
                        </Link>
                        <small>{i.tenant ?? "—"}</small>
                      </td>
                      <td data-label={t("التحصيل", "Collection")}>
                        <span className={`ow-chip ${c[2]}`}>{t(c[0], c[1])}</span>
                        {i.paid_date && (
                          <small>
                            {day(locale, i.paid_date)}
                            {i.method ? ` · ${t(...(METHOD[i.method] ?? [i.method, i.method]))}` : ""}
                            {i.receipt ? ` · ${t("إيصال", "Receipt")} ${i.receipt}` : ""}
                          </small>
                        )}
                        {i.status === "overdue" && <small className="is-warn">{num(locale, -i.days)} {t("يوماً تأخير", "days late")}</small>}
                      </td>
                      <td className="num" data-label={t("المبلغ", "Amount")}>{money(locale, i.amount)}</td>
                      <td className="num" data-label={t("الخصومات", "Deductions")}>
                        {i.status === "paid" ? (
                          <details className="ow-fees">
                            <summary>− {money(locale, i.fees)}</summary>
                            <dl>
                              <div><dt>{t("أتعاب الإدارة", "Management")}</dt><dd>{money(locale, i.management_fee)}</dd></div>
                              {i.agent_fee > 0 && <div><dt>{t("الوساطة", "Brokerage")}</dt><dd>{money(locale, i.agent_fee)}</dd></div>}
                              {i.ejar_fee > 0 && <div><dt>{t("رسوم إيجار", "Ejar fee")}</dt><dd>{money(locale, i.ejar_fee)}</dd></div>}
                            </dl>
                          </details>
                        ) : (
                          <span className="ow-muted">—</span>
                        )}
                      </td>
                      <td className="num" data-label={t("حصتك", "Your share")}><strong>{money(locale, i.net)}</strong></td>
                      <td data-label={t("التحويل لك", "Payout")}>
                        {i.transfer.state === "not_paid" ? (
                          <span className="ow-muted">{t("بعد السداد", "after payment")}</span>
                        ) : (
                          <>
                            <span className={`ow-chip ${tr[2]}`}>{t(tr[0], tr[1])}</span>
                            <small>
                              {i.transfer.state === "transferred"
                                ? `${day(locale, i.transfer.date)}${i.transfer.reference ? ` · ${t("مرجع", "Ref")} ${i.transfer.reference}` : ""}`
                                : `${t("موعد التحويل", "Due")} ${day(locale, i.transfer.due_date)}`}
                            </small>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="ow-note">
          {t(
            "تُحوَّل حصتك خلال 5 أيام من تاريخ سداد المستأجر. «أبلغ المستأجر بالسداد» تعني أن المستأجر أخبرنا بالتحويل ونحن نتحقق من وصوله.",
            "Your share is sent within 5 days of the tenant paying. “Tenant reported paying” means the tenant told us they paid and we're checking it arrived.",
          )}
        </p>
      </section>
    </>
  );
}
