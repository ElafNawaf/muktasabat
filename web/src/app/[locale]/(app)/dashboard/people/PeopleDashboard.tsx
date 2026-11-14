"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { BarList, C, Card, Kpi, Legend, PALETTE, Seg, useChart, useFmt, useToggleSet } from "../kit";

export type People = {
  as_of: string;
  kpis: {
    headcount: number; companies: number; present_today: number | null; late_today: number | null; on_leave_today: number;
    attendance_rate_30d: number | null; punctuality_30d: number | null; avg_check_in: string | null; pending_requests: number;
    leave_days_ytd: number; permission_minutes_month: number; tickets_cost_ytd: number; avg_tenure_years: number | null;
    without_contract: number; expiring_90: number; assets_assigned: number; assets_value: number; assets_unacknowledged: number;
  };
  by_company: { name: string; count: number }[];
  by_department: { name: string; count: number }[];
  by_work_mode: { mode: string; count: number }[];
  by_status: { status: string; count: number }[];
  by_nationality: { name: string; count: number }[];
  hires: { month: string; count: number }[];
  attendance: { day: string; present: number; late: number; on_leave: number; absent: number }[];
  tracking_from: string | null;
  late_leaders: { name: string; count: number }[];
  leave_by_type: { type: string; days: number }[];
  requests_series: { month: string; leave: number; permission: number; ticket: number; work_location: number }[];
  pending_by_kind: { kind: string; count: number }[];
  upcoming_leave: { name: string; start: string; end: string | null; days: number | null; type: string | null }[];
  expiries: { user_id: number; name: string; kind: "id" | "passport" | "contract" | "probation"; date: string; days: number }[];
  assets_by_status: { status: string; count: number }[];
  assets_by_kind: { kind: string; count: number }[];
  pay: { monthly_total: number; annual_total: number; avg_package: number | null; by_company: { company: string; amount: number }[] } | null;
};

const L: Record<string, [string, string]> = {
  office: ["مكتبي", "Office"], hybrid: ["مرن", "Hybrid"], remote: ["عن بُعد", "Remote"],
  active: ["على رأس العمل", "Active"], probation: ["فترة تجربة", "Probation"],
  annual: ["سنوية", "Annual"], sick: ["مرضية", "Sick"], emergency: ["اضطرارية", "Emergency"], unpaid: ["بدون راتب", "Unpaid"], hajj: ["حج", "Hajj"], marriage: ["زواج", "Marriage"],
  bereavement: ["وفاة", "Bereavement"], maternity: ["أمومة", "Maternity"], paternity: ["أبوة", "Paternity"], exam: ["اختبارات", "Exam"], other: ["أخرى", "Other"],
  leave: ["إجازة", "Leave"], permission: ["استئذان", "Permission"], ticket: ["تذكرة", "Ticket"], work_location: ["موقع عمل", "Work location"],
  id: ["الهوية / الإقامة", "ID / Iqama"], passport: ["الجواز", "Passport"], contract: ["عقد العمل", "Employment contract"],
  in_stock: ["في المخزن", "In stock"], assigned: ["مسلّمة", "Assigned"], maintenance: ["في الصيانة", "In maintenance"], lost: ["مفقودة", "Lost"], retired: ["مستبعدة", "Retired"],
  laptop: ["حاسب محمول", "Laptop"], desktop: ["حاسب مكتبي", "Desktop"], phone: ["جوال", "Phone"], tablet: ["جهاز لوحي", "Tablet"], car: ["سيارة", "Car"], sim: ["شريحة", "SIM"],
  cash: ["عهدة نقدية", "Cash"], card: ["بطاقة", "Card"], keys: ["مفاتيح", "Keys"], uniform: ["زي", "Uniform"], tools: ["أدوات", "Tools"],
};

export function PeopleDashboard({ data, locale }: { data: People; locale: string }) {
  const f = useFmt(locale);
  const { T, sar, pf, nf } = f;
  const ch = useChart(locale);
  const lb = (k: string) => L[k]?.[f.ar ? 0 : 1] ?? k;
  const k = data.kpis;
  const [hidden, toggle] = useToggleSet();
  const [split, setSplit] = useState<"company" | "department" | "mode" | "nationality">("company");
  const [exp, setExp] = useState<"all" | People["expiries"][number]["kind"]>("all");
  const [hover, setHover] = useState<number | null>(null);

  const att = data.attendance.map((d) => ({ ...d, label: f.day(d.day), ontime: d.present - d.late }));
  const reqs = data.requests_series.map((m) => ({ ...m, label: f.month(m.month) }));
  const splitRows = useMemo(() => {
    const src = split === "company" ? data.by_company : split === "department" ? data.by_department : split === "mode" ? data.by_work_mode.map((x) => ({ name: lb(x.mode), count: x.count })) : data.by_nationality;
    return src.map((x) => ({ name: x.name, count: x.count }));
  }, [split, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const expiries = data.expiries.filter((e) => exp === "all" || e.kind === exp);

  return (
    <div className="bi dash">
      <section className="bi-kpis dash-kpis">
        <Kpi locale={locale} icon="groups" label={T("عدد الموظفين", "Headcount")} value={k.headcount} fmt={nf} sub={T(`في ${k.companies} شركة · متوسط الخدمة ${k.avg_tenure_years ?? "—"} سنة`, `Across ${k.companies} companies · avg tenure ${k.avg_tenure_years ?? "—"} yrs`)} tone="maroon" href="hr/people" />
        <Kpi locale={locale} icon="how_to_reg" label={T("الحضور اليوم", "Present today")} value={k.present_today} fmt={nf} sub={k.present_today == null ? T("ليس يوم عمل", "Not a working day") : T(`${k.late_today} متأخر · ${k.on_leave_today} في إجازة`, `${k.late_today} late · ${k.on_leave_today} on leave`)} tone={k.late_today ? "warn" : "good"} href="hr/attendance" />
        <Kpi locale={locale} icon="event_available" label={T("نسبة الحضور (30 يومًا)", "Attendance (30 days)")} value={k.attendance_rate_30d} fmt={(v) => pf(v)} ring={k.attendance_rate_30d} sub={T(`الانضباط ${pf(k.punctuality_30d)} · متوسط الحضور ${k.avg_check_in ?? "—"}`, `Punctuality ${pf(k.punctuality_30d)} · avg check-in ${k.avg_check_in ?? "—"}`)} tone={k.attendance_rate_30d == null ? "maroon" : k.attendance_rate_30d >= 95 ? "good" : k.attendance_rate_30d >= 85 ? "warn" : "bad"} href="hr/attendance" />
        <Kpi locale={locale} icon="pending_actions" label={T("طلبات بانتظار الاعتماد", "Requests awaiting approval")} value={k.pending_requests} fmt={nf} sub={T(`${nf(k.leave_days_ytd)} يوم إجازة هذا العام`, `${nf(k.leave_days_ytd)} leave days this year`)} tone={k.pending_requests ? "warn" : "good"} href="hr" />
        <Kpi locale={locale} icon="badge" label={T("وثائق وعقود تنتهي (90 يومًا)", "Documents & contracts ending (90 d)")} value={k.expiring_90} fmt={nf} sub={T(`${k.without_contract} موظف بلا عقد عمل مقبول`, `${k.without_contract} staff without an accepted contract`)} tone={k.expiring_90 || k.without_contract ? "bad" : "good"} href="hr/people" />
        {data.pay ? (
          <Kpi locale={locale} icon="payments" label={T("الرواتب الشهرية", "Monthly payroll")} value={data.pay.monthly_total} fmt={sar} sub={T(`سنويًا ${sar(data.pay.annual_total)} · متوسط ${data.pay.avg_package ? sar(data.pay.avg_package) : "—"}`, `${sar(data.pay.annual_total)} a year · avg ${data.pay.avg_package ? sar(data.pay.avg_package) : "—"}`)} tone="maroon" />
        ) : (
          <Kpi locale={locale} icon="devices" label={T("عُهد مسلّمة", "Assets assigned")} value={k.assets_assigned} fmt={nf} sub={T(`بقيمة ${sar(k.assets_value)} · ${k.assets_unacknowledged} دون إقرار`, `Worth ${sar(k.assets_value)} · ${k.assets_unacknowledged} not acknowledged`)} tone={k.assets_unacknowledged ? "warn" : "good"} href="hr/people" />
        )}
      </section>

      <section className="bi-row bi-row--main">
        <Card title={T("الحضور اليومي — آخر 30 يومًا", "Daily attendance — last 30 days")} sub={T("أيام العمل فقط — اضغط على المفتاح لإخفاء فئة", "Working days only — tap the legend to hide a group")}>
          <Legend hidden={hidden} onToggle={toggle} items={[
            { key: "ontime", label: T("في الموعد", "On time"), color: C.palm },
            { key: "late", label: T("متأخر", "Late"), color: C.amber },
            { key: "on_leave", label: T("إجازة", "On leave"), color: C.sky },
            { key: "absent", label: T("غائب", "Absent"), color: C.red },
          ]} />
          {att.length < 2 ? (
            <div className="dash-empty">
              <span className="ms" aria-hidden>insights</span>
              <p>{data.tracking_from ? T(`بدأ احتساب الحضور في ${f.date(data.tracking_from)}. يمتلئ الرسم يومًا بعد يوم.`, `Attendance tracking started on ${f.date(data.tracking_from)}. The chart fills in day by day.`) : T("لا توجد أيام عمل مسجلة بعد.", "No working days recorded yet.")}</p>
              {att[0] && <strong>{T(`اليوم: ${att[0].present} حاضر · ${att[0].late} متأخر · ${att[0].absent} غائب`, `Today: ${att[0].present} present · ${att[0].late} late · ${att[0].absent} absent`)}</strong>}
            </div>
          ) : (
          <div className="bi-chart bi-chart--tall">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={att} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={ch.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: ch.axis, fontSize: 11 }} axisLine={false} tickLine={false} reversed={f.ar} interval="preserveStartEnd" minTickGap={18} />
                <YAxis allowDecimals={false} tick={{ fill: ch.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={28} orientation={f.ar ? "right" : "left"} />
                <Tooltip {...ch.tip} />
                <Area {...ch.anim} hide={hidden.has("ontime")} type="monotone" dataKey="ontime" stackId="a" name={T("في الموعد", "On time")} stroke={C.palm} fill={C.palm} fillOpacity={0.55} />
                <Area {...ch.anim} hide={hidden.has("late")} type="monotone" dataKey="late" stackId="a" name={T("متأخر", "Late")} stroke={C.amber} fill={C.amber} fillOpacity={0.6} />
                <Area {...ch.anim} hide={hidden.has("on_leave")} type="monotone" dataKey="on_leave" stackId="a" name={T("إجازة", "On leave")} stroke={C.sky} fill={C.sky} fillOpacity={0.45} />
                <Area {...ch.anim} hide={hidden.has("absent")} type="monotone" dataKey="absent" stackId="a" name={T("غائب", "Absent")} stroke={C.red} fill={C.red} fillOpacity={0.35} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )}
        </Card>

        <Card
          title={T("توزيع القوى العاملة", "Workforce split")}
          sub={T("مرّر على الدائرة للتفاصيل", "Hover the ring for detail")}
          action={<Seg value={split} onChange={(v) => { setSplit(v); setHover(null); }} options={[["company", T("الشركة", "Company")], ["department", T("الإدارة", "Dept")], ["mode", T("النمط", "Mode")], ["nationality", T("الجنسية", "Nationality")]] as const} />}
        >
          <div className="bi-donut">
            <div className="bi-chart bi-chart--donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie key={split} {...ch.anim} data={splitRows} dataKey="count" nameKey="name" innerRadius="58%" outerRadius="92%" paddingAngle={2} stroke="none" onMouseEnter={(_, i) => setHover(i)} onMouseLeave={() => setHover(null)}>
                    {splitRows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} opacity={hover == null || hover === i ? 1 : 0.35} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="bi-donut__c"><strong>{nf(hover != null ? splitRows[hover]?.count ?? 0 : k.headcount)}</strong><small>{hover != null ? splitRows[hover]?.name : T("موظف", "staff")}</small></div>
            </div>
            <ul className="bi-keys">
              {splitRows.slice(0, 7).map((x, i) => <li key={x.name} className={hover === i ? "is-hot" : ""} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}><i style={{ background: PALETTE[i % PALETTE.length] }} />{x.name}<span>{nf(x.count)}</span></li>)}
            </ul>
          </div>
        </Card>
      </section>

      <section className="bi-row bi-row--3">
        <Card title={T("الطلبات شهريًا", "Requests by month")} sub={T("إجازات واستئذانات وتذاكر ومواقع عمل", "Leave, permissions, tickets and work-location requests")} className="dash-span-2">
          <div className="bi-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reqs} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={ch.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: ch.axis, fontSize: 11.5 }} axisLine={false} tickLine={false} reversed={f.ar} />
                <YAxis allowDecimals={false} tick={{ fill: ch.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={28} orientation={f.ar ? "right" : "left"} />
                <Tooltip {...ch.tip} />
                <Bar {...ch.anim} dataKey="leave" stackId="r" name={lb("leave")} fill={ch.maroon} maxBarSize={22} />
                <Bar {...ch.anim} dataKey="permission" stackId="r" name={lb("permission")} fill={C.sand} maxBarSize={22} />
                <Bar {...ch.anim} dataKey="ticket" stackId="r" name={lb("ticket")} fill={C.palm} maxBarSize={22} />
                <Bar {...ch.anim} dataKey="work_location" stackId="r" name={lb("work_location")} fill={C.sky} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title={T("أيام الإجازات هذا العام", "Leave days this year")} sub={T("المعتمدة حسب النوع", "Approved, by type")}>
          <BarList locale={locale} rows={data.leave_by_type.map((x, i) => ({ key: x.type, label: lb(x.type), value: x.days, display: T(`${nf(x.days)} يوم`, `${nf(x.days)} d`), color: PALETTE[i % PALETTE.length] }))} empty={T("لا إجازات معتمدة هذا العام.", "No approved leave this year.")} />
          <dl className="bi-facts">
            <div><dt>{T("استئذانات هذا الشهر", "Permissions this month")}</dt><dd>{T(`${nf(k.permission_minutes_month)} دقيقة`, `${nf(k.permission_minutes_month)} min`)}</dd></div>
            <div><dt>{T("تكلفة التذاكر هذا العام", "Ticket cost this year")}</dt><dd>{sar(k.tickets_cost_ytd)}</dd></div>
          </dl>
        </Card>
      </section>

      <section className="bi-row bi-row--3">
        <Card
          title={T("ما يحتاج انتباهًا", "Needs attention")}
          sub={T("وثائق وعقود تنتهي خلال 90 يومًا", "Documents and contracts ending within 90 days")}
          action={<Seg value={exp} onChange={setExp} options={[["all", T("الكل", "All")], ["id", T("هوية", "ID")], ["passport", T("جواز", "Passport")], ["contract", T("عقد", "Contract")], ["probation", T("تجربة", "Probation")]] as const} />}
        >
          <ul className="dash-list">
            {expiries.length === 0 && <li className="bi-empty">{T("لا شيء ينتهي قريبًا.", "Nothing is ending soon.")}</li>}
            {expiries.map((e, i) => (
              <li key={`${e.user_id}-${e.kind}-${i}`} className={e.days < 0 ? "is-bad" : e.days <= 30 ? "is-warn" : ""}>
                <span className="ms ms-sm" aria-hidden>{e.kind === "passport" ? "travel" : e.kind === "id" ? "badge" : e.kind === "probation" ? "hourglass_bottom" : "contract"}</span>
                <span className="dash-list__main"><strong>{e.name}</strong><small>{lb(e.kind)}</small></span>
                <span className="dash-list__end">{e.days < 0 ? T(`انتهى منذ ${-e.days} يوم`, `${-e.days} d ago`) : T(`بعد ${e.days} يوم`, `in ${e.days} d`)}<small>{f.date(e.date)}</small></span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={T("الإجازات القادمة (30 يومًا)", "Upcoming leave (30 days)")} sub={T("خطط للتغطية مسبقًا", "Plan cover ahead")}>
          <ul className="dash-list">
            {data.upcoming_leave.length === 0 && <li className="bi-empty">{T("لا إجازات معتمدة قادمة.", "No approved leave coming up.")}</li>}
            {data.upcoming_leave.map((l, i) => (
              <li key={i}>
                <span className="ms ms-sm" aria-hidden>beach_access</span>
                <span className="dash-list__main"><strong>{l.name}</strong><small>{lb(l.type ?? "annual")} · {l.days ?? "—"} {T("يوم", "d")}</small></span>
                <span className="dash-list__end">{f.day(l.start)}{l.end ? ` → ${f.day(l.end)}` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={T("الأكثر تأخرًا (30 يومًا)", "Most late arrivals (30 days)")} sub={T("مرات التأخر بعد مهلة السماح", "Times late after the grace period")}>
          <BarList locale={locale} color={C.amber} rows={data.late_leaders.map((x) => ({ key: x.name, label: x.name, value: x.count, href: "hr/attendance" }))} empty={T("لا تأخر — ممتاز.", "No late arrivals — great.")} />
          <h4 className="dash-subh">{T("العُهد حسب الحالة", "Assets by status")}</h4>
          <BarList locale={locale} color={C.palm} rows={data.assets_by_status.map((x) => ({ key: x.status, label: lb(x.status), value: x.count, color: x.status === "lost" ? C.red : undefined }))} empty={T("لا عُهد مسجلة.", "No assets recorded.")} />
        </Card>
      </section>

      {data.pay && (
        <section className="bi-row bi-row--3">
          <Card title={T("الرواتب حسب الشركة", "Payroll by company")} sub={T("شهريًا من عقود العمل السارية", "Monthly, from active employment contracts")} className="dash-span-2">
            <BarList locale={locale} rows={data.pay.by_company.map((x, i) => ({ key: x.company, label: x.company, value: x.amount, display: sar(x.amount), color: PALETTE[i % PALETTE.length] }))} />
          </Card>
          <Card title={T("التوظيف — 12 شهرًا", "Hiring — 12 months")}>
            <div className="bi-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.hires.map((h) => ({ ...h, label: f.month(h.month) }))} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fill: ch.axis, fontSize: 10.5 }} axisLine={false} tickLine={false} reversed={f.ar} interval={1} />
                  <YAxis allowDecimals={false} hide />
                  <Tooltip {...ch.tip} />
                  <Bar {...ch.anim} dataKey="count" name={T("تعيينات", "Hires")} fill={C.palm} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>
      )}

      <p className="bi-asof">{T("محسوبة من بيانات النظام بتاريخ", "Computed from system data as of")} {f.date(data.as_of)}</p>
    </div>
  );
}
