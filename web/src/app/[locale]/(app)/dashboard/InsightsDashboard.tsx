"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useTheme } from "@/components/ThemeProvider";

export type Insights = {
  as_of: string;
  kpis: {
    units: number; occupied: number; occupancy: number; vacant: number; vacancy_loss_month: number;
    active_contracts: number; mtd_collected: number; mtd_expected: number; ytd_collected: number;
    ytd_expenses: number; ytd_noi: number; collection_rate: number; overdue_amount: number; overdue_count: number;
    expiring_90: number; rent_at_risk: number; on_time_pct: number | null; avg_days_late: number; avg_rent: number;
    owners: number; buildings: number; top3_owner_share: number;
  };
  cashflow: { month: string; collected: number; expected: number; expenses: number; noi: number; rate: number | null }[];
  forecast: { month: string; scheduled: number }[];
  aging: { bucket: string; amount: number; count: number }[];
  ladder: { month: string; count: number; rent: number }[];
  buildings: { id: number; name: string; units: number; occupied: number; occupancy: number; collected_ytd: number; expenses_ytd: number; noi_ytd: number; overdue: number; asking_rent: number; vacancy_loss_month: number }[];
  concentration: { owner: string; amount: number; share: number }[];
  expense_mix: { category: string; amount: number }[];
  underpriced: { unit: string; rent: number; avg: number; gap_pct: number }[];
  alerts: { level: "high" | "medium" | "low"; kind: string; ref?: string; where?: string | null; amount?: number; days?: number; pct?: number; count?: number; baseline?: number; href: string }[];
};

const C = { maroon: "#7B1A1A", maroonLight: "#C25B4F", palm: "#2F5D50", palmLight: "#6FA593", sand: "#C9B28C", amber: "#D08A1E", red: "#C2410C", grey: "#9AA0A6" };

export function InsightsDashboard({ data, locale }: { data: Insights; locale: string }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const { theme } = useTheme();
  const dark = theme === "dark";
  const grid = dark ? "rgba(255,255,255,.07)" : "rgba(31,35,40,.07)";
  const axis = dark ? "rgba(255,255,255,.55)" : "rgba(31,35,40,.55)";
  const maroon = dark ? "#E58C80" : C.maroon;
  const k = data.kpis;

  const nf = useMemo(() => new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 }), [ar]);
  const cf = useMemo(() => new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { notation: "compact", maximumFractionDigits: 1 }), [ar]);
  const pf = (v: number | null | undefined) => (v == null ? "—" : `${new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 1 }).format(v)}%`);
  const sar = (v: number) => `${cf.format(v)} ${T("ر.س", "SAR")}`;
  const monthName = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return new Intl.DateTimeFormat(ar ? "ar-SA-u-ca-gregory" : "en-GB", { month: "short" }).format(new Date(y, mm - 1, 1)) + (mm === 1 ? ` ${String(y).slice(2)}` : "");
  };
  const tip = {
    contentStyle: { background: dark ? "#1E1B1A" : "#fff", border: `1px solid ${dark ? "#34302D" : "#E3DDD2"}`, borderRadius: 10, fontSize: 12.5, direction: (ar ? "rtl" : "ltr") as "rtl" | "ltr" },
    labelStyle: { fontWeight: 700, marginBottom: 4 },
    formatter: (v: number) => nf.format(v),
  };

  // ── Smart narrative: the 3–5 things worth knowing today ──
  const story: { tone: "good" | "warn" | "bad"; text: string }[] = [];
  if (k.collection_rate) story.push({ tone: k.collection_rate >= 95 ? "good" : k.collection_rate >= 85 ? "warn" : "bad", text: T(`نسبة التحصيل ${pf(k.collection_rate)} من المستحقات حتى اليوم${k.collection_rate < 95 ? "، أقل من مستهدف 95%" : ""}.`, `Collection rate is ${pf(k.collection_rate)} of everything due to date${k.collection_rate < 95 ? ", below a 95% target" : ""}.`) });
  if (k.overdue_amount > 0) story.push({ tone: "bad", text: T(`${nf.format(k.overdue_count)} دفعة متأخرة بقيمة ${sar(k.overdue_amount)}؛ ${pf(data.aging.find((a) => a.bucket === "90+") ? (100 * (data.aging.find((a) => a.bucket === "90+")!.amount)) / Math.max(1, k.overdue_amount) : 0)} منها متأخر أكثر من 90 يومًا.`, `${nf.format(k.overdue_count)} overdue instalments worth ${sar(k.overdue_amount)}; ${pf(data.aging.find((a) => a.bucket === "90+") ? (100 * (data.aging.find((a) => a.bucket === "90+")!.amount)) / Math.max(1, k.overdue_amount) : 0)} is more than 90 days late.`) });
  if (k.expiring_90 > 0) story.push({ tone: "warn", text: T(`${nf.format(k.expiring_90)} عقود تنتهي خلال 90 يومًا بإيجار سنوي ${sar(k.rent_at_risk)} — ابدأ التجديد الآن.`, `${nf.format(k.expiring_90)} leases end within 90 days (${sar(k.rent_at_risk)} annual rent) — start renewals now.`) });
  if (k.vacant > 0) story.push({ tone: k.occupancy >= 90 ? "good" : "warn", text: T(`الإشغال ${pf(k.occupancy)}: ${nf.format(k.vacant)} وحدة شاغرة تفوّت نحو ${sar(k.vacancy_loss_month)} شهريًا.`, `Occupancy ${pf(k.occupancy)}: ${nf.format(k.vacant)} vacant units forgo about ${sar(k.vacancy_loss_month)} a month.`) });
  if (k.top3_owner_share > 60) story.push({ tone: "warn", text: T(`أكبر 3 ملاك يمثلون ${pf(k.top3_owner_share)} من التحصيل هذا العام — تركّز مرتفع في الإيرادات.`, `The top 3 owners make up ${pf(k.top3_owner_share)} of collections this year — high revenue concentration.`) });
  if (k.on_time_pct != null) story.push({ tone: k.on_time_pct >= 80 ? "good" : "warn", text: T(`${pf(k.on_time_pct)} من الدفعات تُسدّد في موعدها، ومتوسط التأخير ${nf.format(k.avg_days_late)} يومًا.`, `${pf(k.on_time_pct)} of instalments are paid on time; late ones average ${nf.format(k.avg_days_late)} days.`) });

  const mtdPct = k.mtd_expected ? Math.min(100, (100 * k.mtd_collected) / k.mtd_expected) : 0;
  const cash = data.cashflow.map((m) => ({ ...m, label: monthName(m.month) }));
  const ladder = data.ladder.map((m) => ({ ...m, label: monthName(m.month) }));
  const forecast = data.forecast.map((m) => ({ ...m, label: monthName(m.month) }));
  const agingColors = [C.sand, C.amber, C.maroonLight, C.maroon];
  const expenseColors = [C.maroon, C.palm, C.sand, C.amber, C.grey, C.maroonLight, C.palmLight];
  const catName: Record<string, [string, string]> = { maintenance: ["صيانة", "Maintenance"], utilities: ["خدمات ومرافق", "Utilities"], cleaning: ["نظافة", "Cleaning"], security: ["حراسة وأمن", "Security"], other: ["أخرى", "Other"], insurance: ["تأمين", "Insurance"], management: ["إدارة", "Management"] };

  const [sortKey, setSortKey] = useState<"collected_ytd" | "occupancy" | "noi_ytd" | "overdue" | "vacancy_loss_month">("collected_ytd");
  const rows = [...data.buildings].sort((a, b) => (sortKey === "occupancy" ? a.occupancy - b.occupancy : b[sortKey] - a[sortKey]));
  const [alertFilter, setAlertFilter] = useState<"all" | "high">("all");
  const alerts = data.alerts.filter((a) => alertFilter === "all" || a.level === "high");

  const alertText = (a: Insights["alerts"][number]) => {
    switch (a.kind) {
      case "overdue": return T(`دفعة متأخرة ${a.days} يومًا — عقد ${a.ref}`, `Instalment ${a.days} days late — lease ${a.ref}`);
      case "expiring": return T(`عقد ${a.ref} ينتهي خلال ${a.days} يومًا${a.where ? ` (${a.where})` : ""}`, `Lease ${a.ref} ends in ${a.days} days${a.where ? ` (${a.where})` : ""}`);
      case "ejar": return T(`عقد ${a.ref} ساري وغير موثّق في إيجار`, `Active lease ${a.ref} is not registered on Ejar`);
      case "low_occupancy": return T(`إشغال ${a.ref} منخفض (${pf(a.pct)})`, `Low occupancy at ${a.ref} (${pf(a.pct)})`);
      case "owner_payout": return T(`${a.count} تحويلات للملاك مستحقة ولم تُنفّذ`, `${a.count} owner payouts are due and not yet sent`);
      case "mgmt_expiring": return T(`عقد إدارة ${a.ref} ينتهي خلال ${a.days} يومًا`, `Management contract ${a.ref} ends in ${a.days} days`);
      case "wo_approval": return T(`${a.count} طلبات صيانة بانتظار موافقة المالك (${sar(a.amount || 0)})`, `${a.count} work orders are waiting for owner approval (${sar(a.amount || 0)})`);
      case "wo_overdue": return T(`${a.count} طلبات صيانة تجاوزت مهلة الاستجابة`, `${a.count} work orders are past their response time`);
      case "rn_no_contact": return T(`${a.count} عقود تنتهي خلال 60 يومًا ولم يُتواصل مع مستأجريها`, `${a.count} leases end within 60 days and the tenant hasn't been contacted`);
      case "rn_owner": return T(`${a.count} عروض تجديد بانتظار موافقة المالك`, `${a.count} renewal offers are waiting for the owner`);
      case "broken_promise": return T(`${a.count} وعود سداد فات موعدها (${sar(a.amount || 0)})`, `${a.count} promises to pay were missed (${sar(a.amount || 0)})`);
      case "expense_spike": return T(`مصروفات هذا الشهر أعلى بكثير من المعتاد (المتوسط ${sar(a.baseline || 0)})`, `This month's expenses are well above normal (avg ${sar(a.baseline || 0)})`);
      default: return a.kind;
    }
  };
  const alertIcon: Record<string, string> = { overdue: "schedule", expiring: "event_busy", ejar: "gavel", low_occupancy: "domain_disabled", owner_payout: "account_balance", mgmt_expiring: "handshake", expense_spike: "trending_up", wo_approval: "gavel", wo_overdue: "timer_off", rn_no_contact: "phone_missed", rn_owner: "autorenew", broken_promise: "heart_broken" };

  return (
    <div className="bi">
      {/* ── Narrative ── */}
      {story.length > 0 && (
        <section className="bi-story" aria-label={T("أهم ما يجب معرفته اليوم", "What matters today")}>
          <h3>{T("أهم ما يجب معرفته اليوم", "What matters today")}</h3>
          <ul>
            {story.slice(0, 5).map((s, i) => (
              <li key={i} className={`is-${s.tone}`}>
                <span className="ms" aria-hidden>{s.tone === "good" ? "check_circle" : s.tone === "warn" ? "error" : "warning"}</span>
                {s.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── KPI band ── */}
      <section className="bi-kpis">
        <Kpi label={T("المحصّل هذا الشهر", "Collected this month")} value={sar(k.mtd_collected)} sub={T(`من ${sar(k.mtd_expected)} مستحق`, `of ${sar(k.mtd_expected)} due`)} bar={mtdPct} tone="maroon" />
        <Kpi label={T("نسبة التحصيل", "Collection rate")} value={pf(k.collection_rate)} sub={T("من المستحق حتى اليوم", "of everything due to date")} ring={k.collection_rate} tone={k.collection_rate >= 95 ? "good" : k.collection_rate >= 85 ? "warn" : "bad"} />
        <Kpi label={T("الإشغال", "Occupancy")} value={pf(k.occupancy)} sub={T(`${nf.format(k.occupied)} من ${nf.format(k.units)} وحدة`, `${nf.format(k.occupied)} of ${nf.format(k.units)} units`)} ring={k.occupancy} tone={k.occupancy >= 90 ? "good" : k.occupancy >= 75 ? "warn" : "bad"} />
        <Kpi label={T("المتأخرات", "Overdue")} value={sar(k.overdue_amount)} sub={T(`${nf.format(k.overdue_count)} دفعة`, `${nf.format(k.overdue_count)} instalments`)} tone={k.overdue_amount > 0 ? "bad" : "good"} href="payments" locale={locale} />
        <Kpi label={T("صافي الدخل هذا العام", "Net operating income YTD")} value={sar(k.ytd_noi)} sub={T(`تحصيل ${sar(k.ytd_collected)} − مصروفات ${sar(k.ytd_expenses)}`, `${sar(k.ytd_collected)} collected − ${sar(k.ytd_expenses)} costs`)} tone="good" />
        <Kpi label={T("إيجار معرّض للخطر (90 يومًا)", "Rent at risk (90 days)")} value={sar(k.rent_at_risk)} sub={T(`${nf.format(k.expiring_90)} عقود تنتهي قريبًا`, `${nf.format(k.expiring_90)} leases ending`)} tone={k.expiring_90 ? "warn" : "good"} href="contracts" locale={locale} />
      </section>

      {/* ── Cash flow + alerts ── */}
      <section className="bi-row bi-row--main">
        <Card title={T("التدفق النقدي — آخر 12 شهرًا", "Cash flow — last 12 months")} sub={T("المحصّل مقابل المستحق، والمصروفات، وصافي الدخل", "Collected vs due, expenses and net income")}>
          <div className="bi-legend">
            <span><i style={{ background: maroon }} />{T("المحصّل", "Collected")}</span>
            <span><i style={{ background: C.sand }} />{T("المستحق", "Due")}</span>
            <span><i style={{ background: C.grey }} />{T("المصروفات", "Expenses")}</span>
            <span><i className="line" style={{ background: C.palm }} />{T("صافي الدخل", "Net income")}</span>
          </div>
          <div className="bi-chart bi-chart--tall">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cash} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axis, fontSize: 11.5 }} axisLine={false} tickLine={false} reversed={ar} />
                <YAxis tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => cf.format(v)} width={44} orientation={ar ? "right" : "left"} />
                <Tooltip {...tip} />
                <Area type="monotone" dataKey="expenses" name={T("المصروفات", "Expenses")} fill={C.grey} fillOpacity={0.15} stroke={C.grey} strokeWidth={1} />
                <Bar dataKey="expected" name={T("المستحق", "Due")} fill={C.sand} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="collected" name={T("المحصّل", "Collected")} fill={maroon} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Line type="monotone" dataKey="noi" name={T("صافي الدخل", "Net income")} stroke={C.palm} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title={T("التنبيهات", "Alerts")}
          sub={T(`${nf.format(data.alerts.length)} تنبيه مرتّب حسب الأولوية`, `${nf.format(data.alerts.length)} alerts by priority`)}
          action={
            <div className="bi-seg">
              <button className={alertFilter === "all" ? "is-on" : ""} onClick={() => setAlertFilter("all")}>{T("الكل", "All")}</button>
              <button className={alertFilter === "high" ? "is-on" : ""} onClick={() => setAlertFilter("high")}>{T("عاجل", "Urgent")}</button>
            </div>
          }
        >
          <ul className="bi-alerts">
            {alerts.length === 0 && <li className="bi-empty">{T("لا توجد تنبيهات — كل شيء تحت السيطرة.", "No alerts — everything is on track.")}</li>}
            {alerts.slice(0, 14).map((a, i) => (
              <li key={i} className={`is-${a.level}`}>
                <Link href={`/${locale}/${a.href}`}>
                  <span className="ms bi-alert-ico" aria-hidden>{alertIcon[a.kind] ?? "notifications"}</span>
                  <span className="bi-alert-text">{alertText(a)}</span>
                  {a.amount ? <span className="bi-alert-amt">{sar(a.amount)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* ── Receivables, payment behaviour, forecast ── */}
      <section className="bi-row bi-row--3">
        <Card title={T("أعمار الديون", "Receivables aging")} sub={T("المبالغ المتأخرة حسب مدة التأخير", "Overdue amounts by days late")}>
          <div className="bi-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.aging} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="bucket" tick={{ fill: axis, fontSize: 11.5 }} axisLine={false} tickLine={false} tickFormatter={(b) => `${b} ${T("يوم", "d")}`} reversed={ar} />
                <YAxis tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => cf.format(v)} width={44} orientation={ar ? "right" : "left"} />
                <Tooltip {...tip} />
                <Bar dataKey="amount" name={T("المبلغ", "Amount")} radius={[6, 6, 0, 0]} maxBarSize={44}>
                  {data.aging.map((_, i) => <Cell key={i} fill={agingColors[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title={T("سلوك السداد", "Payment behaviour")} sub={T("الدفعات المسددة في موعدها مقابل المتأخرة", "Paid on time vs late")}>
          <div className="bi-donut">
            <div className="bi-chart bi-chart--donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[{ v: k.on_time_pct ?? 0 }, { v: 100 - (k.on_time_pct ?? 0) }]} dataKey="v" innerRadius="68%" outerRadius="92%" startAngle={90} endAngle={-270} stroke="none">
                    <Cell fill={C.palm} />
                    <Cell fill={dark ? "#3A3431" : "#EFE7DA"} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="bi-donut__c"><strong>{pf(k.on_time_pct)}</strong><small>{T("في الموعد", "on time")}</small></div>
            </div>
            <dl className="bi-facts">
              <div><dt>{T("متوسط التأخير", "Average delay")}</dt><dd>{nf.format(k.avg_days_late)} {T("يوم", "days")}</dd></div>
              <div><dt>{T("متوسط الإيجار الشهري للوحدة", "Average monthly unit rent")}</dt><dd>{sar(k.avg_rent)}</dd></div>
              <div><dt>{T("عقود سارية", "Active leases")}</dt><dd>{nf.format(k.active_contracts)}</dd></div>
            </dl>
          </div>
        </Card>

        <Card title={T("التحصيل المتوقع — 6 أشهر", "Expected collections — 6 months")} sub={T("دفعات مجدولة لم تُسدَّد بعد", "Scheduled instalments not yet paid")}>
          <div className="bi-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forecast} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axis, fontSize: 11.5 }} axisLine={false} tickLine={false} reversed={ar} />
                <YAxis tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => cf.format(v)} width={44} orientation={ar ? "right" : "left"} />
                <Tooltip {...tip} />
                <Bar dataKey="scheduled" name={T("مجدول", "Scheduled")} fill={C.palm} radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      {/* ── Lease expiry ladder + owner concentration + expense mix ── */}
      <section className="bi-row bi-row--3">
        <Card title={T("سلّم انتهاء العقود", "Lease expiry ladder")} sub={T("العقود المنتهية في كل شهر من الأشهر الـ12 القادمة", "Leases ending each month, next 12 months")}>
          <div className="bi-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ladder} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} reversed={ar} interval={1} />
                <YAxis allowDecimals={false} tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} width={28} orientation={ar ? "right" : "left"} />
                <Tooltip {...tip} />
                <Bar dataKey="count" name={T("عقود", "Leases")} radius={[5, 5, 0, 0]} maxBarSize={22}>
                  {ladder.map((_, i) => <Cell key={i} fill={i < 3 ? C.amber : C.sand} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title={T("تركّز الإيرادات حسب المالك", "Revenue by owner")} sub={T("حصة كل مالك من التحصيل هذا العام", "Share of this year's collections")}>
          <ul className="bi-bars">
            {data.concentration.length === 0 && <li className="bi-empty">{T("لا توجد تحصيلات هذا العام بعد.", "No collections this year yet.")}</li>}
            {data.concentration.map((o) => (
              <li key={o.owner}>
                <div className="bi-bars__row"><span>{o.owner}</span><strong>{pf(o.share)}</strong></div>
                <div className="bi-bars__track"><i style={{ width: `${o.share}%`, background: maroon }} /></div>
                <small>{sar(o.amount)}</small>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={T("توزيع المصروفات", "Expense mix")} sub={T("حسب الفئة هذا العام", "By category, this year")}>
          <div className="bi-donut">
            <div className="bi-chart bi-chart--donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.expense_mix} dataKey="amount" nameKey="category" innerRadius="58%" outerRadius="92%" paddingAngle={2} stroke="none">
                    {data.expense_mix.map((_, i) => <Cell key={i} fill={expenseColors[i % expenseColors.length]} />)}
                  </Pie>
                  <Tooltip {...tip} />
                </PieChart>
              </ResponsiveContainer>
              <div className="bi-donut__c"><strong>{cf.format(k.ytd_expenses)}</strong><small>{T("ر.س إجمالي", "SAR total")}</small></div>
            </div>
            <ul className="bi-keys">
              {data.expense_mix.slice(0, 6).map((e, i) => (
                <li key={e.category}><i style={{ background: expenseColors[i % expenseColors.length] }} />{catName[e.category] ? catName[e.category][ar ? 0 : 1] : e.category}<span>{sar(e.amount)}</span></li>
              ))}
            </ul>
          </div>
        </Card>
      </section>

      {/* ── Building league table ── */}
      <Card
        title={T("أداء المباني", "Building performance")}
        sub={T("مرتّبة حسب ما تختاره — هذا العام", "Ranked by your choice — this year")}
        action={
          <div className="bi-seg">
            {([
              ["collected_ytd", T("التحصيل", "Collected")],
              ["noi_ytd", T("صافي الدخل", "NOI")],
              ["occupancy", T("الأقل إشغالًا", "Lowest occupancy")],
              ["overdue", T("المتأخرات", "Overdue")],
              ["vacancy_loss_month", T("فاقد الشغور", "Vacancy loss")],
            ] as const).map(([key, label]) => (
              <button key={key} className={sortKey === key ? "is-on" : ""} onClick={() => setSortKey(key)}>{label}</button>
            ))}
          </div>
        }
      >
        <div className="tbl-wrap bi-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>{T("المبنى", "Building")}</th>
                <th>{T("الإشغال", "Occupancy")}</th>
                <th>{T("المحصّل", "Collected")}</th>
                <th>{T("المصروفات", "Expenses")}</th>
                <th>{T("صافي الدخل", "NOI")}</th>
                <th>{T("المتأخرات", "Overdue")}</th>
                <th>{T("فاقد الشغور / شهر", "Vacancy loss / mo")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.name}</strong><div className="text-sec" style={{ fontSize: 12 }}>{nf.format(b.occupied)} / {nf.format(b.units)} {T("وحدة", "units")}</div></td>
                  <td>
                    <div className="bi-occ">
                      <div className="bi-occ__track"><i style={{ width: `${b.occupancy}%`, background: b.occupancy >= 90 ? C.palm : b.occupancy >= 75 ? C.amber : C.red }} /></div>
                      <span>{pf(b.occupancy)}</span>
                    </div>
                  </td>
                  <td>{sar(b.collected_ytd)}</td>
                  <td>{sar(b.expenses_ytd)}</td>
                  <td style={{ color: b.noi_ytd >= 0 ? undefined : C.red, fontWeight: 600 }}>{sar(b.noi_ytd)}</td>
                  <td style={{ color: b.overdue ? C.red : undefined }}>{b.overdue ? sar(b.overdue) : "—"}</td>
                  <td>{b.vacancy_loss_month ? sar(b.vacancy_loss_month) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {data.underpriced.length > 0 && (
        <Card title={T("وحدات بأقل من سعر السوق في مبناها", "Units priced below their building")} sub={T("إيجارها أقل بـ20% أو أكثر من متوسط وحدات المبنى نفسه — فرص لرفع الإيجار عند التجديد", "Rent 20%+ below the building's average — candidates for an increase at renewal")}>
          <ul className="bi-under">
            {data.underpriced.map((u) => (
              <li key={u.unit}>
                <span className="bi-under__name">{u.unit}</span>
                <span>{sar(u.rent)}</span>
                <span className="text-sec">{T("متوسط المبنى", "Building avg")} {sar(u.avg)}</span>
                <span className="bi-under__gap">−{pf(u.gap_pct)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="bi-asof">{T("محسوبة من بيانات النظام بتاريخ", "Computed from system data as of")} {new Intl.DateTimeFormat(ar ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "long" }).format(new Date(data.as_of))}</p>
    </div>
  );
}

function Card({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bi-card">
      <header className="bi-card__h">
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, tone, bar, ring, href, locale }: { label: string; value: string; sub?: string; tone: "good" | "warn" | "bad" | "maroon"; bar?: number; ring?: number; href?: string; locale?: string }) {
  const body = (
    <>
      <div className="bi-kpi__top">
        <span className="bi-kpi__label">{label}</span>
        {ring != null && (
          <svg className="bi-ring" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="15.5" className="bi-ring__bg" />
            <circle cx="18" cy="18" r="15.5" className="bi-ring__fg" strokeDasharray={`${(Math.max(0, Math.min(100, ring)) * 97.4) / 100} 97.4`} />
          </svg>
        )}
      </div>
      <div className="bi-kpi__value">{value}</div>
      {bar != null && <div className="bi-kpi__bar"><i style={{ width: `${bar}%` }} /></div>}
      {sub && <div className="bi-kpi__sub">{sub}</div>}
    </>
  );
  return href && locale ? (
    <Link href={`/${locale}/${href}`} className={`bi-kpi is-${tone}`}>{body}</Link>
  ) : (
    <div className={`bi-kpi is-${tone}`}>{body}</div>
  );
}
