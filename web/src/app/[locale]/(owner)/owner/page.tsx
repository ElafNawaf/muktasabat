import Link from "next/link";

import { CashflowChart, OccupancyRing } from "@/components/owner/OwnerCharts";
import { YearPicker } from "@/components/owner/OwnerShell";
import { L, MONTHS, day, money, num, ownerApi } from "@/lib/owner";

import { ActivityFeed } from "./ActivityFeed";
import { load, one, type SP } from "./guard";
import { ClickRow } from "@/components/ClickRow";

export default async function OwnerOverview({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  const sp = await searchParams;
  const as = one(sp.as);
  const thisYear = new Date().getFullYear();
  const year = Number(one(sp.year)) || thisYear;
  const res = await load(locale, () => Promise.all([ownerApi.overview(locale, year, as), ownerApi.me(locale, as), ownerApi.activity(locale, as).catch(() => [])]));
  if ("error" in res) return res.error;
  const [o, me, events] = res.data;
  const k = o.kpis;
  const qs = as ? `?as=${as}` : "";
  const t = (ar: string, en: string) => L(locale, ar, en);

  return (
    <>
      <section className="ow-hero">
        <div>
          <p className="ow-muted">{t("مرحباً", "Welcome")}،</p>
          <h1>{me.name}</h1>
          <p className="ow-muted">
            {t("ملخص أداء محفظتك العقارية", "Your portfolio performance")} · {t("حتى", "as of")} {day(locale, o.as_of)}
          </p>
        </div>
        <YearPicker year={year} years={[thisYear, thisYear - 1, thisYear - 2]} label={t("السنة", "Year")} />
      </section>

      <section className="ow-kpis">
        <article className="ow-kpi ow-kpi--hero">
          <h2>{t("صافي الدخل", "Net income")} {year}</h2>
          <p className="ow-kpi__v">{money(locale, k.net_income)}</p>
          <p className="ow-kpi__s">
            {t("بعد خصم الأتعاب والمصروفات", "after fees and expenses")}
          </p>
        </article>
        <article className="ow-kpi">
          <h2>{t("المبالغ المحصّلة", "Collected")}</h2>
          <p className="ow-kpi__v">{money(locale, k.gross_collected)}</p>
          <p className="ow-kpi__s">
            {k.collection_rate != null ? `${t("نسبة التحصيل", "Collection rate")} ${num(locale, k.collection_rate, 1)}%` : t("لا توجد مستحقات بعد", "Nothing billed yet")}
          </p>
        </article>
        <article className="ow-kpi ow-kpi--ring">
          <OccupancyRing value={k.occupancy_rate} label={t("نسبة الإشغال", "Occupancy")} />
          <div>
            <h2>{t("نسبة الإشغال", "Occupancy")}</h2>
            <p className="ow-kpi__s">
              {num(locale, k.occupied_units)} {t("مؤجرة من", "leased of")} {num(locale, k.units)} {t("وحدة", "units")}
            </p>
          </div>
        </article>
        <article className={`ow-kpi${k.overdue_amount > 0 ? " ow-kpi--warn" : ""}`}>
          <h2>{t("متأخرات", "Overdue")}</h2>
          <p className="ow-kpi__v">{money(locale, k.overdue_amount)}</p>
          <p className="ow-kpi__s">{num(locale, k.overdue_count)} {t("دفعة متأخرة — نتابعها مع المستأجرين", "late payments — we're following up")}</p>
        </article>
      </section>

      <section className="ow-grid2">
        <article className="ow-card">
          <header className="ow-card__h">
            <h2>{t("التدفق النقدي الشهري", "Monthly cash flow")}</h2>
            <Link className="ow-link" href={`/${locale}/owner/statements${qs}`}>{t("كشوف الحساب", "Statements")}</Link>
          </header>
          <CashflowChart
            data={o.months}
            locale={locale}
            labels={{ months: MONTHS(locale), collected: t("المحصّل", "Collected"), net: t("صافي للمالك", "Net to owner"), due: t("المستحق", "Due") }}
          />
        </article>
        <article className="ow-card">
          <h2 className="ow-card__t">{t("من الإيراد إلى صافي الدخل", "From rent to net income")}</h2>
          <dl className="ow-waterfall">
            <div><dt>{t("الإيجار المحصّل", "Rent collected")}</dt><dd>{money(locale, k.gross_collected)}</dd></div>
            <div className="is-neg"><dt>{t("أتعاب الإدارة", "Management fees")}</dt><dd>− {money(locale, k.management_fees)}</dd></div>
            {k.agent_fees > 0 && <div className="is-neg"><dt>{t("عمولة الوساطة", "Brokerage")}</dt><dd>− {money(locale, k.agent_fees)}</dd></div>}
            {k.ejar_fees > 0 && <div className="is-neg"><dt>{t("رسوم منصة إيجار", "Ejar fees")}</dt><dd>− {money(locale, k.ejar_fees)}</dd></div>}
            {k.expenses > 0 && <div className="is-neg"><dt>{t("مصروفات الصيانة والتشغيل", "Maintenance & operating")}</dt><dd>− {money(locale, k.expenses)}</dd></div>}
            <div className="is-total"><dt>{t("صافي الدخل", "Net income")}</dt><dd>{money(locale, k.net_income)}</dd></div>
          </dl>
          <dl className="ow-mini">
            <div><dt>{t("القيمة الإيجارية السنوية", "Annual rent roll")}</dt><dd>{money(locale, k.annual_rent_roll)}</dd></div>
            <div><dt>{t("عقود سارية", "Active leases")}</dt><dd>{num(locale, k.active_leases)}</dd></div>
            <div><dt>{t("مستحق خلال 60 يوماً", "Due in next 60 days")}</dt><dd>{money(locale, k.upcoming_amount)}</dd></div>
          </dl>
        </article>
      </section>

      <section className="ow-card">
        <header className="ow-card__h">
          <h2>{t("أداء العقارات", "Property performance")}</h2>
          <Link className="ow-link" href={`/${locale}/owner/properties${qs}`}>{t("كل العقارات", "All properties")}</Link>
        </header>
        {o.buildings.length === 0 ? (
          <p className="ow-muted">{t("لا توجد عقارات مرتبطة بحسابك بعد.", "No properties are linked to your account yet.")}</p>
        ) : (
          <div className="ow-table-wrap">
            <table className="ow-table">
              <thead>
                <tr>
                  <th>{t("العقار", "Property")}</th>
                  <th>{t("الإشغال", "Occupancy")}</th>
                  <th className="num">{t("المحصّل", "Collected")}</th>
                  <th className="num">{t("الصافي", "Net")}</th>
                  <th className="num">{t("متأخرات", "Overdue")}</th>
                </tr>
              </thead>
              <tbody>
                {o.buildings.map((b) => (
                  <ClickRow key={b.id} href={`/${locale}/owner/properties/${b.id}${qs}`}>
                    <td>
                      <Link className="ow-plain" href={`/${locale}/owner/properties/${b.id}${qs}`}><strong>{b.name}</strong></Link>
                      <small>{[b.district, b.city].filter(Boolean).join("، ")}</small>
                    </td>
                    <td>
                      <div className="ow-bar" aria-label={`${b.occupancy}%`}><span style={{ width: `${b.occupancy}%` }} /></div>
                      <small>{num(locale, b.occupied)}/{num(locale, b.units)}</small>
                    </td>
                    <td className="num">{money(locale, b.collected)}</td>
                    <td className="num">{money(locale, b.net)}</td>
                    <td className={`num${b.outstanding > 0 ? " is-warn" : ""}`}>{money(locale, b.outstanding)}</td>
                  </ClickRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ActivityFeed locale={locale} events={events} qs={qs} />

      <section className="ow-grid2">
        <article className="ow-card">
          <h2 className="ow-card__t">{t("عقود تنتهي خلال 90 يوماً", "Leases ending within 90 days")}</h2>
          {o.expiring.length === 0 ? (
            <p className="ow-muted">{t("لا توجد عقود قريبة الانتهاء.", "No leases are ending soon.")}</p>
          ) : (
            <ul className="ow-list">
              {o.expiring.map((e) => (
                <li key={e.contract_id}>
                  <div>
                    <strong>{e.building} · {t("وحدة", "Unit")} {e.unit}</strong>
                    <small>{e.tenant ?? "—"} · {day(locale, e.end_date)}</small>
                  </div>
                  <span className={`ow-chip${e.days_left <= 30 ? " is-warn" : ""}`}>{e.days_left} {t("يوم", "days")}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="ow-note">{t("نتواصل مع المستأجرين للتجديد قبل 60 يوماً من الانتهاء ونرفع لك التوصية.", "We contact tenants about renewal 60 days ahead and send you our recommendation.")}</p>
        </article>
        <article className="ow-card">
          <h2 className="ow-card__t">{t("دفعات متأخرة", "Overdue payments")}</h2>
          {o.overdue.length === 0 ? (
            <p className="ow-ok"><span className="ms">check_circle</span>{t("لا توجد دفعات متأخرة. ممتاز!", "No overdue payments.")}</p>
          ) : (
            <ul className="ow-list">
              {o.overdue.map((p, i) => (
                <li key={i}>
                  <div>
                    <strong>{p.building} · {t("وحدة", "Unit")} {p.unit}</strong>
                    <small>{p.tenant ?? "—"} · {t("استحقاق", "due")} {day(locale, p.due_date)}</small>
                  </div>
                  <span className="ow-chip is-warn">{money(locale, p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </>
  );
}
