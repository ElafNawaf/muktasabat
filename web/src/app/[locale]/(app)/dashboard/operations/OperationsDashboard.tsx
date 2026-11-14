"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { BarList, C, Card, Kpi, Legend, PALETTE, SectionChips, Seg, useChart, useFmt, useToggleSet } from "../kit";

export type Operations = {
  as_of: string;
  months: number;
  maintenance: {
    open: number; emergency_open: number; overdue: number; awaiting_approval: number; avg_resolution_hours: number | null; median_resolution_hours: number | null;
    sla_met_pct: number | null; avg_rating: number | null; cost_ytd: number; cost_by_payer: { payer: string; amount: number }[];
    by_status: { status: string; count: number }[]; by_category: { category: string; count: number }[]; by_priority: { priority: string; count: number }[];
    series: { month: string; created: number; completed: number; cost: number }[]; hot_buildings: { id: number; name: string; count: number }[];
  };
  renewals: {
    open: number; rent_in_play: number; renewal_rate: number | null; avg_uplift_pct: number | null; follow_ups_due: number; ending_30: number;
    funnel: { stage: string; count: number; rent: number }[]; intent: { intent: string; count: number }[]; lost_reasons: { reason: string; count: number }[];
  };
  support: {
    active: number; unassigned: number; breached: number; avg_first_response_hours: number | null; avg_resolution_hours: number | null;
    by_category: { category: string; count: number }[]; by_status: { status: string; count: number }[]; series: { month: string; opened: number; resolved: number }[];
  };
  collections: { actions: number; by_kind: { kind: string; count: number }[]; promise_kept_pct: number | null; series: { month: string; actions: number; promises: number }[] };
};

const L: Record<string, [string, string]> = {
  // work orders
  new: ["جديد", "New"], assigned: ["مُسند", "Assigned"], awaiting_approval: ["بانتظار الموافقة", "Awaiting approval"], approved: ["معتمد", "Approved"], in_progress: ["قيد التنفيذ", "In progress"],
  plumbing: ["سباكة", "Plumbing"], electrical: ["كهرباء", "Electrical"], ac: ["تكييف", "A/C"], carpentry: ["نجارة", "Carpentry"], painting: ["دهان", "Painting"], cleaning: ["نظافة", "Cleaning"],
  pest: ["مكافحة حشرات", "Pest control"], appliances: ["أجهزة", "Appliances"], structural: ["إنشائي", "Structural"], elevator: ["مصاعد", "Elevator"], fire_safety: ["سلامة وحريق", "Fire safety"], other: ["أخرى", "Other"],
  emergency: ["طارئ", "Emergency"], high: ["عالية", "High"], normal: ["عادية", "Normal"], low: ["منخفضة", "Low"],
  owner: ["المالك", "Owner"], tenant: ["المستأجر", "Tenant"], company: ["الشركة", "Company"],
  // renewals
  due: ["مستحق", "Due"], contacted: ["تم التواصل", "Contacted"], offer_sent: ["أُرسل العرض", "Offer sent"], awaiting_owner: ["بانتظار المالك", "Awaiting owner"], agreed: ["متفق عليه", "Agreed"],
  renewed: ["جُدّد", "Renewed"], lost: ["لم يُجدَّد", "Lost"], unknown: ["غير معروف", "Unknown"], renew: ["سيجدد", "Will renew"], undecided: ["متردد", "Undecided"], leave: ["سيغادر", "Leaving"],
  price: ["السعر", "Price"], relocation: ["انتقال", "Relocation"], bought_home: ["اشترى منزلًا", "Bought a home"], dissatisfied: ["غير راضٍ", "Dissatisfied"], owner_ending: ["المالك أنهى العقد", "Owner ended it"],
  // support
  open: ["مفتوحة", "Open"], waiting_user: ["بانتظار المستخدم", "Waiting on user"], resolved: ["محلولة", "Resolved"], closed: ["مغلقة", "Closed"],
  technical: ["تقنية", "Technical"], account: ["الحساب", "Account"], billing: ["الفوترة", "Billing"], feature: ["اقتراح", "Feature"], question: ["استفسار", "Question"], bug: ["خلل", "Bug"],
  // collections
  call: ["اتصال", "Call"], no_answer: ["لم يرد", "No answer"], whatsapp: ["واتساب", "WhatsApp"], visit: ["زيارة", "Visit"], promise: ["وعد بالسداد", "Promise"], dispute: ["اعتراض", "Dispute"], escalate: ["تصعيد", "Escalated"], note: ["ملاحظة", "Note"],
};

export function OperationsDashboard({ data, locale }: { data: Operations; locale: string }) {
  const f = useFmt(locale);
  const { T, sar, pf, nf } = f;
  const ch = useChart(locale);
  const router = useRouter();
  const lb = (k: string) => L[k]?.[f.ar ? 0 : 1] ?? k;
  const hrs = (h: number | null) => (h == null ? "—" : h >= 48 ? T(`${nf(h / 24)} يوم`, `${nf(h / 24)} days`) : T(`${nf(h)} ساعة`, `${nf(h)} h`));
  const m = data.maintenance, r = data.renewals, s = data.support, c = data.collections;
  const [hidden, toggle] = useToggleSet();
  const [woBy, setWoBy] = useState<"category" | "building" | "priority">("category");
  const [hover, setHover] = useState<number | null>(null);

  const woSeries = m.series.map((x) => ({ ...x, label: f.month(x.month) }));
  const supSeries = s.series.map((x) => ({ ...x, label: f.month(x.month) }));
  const colSeries = c.series.map((x) => ({ ...x, label: f.month(x.month) }));
  const funnelMax = Math.max(1, ...r.funnel.map((x) => x.count));

  return (
    <div className="bi dash">
      <SectionChips locale={locale} items={[
        { id: "ops-maint", label: T("الصيانة", "Maintenance"), icon: "construction", badge: m.overdue || undefined },
        { id: "ops-renew", label: T("التجديد", "Renewals"), icon: "autorenew", badge: r.follow_ups_due || undefined },
        { id: "ops-support", label: T("الدعم الفني", "Support"), icon: "support_agent", badge: s.breached || undefined },
        { id: "ops-coll", label: T("متابعة التحصيل", "Collections"), icon: "call" },
      ]} />

      <section className="bi-kpis dash-kpis">
        <Kpi locale={locale} icon="construction" label={T("طلبات صيانة مفتوحة", "Open work orders")} value={m.open} fmt={nf} sub={T(`${m.emergency_open} طارئة · ${m.awaiting_approval} بانتظار الموافقة`, `${m.emergency_open} emergency · ${m.awaiting_approval} awaiting approval`)} tone={m.emergency_open ? "bad" : m.open ? "warn" : "good"} href="maintenance" />
        <Kpi locale={locale} icon="timer_off" label={T("تجاوزت المهلة", "Past due")} value={m.overdue} fmt={nf} sub={T("طلبات مفتوحة تجاوزت موعدها", "Open orders past their due time")} tone={m.overdue ? "bad" : "good"} href="maintenance" />
        <Kpi locale={locale} icon="verified" label={T("الالتزام بالمهلة", "Completed on time")} value={m.sla_met_pct} fmt={(v) => pf(v)} ring={m.sla_met_pct} sub={T(`متوسط الإنجاز ${hrs(m.avg_resolution_hours)}`, `Average fix time ${hrs(m.avg_resolution_hours)}`)} tone={m.sla_met_pct == null ? "maroon" : m.sla_met_pct >= 85 ? "good" : m.sla_met_pct >= 60 ? "warn" : "bad"} />
        <Kpi locale={locale} icon="autorenew" label={T("نسبة التجديد", "Renewal rate")} value={r.renewal_rate} fmt={(v) => pf(v)} ring={r.renewal_rate} sub={T(`متوسط الزيادة ${pf(r.avg_uplift_pct)}`, `Average uplift ${pf(r.avg_uplift_pct)}`)} tone={r.renewal_rate == null ? "maroon" : r.renewal_rate >= 75 ? "good" : r.renewal_rate >= 50 ? "warn" : "bad"} href="renewals" />
        <Kpi locale={locale} icon="event_upcoming" label={T("إيجار قيد التجديد", "Rent in renewal")} value={r.rent_in_play} fmt={sar} sub={T(`${r.open} عقد مفتوح · ${r.ending_30} ينتهي خلال 30 يومًا`, `${r.open} open · ${r.ending_30} end within 30 days`)} tone={r.ending_30 ? "warn" : "good"} href="renewals" />
        <Kpi locale={locale} icon="support_agent" label={T("تذاكر دعم نشطة", "Active support tickets")} value={s.active} fmt={nf} sub={T(`${s.breached} تجاوزت المهلة · ${s.unassigned} بلا مسؤول`, `${s.breached} past SLA · ${s.unassigned} unassigned`)} tone={s.breached ? "bad" : s.active ? "warn" : "good"} href="support" />
      </section>

      <section className="bi-row bi-row--main" id="ops-maint">
        <Card title={T("الصيانة شهريًا", "Maintenance by month")} sub={T("الطلبات الجديدة مقابل المنجزة، وتكلفة الإنجاز", "New vs completed orders, and cost of completed work")}>
          <Legend hidden={hidden} onToggle={toggle} items={[
            { key: "created", label: T("جديدة", "New"), color: C.sand },
            { key: "completed", label: T("منجزة", "Completed"), color: C.palm },
            { key: "cost", label: T("التكلفة", "Cost"), color: ch.maroon, line: true },
          ]} />
          <div className="bi-chart bi-chart--tall">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={woSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={ch.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: ch.axis, fontSize: 11.5 }} axisLine={false} tickLine={false} reversed={f.ar} />
                <YAxis yAxisId="n" allowDecimals={false} tick={{ fill: ch.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={30} orientation={f.ar ? "right" : "left"} />
                <YAxis yAxisId="c" tick={{ fill: ch.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => f.cf(v)} orientation={f.ar ? "left" : "right"} />
                <Tooltip {...ch.tip} formatter={(v: number) => nf(v)} />
                <Bar {...ch.anim} yAxisId="n" hide={hidden.has("created")} dataKey="created" name={T("جديدة", "New")} fill={C.sand} radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Bar {...ch.anim} animationBegin={120} yAxisId="n" hide={hidden.has("completed")} dataKey="completed" name={T("منجزة", "Completed")} fill={C.palm} radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Line {...ch.anim} animationBegin={300} yAxisId="c" hide={hidden.has("cost")} type="monotone" dataKey="cost" name={T("التكلفة", "Cost")} stroke={ch.maroon} strokeWidth={2.2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title={T("أين تتركز الأعطال؟", "Where the faults are")}
          sub={T("اضغط على أي سطر لفتح الصيانة", "Tap a row to open maintenance")}
          action={<Seg value={woBy} onChange={setWoBy} options={[["category", T("النوع", "Type")], ["building", T("المبنى", "Building")], ["priority", T("الأولوية", "Priority")]] as const} />}
        >
          <BarList locale={locale} rows={
            woBy === "category" ? m.by_category.map((x, i) => ({ key: x.category, label: lb(x.category), value: x.count, href: "maintenance", color: PALETTE[i % PALETTE.length] }))
              : woBy === "building" ? m.hot_buildings.map((x) => ({ key: String(x.id), label: x.name, value: x.count, href: `properties/${x.id}` }))
                : m.by_priority.map((x) => ({ key: x.priority, label: lb(x.priority), value: x.count, href: "maintenance", color: x.priority === "emergency" ? C.red : x.priority === "high" ? C.amber : C.sand }))
          } />
          <dl className="bi-facts">
            <div><dt>{T("تكلفة الصيانة هذا العام", "Maintenance cost YTD")}</dt><dd>{sar(m.cost_ytd)}</dd></div>
            {m.cost_by_payer.map((p) => <div key={p.payer}><dt>{T("على حساب", "Charged to")} {lb(p.payer)}</dt><dd>{sar(p.amount)}</dd></div>)}
            <div><dt>{T("متوسط تقييم المستأجرين", "Average tenant rating")}</dt><dd>{m.avg_rating == null ? "—" : `${m.avg_rating} / 5`}</dd></div>
          </dl>
        </Card>
      </section>

      <section className="bi-row bi-row--3" id="ops-renew">
        <Card title={T("قمع التجديد", "Renewal funnel")} sub={T("العقود في كل مرحلة والإيجار المرتبط بها — اضغط لفتح التجديدات", "Leases at each stage and their rent — tap to open renewals")} className="dash-span-2">
          <ul className="dash-funnel">
            {r.funnel.map((x, i) => (
              <li key={x.stage} onClick={() => router.push(`/${locale}/renewals`)} className={`is-${x.stage}`}>
                <span className="dash-funnel__label">{lb(x.stage)}</span>
                <span className="dash-funnel__bar"><i className="dash-grow" style={{ width: `${Math.max(4, (100 * x.count) / funnelMax)}%`, animationDelay: `${i * 80}ms`, background: x.stage === "lost" ? C.red : x.stage === "renewed" ? C.palm : PALETTE[i % 4] }} /></span>
                <strong>{nf(x.count)}</strong>
                <small>{sar(x.rent)}</small>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={T("نية المستأجرين وأسباب المغادرة", "Tenant intent & why they leave")}>
          <BarList locale={locale} color={C.palm} rows={r.intent.map((x) => ({ key: x.intent, label: lb(x.intent), value: x.count, color: x.intent === "leave" ? C.red : x.intent === "renew" ? C.palm : C.sand }))} />
          <h4 className="dash-subh">{T("أسباب عدم التجديد (12 شهرًا)", "Why leases weren't renewed (12 months)")}</h4>
          <BarList locale={locale} color={C.maroonLight} rows={r.lost_reasons.map((x) => ({ key: x.reason, label: lb(x.reason), value: x.count }))} empty={T("لا عقود مفقودة — ممتاز.", "No lost leases — great.")} />
        </Card>
      </section>

      <section className="bi-row bi-row--3" id="ops-support">
        <Card title={T("الدعم الفني شهريًا", "Support desk by month")} sub={T("تذاكر جديدة مقابل محلولة", "Opened vs resolved")} className="dash-span-2">
          <div className="bi-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={ch.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: ch.axis, fontSize: 11.5 }} axisLine={false} tickLine={false} reversed={f.ar} />
                <YAxis allowDecimals={false} tick={{ fill: ch.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={30} orientation={f.ar ? "right" : "left"} />
                <Tooltip {...ch.tip} />
                <Bar {...ch.anim} dataKey="opened" name={T("جديدة", "Opened")} fill={C.sand} radius={[4, 4, 0, 0]} maxBarSize={16} cursor="pointer" onClick={() => router.push(`/${locale}/support`)} />
                <Bar {...ch.anim} animationBegin={120} dataKey="resolved" name={T("محلولة", "Resolved")} fill={C.palm} radius={[4, 4, 0, 0]} maxBarSize={16} cursor="pointer" onClick={() => router.push(`/${locale}/support`)} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <dl className="bi-facts dash-facts-row">
            <div><dt>{T("متوسط أول رد", "Average first response")}</dt><dd>{hrs(s.avg_first_response_hours)}</dd></div>
            <div><dt>{T("متوسط الحل", "Average resolution")}</dt><dd>{hrs(s.avg_resolution_hours)}</dd></div>
          </dl>
        </Card>
        <Card title={T("التذاكر حسب النوع", "Tickets by type")} sub={T("مرّر على الدائرة للتفاصيل", "Hover the ring for detail")}>
          <div className="bi-donut">
            <div className="bi-chart bi-chart--donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie {...ch.anim} data={s.by_category} dataKey="count" nameKey="category" innerRadius="58%" outerRadius="92%" paddingAngle={2} stroke="none" onMouseEnter={(_, i) => setHover(i)} onMouseLeave={() => setHover(null)}>
                    {s.by_category.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} opacity={hover == null || hover === i ? 1 : 0.35} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="bi-donut__c"><strong>{nf(hover != null ? s.by_category[hover]?.count ?? 0 : s.by_category.reduce((n, x) => n + x.count, 0))}</strong><small>{hover != null ? lb(s.by_category[hover]?.category ?? "") : T("تذكرة", "tickets")}</small></div>
            </div>
            <ul className="bi-keys">
              {s.by_category.map((x, i) => <li key={x.category} className={hover === i ? "is-hot" : ""} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}><i style={{ background: PALETTE[i % PALETTE.length] }} />{lb(x.category)}<span>{nf(x.count)}</span></li>)}
            </ul>
          </div>
        </Card>
      </section>

      <section className="bi-row bi-row--3" id="ops-coll">
        <Card title={T("متابعة التحصيل", "Collection follow-up")} sub={T("ما يقوم به الفريق مع الدفعات المتأخرة", "What the team does about late instalments")} className="dash-span-2">
          <div className="bi-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={colSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={ch.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: ch.axis, fontSize: 11.5 }} axisLine={false} tickLine={false} reversed={f.ar} />
                <YAxis allowDecimals={false} tick={{ fill: ch.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={30} orientation={f.ar ? "right" : "left"} />
                <Tooltip {...ch.tip} />
                <Bar {...ch.anim} dataKey="actions" name={T("إجراءات متابعة", "Follow-ups")} fill={ch.maroon} radius={[4, 4, 0, 0]} maxBarSize={18} cursor="pointer" onClick={() => router.push(`/${locale}/collections`)} />
                <Bar {...ch.anim} animationBegin={120} dataKey="promises" name={T("وعود سداد", "Promises")} fill={C.amber} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title={T("نوع المتابعة", "Follow-up mix")} sub={T(`وعود السداد الملتزم بها: ${pf(c.promise_kept_pct)}`, `Promises kept: ${pf(c.promise_kept_pct)}`)}>
          <BarList locale={locale} rows={c.by_kind.map((x, i) => ({ key: x.kind, label: lb(x.kind), value: x.count, href: "collections", color: PALETTE[i % PALETTE.length] }))} empty={T("لم تُسجّل متابعات في الفترة.", "No follow-ups logged in this period.")} />
        </Card>
      </section>

      <p className="bi-asof">{T("محسوبة من بيانات النظام بتاريخ", "Computed from system data as of")} {f.date(data.as_of)}</p>
    </div>
  );
}
