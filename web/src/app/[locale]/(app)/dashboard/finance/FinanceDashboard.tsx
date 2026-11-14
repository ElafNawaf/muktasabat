"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { BarList, C, Card, Kpi, Legend, PALETTE, Seg, useChart, useFmt, useToggleSet } from "../kit";

export type Finance = {
  as_of: string;
  months: number;
  payroll_included: boolean;
  kpis: {
    gross_ytd: number; revenue_ytd: number; owner_share_ytd: number; pass_through_ytd: number;
    company_costs_ytd: number; owner_costs_ytd: number; payroll_ytd: number; net_profit_ytd: number;
    net_margin_ytd: number | null; take_rate_ytd: number | null; owner_payable: number; owner_payable_count: number;
    owner_payable_overdue: number; owner_payable_overdue_count: number; receipt_coverage: number | null;
    payments_without_receipt: number; revenue_mom: number | null; net_profit_mom: number | null;
  };
  series: { month: string; gross: number; revenue: number; owner_share: number; pass_through: number; company_costs: number; owner_costs: number; payroll: number; net_profit: number; margin: number | null; take_rate: number | null }[];
  forecast: { month: string; gross: number; revenue: number }[];
  waterfall: { key: string; amount: number; total?: boolean }[];
  by_building: { id: number; name: string; gross: number; revenue: number; take_rate: number | null }[];
  by_owner: { id: number; name: string; gross: number; revenue: number; take_rate: number | null }[];
  payroll_by_company: { company: string; monthly: number }[];
  cost_mix: { category: string; amount: number }[];
  method_mix: { method: string; amount: number; share: number | null }[];
};

const CAT: Record<string, [string, string]> = {
  maintenance: ["صيانة", "Maintenance"], utilities: ["مرافق", "Utilities"], cleaning: ["نظافة", "Cleaning"], security: ["أمن", "Security"],
  insurance: ["تأمين", "Insurance"], legal: ["قانوني", "Legal"], marketing: ["تسويق", "Marketing"], government_fees: ["رسوم حكومية", "Government fees"], other: ["أخرى", "Other"],
};
const METHOD: Record<string, [string, string]> = { bank_transfer: ["تحويل بنكي", "Bank transfer"], cash: ["نقدًا", "Cash"], cheque: ["شيك", "Cheque"], unknown: ["غير محدد", "Not recorded"] };

export function FinanceDashboard({ data, locale }: { data: Finance; locale: string }) {
  const f = useFmt(locale);
  const { T, sar, pf } = f;
  const ch = useChart(locale);
  const router = useRouter();
  const k = data.kpis;
  const [withPayroll, setWithPayroll] = useState(data.payroll_included);
  const [view, setView] = useState<"profit" | "flow">("profit");
  const [hidden, toggle] = useToggleSet();
  const [by, setBy] = useState<"building" | "owner">("building");
  const [hover, setHover] = useState<number | null>(null);

  // Net profit recomputed live when payroll is switched off.
  const series = useMemo(() => data.series.map((m) => {
    const net = m.revenue - m.company_costs - (withPayroll ? m.payroll : 0);
    return { ...m, label: f.month(m.month), net, margin: m.revenue ? (100 * net) / m.revenue : null };
  }), [data.series, withPayroll, f]);
  const net = k.revenue_ytd - k.company_costs_ytd - (withPayroll ? k.payroll_ytd : 0);
  const margin = k.revenue_ytd ? (100 * net) / k.revenue_ytd : null;

  // Waterfall: invisible base + visible step.
  const wfLabels: Record<string, [string, string]> = {
    gross: ["إجمالي المحصّل", "Rent collected"], owner_share: ["حصص الملاك", "Owners' share"], pass_through: ["رسوم إيجار والوسطاء", "Ejar & agent fees"],
    revenue: ["إيراد الشركة", "Company revenue"], company_costs: ["مصروفات الشركة", "Company costs"], payroll: ["الرواتب", "Payroll"], net_profit: ["صافي الربح", "Net profit"],
  };
  const wf = useMemo(() => {
    let run = 0;
    return data.waterfall
      .filter((w) => withPayroll || w.key !== "payroll")
      .map((w) => {
        const amount = w.key === "net_profit" ? net : w.amount;
        if (w.total || w.key === "gross") {
          run = amount;
          return { key: w.key, label: wfLabels[w.key][f.ar ? 0 : 1], base: Math.min(0, amount), value: Math.abs(amount), signed: amount, kind: amount >= 0 ? "total" : "neg" };
        }
        const start = run;
        run += amount;
        return { key: w.key, label: wfLabels[w.key][f.ar ? 0 : 1], base: Math.min(start, run), value: Math.abs(amount), signed: amount, kind: amount >= 0 ? "pos" : "neg" };
      });
  }, [data.waterfall, withPayroll, net, f.ar]); // eslint-disable-line react-hooks/exhaustive-deps

  const story: { tone: "good" | "warn" | "bad"; text: string }[] = [];
  story.push({ tone: "good", text: T(`من كل 100 ر.س تحصّلها، يبقى للشركة ${pf(k.take_rate_ytd)} كإيراد (أتعاب إدارة)، والباقي أموال الملاك ورسوم تمرّ عبرك.`, `Of every SAR 100 you collect, ${pf(k.take_rate_ytd)} is company revenue (management fees); the rest is owners' money and pass-through fees.`) });
  if (margin != null) story.push({ tone: margin >= 20 ? "good" : margin >= 0 ? "warn" : "bad", text: T(`هامش صافي الربح هذا العام ${pf(margin)}${withPayroll ? " بعد الرواتب" : " قبل الرواتب"}.`, `Net margin this year is ${pf(margin)}${withPayroll ? " after payroll" : " before payroll"}.`) });
  if (k.owner_payable_overdue > 0) story.push({ tone: "bad", text: T(`${k.owner_payable_overdue_count} حصص ملاك تأخر تحويلها (${sar(k.owner_payable_overdue)}) — هذه أموال الملاك وليست إيرادًا.`, `${k.owner_payable_overdue_count} owner payouts are late (${sar(k.owner_payable_overdue)}) — that money belongs to owners, it is not revenue.`) });
  if (k.receipt_coverage != null && k.receipt_coverage < 100) story.push({ tone: k.receipt_coverage >= 80 ? "warn" : "bad", text: T(`${k.payments_without_receipt} دفعة مسددة بلا إيصال مرفق (التغطية ${pf(k.receipt_coverage)}).`, `${k.payments_without_receipt} paid instalments have no receipt attached (${pf(k.receipt_coverage)} covered).`) });

  const breakdown = (by === "building" ? data.by_building : data.by_owner).map((r, i) => ({
    key: String(r.id), label: r.name, value: r.revenue, display: `${sar(r.revenue)} · ${pf(r.take_rate)}`,
    href: by === "building" ? `properties/${r.id}` : `owners`, color: PALETTE[i % PALETTE.length],
  }));
  const costTotal = data.cost_mix.reduce((n, c) => n + c.amount, 0);

  return (
    <div className="bi dash">
      <section className="bi-story">
        <h3>{T("الصورة المالية للشركة", "The company's financial picture")}</h3>
        <ul>
          {story.map((s, i) => (
            <li key={i} className={`is-${s.tone}`}><span className="ms" aria-hidden>{s.tone === "good" ? "check_circle" : s.tone === "warn" ? "error" : "warning"}</span>{s.text}</li>
          ))}
        </ul>
      </section>

      <div className="dash-toolbar">
        {data.payroll_included ? (
          <label className="dash-switch">
            <input type="checkbox" checked={withPayroll} onChange={(e) => setWithPayroll(e.target.checked)} />
            <span className="dash-switch__track" aria-hidden><i /></span>
            {T("احتساب الرواتب في صافي الربح", "Include payroll in net profit")}
          </label>
        ) : (
          <span className="text-sec" style={{ fontSize: 12.5 }}>{T("الرواتب غير ظاهرة لصلاحيتك — صافي الربح هنا قبل الرواتب.", "Payroll is hidden for your role — net profit here is before payroll.")}</span>
        )}
      </div>

      <section className="bi-kpis dash-kpis">
        <Kpi locale={locale} icon="account_balance_wallet" label={T("إجمالي المحصّل هذا العام", "Rent collected YTD")} value={k.gross_ytd} fmt={sar} sub={T("أموال تمر عبر الشركة (أغلبها للملاك)", "Money passing through (mostly owners')")} tone="maroon" href="payments" />
        <Kpi locale={locale} icon="paid" label={T("إيراد الشركة هذا العام", "Company revenue YTD")} value={k.revenue_ytd} fmt={sar} sub={T(`نسبة الاستقطاع ${pf(k.take_rate_ytd)}`, `Take rate ${pf(k.take_rate_ytd)}`)} delta={k.revenue_mom} tone="good" />
        <Kpi locale={locale} icon="savings" label={T("صافي الربح هذا العام", "Net profit YTD")} value={net} fmt={sar} sub={T(withPayroll ? "الإيراد − المصروفات − الرواتب" : "الإيراد − المصروفات", withPayroll ? "Revenue − costs − payroll" : "Revenue − costs")} delta={withPayroll ? k.net_profit_mom : null} tone={net >= 0 ? "good" : "bad"} />
        <Kpi locale={locale} icon="percent" label={T("هامش صافي الربح", "Net margin")} value={margin} fmt={(v) => pf(v)} ring={margin != null ? Math.max(0, margin) : null} sub={T("من إيراد الشركة", "of company revenue")} tone={margin == null ? "maroon" : margin >= 20 ? "good" : margin >= 0 ? "warn" : "bad"} />
        <Kpi locale={locale} icon="account_balance" label={T("مستحقات الملاك", "Owed to owners")} value={k.owner_payable} fmt={sar} sub={T(`${k.owner_payable_count} حصة لم تُحوّل · ${k.owner_payable_overdue_count} متأخرة`, `${k.owner_payable_count} not yet sent · ${k.owner_payable_overdue_count} late`)} tone={k.owner_payable_overdue ? "bad" : "warn"} href="payments" />
        <Kpi locale={locale} icon="receipt_long" label={T("تغطية الإيصالات", "Receipt coverage")} value={k.receipt_coverage} fmt={(v) => pf(v)} ring={k.receipt_coverage} sub={T(`${k.payments_without_receipt} دفعة بلا إيصال`, `${k.payments_without_receipt} payments without one`)} tone={k.receipt_coverage == null ? "maroon" : k.receipt_coverage >= 95 ? "good" : k.receipt_coverage >= 80 ? "warn" : "bad"} href="payments" />
      </section>

      <section className="bi-row bi-row--main">
        <Card
          title={view === "profit" ? T("الإيراد والتكاليف وصافي الربح", "Revenue, costs and net profit") : T("أين تذهب أموال التحصيل؟", "Where collected money goes")}
          sub={view === "profit" ? T("شهريًا — اضغط على المفتاح لإخفاء سلسلة", "Monthly — tap the legend to hide a series") : T("كل ريال محصّل مقسّم: الملاك، الشركة، الرسوم", "Every riyal collected, split: owners, company, fees")}
          action={<Seg value={view} onChange={setView} options={[["profit", T("الربحية", "Profit")], ["flow", T("توزيع التحصيل", "Money flow")]] as const} />}
        >
          {view === "profit" ? (
            <>
              <Legend hidden={hidden} onToggle={toggle} items={[
                { key: "revenue", label: T("إيراد الشركة", "Revenue"), color: ch.maroon },
                { key: "company_costs", label: T("مصروفات الشركة", "Company costs"), color: C.sand },
                ...(withPayroll && data.payroll_included ? [{ key: "payroll", label: T("الرواتب", "Payroll"), color: C.grey }] : []),
                { key: "net", label: T("صافي الربح", "Net profit"), color: C.palm, line: true },
              ]} />
              <div className="bi-chart bi-chart--tall">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke={ch.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: ch.axis, fontSize: 11.5 }} axisLine={false} tickLine={false} reversed={f.ar} />
                    <YAxis tick={{ fill: ch.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => f.cf(v)} width={48} orientation={f.ar ? "right" : "left"} />
                    <Tooltip {...ch.tip} formatter={(v: number) => f.nf(v)} />
                    <Bar {...ch.anim} hide={hidden.has("revenue")} dataKey="revenue" name={T("إيراد الشركة", "Revenue")} fill={ch.maroon} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar {...ch.anim} animationBegin={120} hide={hidden.has("company_costs")} dataKey="company_costs" stackId="c" name={T("مصروفات الشركة", "Company costs")} fill={C.sand} maxBarSize={18} />
                    {withPayroll && data.payroll_included && <Bar {...ch.anim} animationBegin={200} hide={hidden.has("payroll")} dataKey="payroll" stackId="c" name={T("الرواتب", "Payroll")} fill={C.grey} radius={[4, 4, 0, 0]} maxBarSize={18} />}
                    <Line {...ch.anim} animationBegin={350} hide={hidden.has("net")} type="monotone" dataKey="net" name={T("صافي الربح", "Net profit")} stroke={C.palm} strokeWidth={2.5} dot={{ r: 0 }} activeDot={{ r: 5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="bi-chart bi-chart--tall">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={ch.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: ch.axis, fontSize: 11.5 }} axisLine={false} tickLine={false} reversed={f.ar} />
                  <YAxis tick={{ fill: ch.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => f.cf(v)} width={48} orientation={f.ar ? "right" : "left"} />
                  <Tooltip {...ch.tip} formatter={(v: number) => f.nf(v)} />
                  <Bar {...ch.anim} dataKey="owner_share" stackId="g" name={T("حصص الملاك", "Owners' share")} fill={C.sand} maxBarSize={26} />
                  <Bar {...ch.anim} dataKey="pass_through" stackId="g" name={T("رسوم إيجار والوسطاء", "Ejar & agent fees")} fill={C.grey} maxBarSize={26} />
                  <Bar {...ch.anim} dataKey="revenue" stackId="g" name={T("إيراد الشركة", "Company revenue")} fill={ch.maroon} radius={[5, 5, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title={T("من التحصيل إلى صافي الربح", "From collections to net profit")} sub={T("هذا العام — كيف يصبح الإيجار المحصّل ربحًا", "This year — how collected rent becomes profit")}>
          <div className="bi-chart bi-chart--tall">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wf} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                <XAxis type="number" hide reversed={f.ar} />
                <YAxis type="category" dataKey="label" width={118} tick={{ fill: ch.axis, fontSize: 11.5 }} axisLine={false} tickLine={false} orientation={f.ar ? "right" : "left"} />
                <Tooltip {...ch.tip} formatter={(_v: number, _n: string, p: { payload?: { signed: number } }) => [f.nf(p.payload?.signed ?? 0), T("المبلغ", "Amount")]} />
                <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
                <Bar {...ch.anim} dataKey="value" stackId="w" radius={[4, 4, 4, 4]} maxBarSize={22}>
                  {wf.map((w) => <Cell key={w.key} fill={w.kind === "total" ? ch.maroon : w.kind === "pos" ? C.palm : C.sand} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section className="bi-row bi-row--3">
        <Card
          title={T("من أين يأتي الإيراد؟", "Where revenue comes from")}
          sub={T("إيراد الشركة ونسبة الاستقطاع — آخر الفترة", "Company revenue and take rate — this period")}
          action={<Seg value={by} onChange={setBy} options={[["building", T("المباني", "Buildings")], ["owner", T("الملاك", "Owners")]] as const} />}
        >
          <BarList rows={breakdown} locale={locale} />
        </Card>

        <Card title={T("مصروفات الشركة", "Company costs")} sub={T("حسب الفئة — مرّر على الدائرة للتفاصيل", "By category — hover the ring for detail")}>
          <div className="bi-donut">
            <div className="bi-chart bi-chart--donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie {...ch.anim} data={data.cost_mix} dataKey="amount" nameKey="category" innerRadius="58%" outerRadius="92%" paddingAngle={2} stroke="none"
                    onMouseEnter={(_, i) => setHover(i)} onMouseLeave={() => setHover(null)}>
                    {data.cost_mix.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} opacity={hover == null || hover === i ? 1 : 0.35} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="bi-donut__c">
                <strong>{f.cf(hover != null ? data.cost_mix[hover]?.amount ?? 0 : costTotal)}</strong>
                <small>{hover != null ? (CAT[data.cost_mix[hover]?.category]?.[f.ar ? 0 : 1] ?? data.cost_mix[hover]?.category) : T("ر.س إجمالي", "SAR total")}</small>
              </div>
            </div>
            <ul className="bi-keys">
              {data.cost_mix.length === 0 && <li className="text-sec">{T("لا مصروفات على الشركة في الفترة.", "No company costs in this period.")}</li>}
              {data.cost_mix.slice(0, 7).map((c, i) => (
                <li key={c.category} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={hover === i ? "is-hot" : ""}>
                  <i style={{ background: PALETTE[i % PALETTE.length] }} />{CAT[c.category]?.[f.ar ? 0 : 1] ?? c.category}<span>{sar(c.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title={T("الإيراد المتوقع — 6 أشهر", "Expected revenue — 6 months")} sub={T("أتعاب الإدارة من دفعات لم تُسدد بعد", "Management fees on instalments not yet paid")}>
          <div className="bi-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.forecast.map((m) => ({ ...m, label: f.month(m.month) }))} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={ch.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: ch.axis, fontSize: 11.5 }} axisLine={false} tickLine={false} reversed={f.ar} />
                <YAxis tick={{ fill: ch.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => f.cf(v)} width={44} orientation={f.ar ? "right" : "left"} />
                <Tooltip {...ch.tip} formatter={(v: number) => f.nf(v)} />
                <Bar {...ch.anim} dataKey="revenue" name={T("إيراد متوقع", "Expected revenue")} fill={C.palm} radius={[6, 6, 0, 0]} maxBarSize={34} cursor="pointer" onClick={() => router.push(`/${locale}/payments`)} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <dl className="bi-facts">
            <div><dt>{T("إجمالي الدفعات المجدولة", "Scheduled rent")}</dt><dd>{sar(data.forecast.reduce((n, m) => n + m.gross, 0))}</dd></div>
            <div><dt>{T("منها إيراد للشركة", "Of which company revenue")}</dt><dd>{sar(data.forecast.reduce((n, m) => n + m.revenue, 0))}</dd></div>
          </dl>
        </Card>
      </section>

      <section className="bi-row bi-row--3">
        <Card title={T("الهامش ونسبة الاستقطاع شهريًا", "Margin & take rate by month")} sub={T("هل تتحسن ربحية كل ريال؟", "Is every riyal getting more profitable?")}>
          <div className="bi-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={ch.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: ch.axis, fontSize: 11 }} axisLine={false} tickLine={false} reversed={f.ar} />
                <YAxis tick={{ fill: ch.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v)}%`} width={40} orientation={f.ar ? "right" : "left"} />
                <Tooltip {...ch.tip} formatter={(v: number) => pf(v)} />
                <Area {...ch.anim} type="monotone" dataKey="take_rate" name={T("نسبة الاستقطاع", "Take rate")} stroke={C.sand} fill={C.sand} fillOpacity={0.2} />
                <Line {...ch.anim} type="monotone" dataKey="margin" name={T("الهامش", "Margin")} stroke={ch.maroon} strokeWidth={2.2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title={T("طرق الدفع", "Payment methods")} sub={T("كيف يدفع المستأجرون (حسب المبلغ)", "How tenants pay (by amount)")}>
          <BarList locale={locale} color={C.palm} rows={data.method_mix.map((m) => ({ key: m.method, label: METHOD[m.method]?.[f.ar ? 0 : 1] ?? m.method, value: m.amount, display: `${pf(m.share)} · ${sar(m.amount)}` }))} />
        </Card>

        {data.payroll_included ? (
          <Card title={T("الرواتب الشهرية حسب الشركة", "Monthly payroll by company")} sub={T("من عقود العمل السارية في المجموعة", "From active employment contracts across the group")}>
            <BarList locale={locale} color={C.grey} rows={data.payroll_by_company.map((p) => ({ key: p.company, label: p.company, value: p.monthly, display: sar(p.monthly), href: "dashboard/people" }))} empty={T("لا توجد عقود عمل مقبولة بعد.", "No accepted employment contracts yet.")} />
          </Card>
        ) : (
          <Card title={T("ما يخص الملاك هذا العام", "Owners' side this year")}>
            <dl className="bi-facts">
              <div><dt>{T("حصص الملاك", "Owners' share")}</dt><dd>{sar(k.owner_share_ytd)}</dd></div>
              <div><dt>{T("مصروفات على الملاك", "Costs charged to owners")}</dt><dd>{sar(k.owner_costs_ytd)}</dd></div>
              <div><dt>{T("رسوم إيجار والوسطاء", "Ejar & agent fees")}</dt><dd>{sar(k.pass_through_ytd)}</dd></div>
            </dl>
          </Card>
        )}
      </section>

      <p className="bi-asof">{T("التحصيل على أساس تاريخ السداد. الإيراد = أتعاب الإدارة. حصص الملاك ورسوم إيجار والوسطاء أموال تمر عبر الشركة وليست إيرادًا.", "Collections are counted on the paid date. Revenue = management fees. Owners' shares, Ejar and agent fees pass through the company and are not revenue.")}</p>
    </div>
  );
}
