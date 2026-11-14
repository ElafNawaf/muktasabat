"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { hrLive, hrSendMonthly, hrStats } from "@/lib/hr-actions";
import { HR, hl, mins } from "@/lib/hr-labels";

type LiveStatus = "in_office" | "away" | "remote" | "field" | "not_yet" | "absent" | "checked_out" | "on_leave" | "weekend" | "untracked";
type Person = {
  user_id: number; name: string; department?: string | null; job_title?: string | null; status: LiveStatus; mode: string;
  check_in?: string | null; check_out?: string | null; late_minutes: number; verified_minutes?: number | null; away_minutes: number;
  outside_since?: string | null; flags: string[]; last_seen?: string | null; minutes_since_seen?: number | null; stale: boolean;
  distance?: number | null; inside?: boolean | null; x?: number | null; y?: number | null; leave_type?: string | null; work_location?: string | null;
};
export type Live = {
  now: string; date: string; headcount: number; counts: Partial<Record<LiveStatus, number>>; people: Person[];
  office: { lat: number; lng: number; radius: number }; work: { start: string; end: string };
};
type Totals = {
  attendance_pct: number | null; punctuality_pct: number | null; verified_hours: number; worked_hours: number; late_minutes: number; late_days: number;
  absent_days: number; leave_days: number; remote_days: number; exceptions: number; present_days: number; avg_actual_hours: number | null;
};
type Row = {
  user_id: number; name: string; working_days: number; present: number; late: number; late_minutes: number; absent: number; on_leave: number;
  remote_days: number; field_days: number; worked_hours: number; verified_hours: number; away_minutes: number; exceptions: number;
  attendance_pct: number; punctuality_pct: number | null; avg_check_in: string | null; permission_minutes: number;
};
type Top = { user_id: number; name: string; value: number }[];
export type Stats = {
  month: string; from: string; to: string; headcount: number; totals: Totals; prev: Totals | null;
  series: { day: string; weekend: boolean; present: number; late: number; absent: number; on_leave: number; remote: number }[];
  rows: Row[]; top_late: Top; top_absent: Top; top_exceptions: Top; top_hours: Top;
  leave_by_type: Record<string, number>; requests: Record<string, { total: number; approved: number; rejected: number; pending: number }>;
};

const STATUS: Record<LiveStatus, { ar: string; en: string; c: string; icon: string }> = {
  in_office: { ar: "في المكتب", en: "In the office", c: "#2f7d4f", icon: "domain" },
  away: { ar: "خارج المكتب دون انصراف", en: "Away, not checked out", c: "#b42318", icon: "location_off" },
  remote: { ar: "عن بُعد", en: "Remote", c: "#1f4b99", icon: "home" },
  field: { ar: "عمل ميداني", en: "Field work", c: "#5b3fa0", icon: "directions_car" },
  not_yet: { ar: "لم يحضر بعد", en: "Not in yet", c: "#8a7f75", icon: "schedule" },
  absent: { ar: "غائب", en: "Absent", c: "#9b2c1f", icon: "person_off" },
  checked_out: { ar: "انصرف", en: "Checked out", c: "#6b625a", icon: "logout" },
  on_leave: { ar: "في إجازة", en: "On leave", c: "#3a6ea5", icon: "beach_access" },
  weekend: { ar: "عطلة", en: "Weekend", c: "#8a7f75", icon: "weekend" },
  untracked: { ar: "غير متتبَّع", en: "Not tracked", c: "#8a7f75", icon: "visibility_off" },
};
const SERIES = [
  { k: "present", ar: "في الوقت", en: "On time", c: "#2f7d4f" },
  { k: "late", ar: "متأخر", en: "Late", c: "#d9a441" },
  { k: "remote", ar: "عن بُعد / ميداني", en: "Remote / field", c: "#3a6ea5" },
  { k: "on_leave", ar: "إجازة", en: "Leave", c: "#9db4d6" },
  { k: "absent", ar: "غائب", en: "Absent", c: "#c0462a" },
] as const;

export function AttendanceDashboard({ locale, initialLive, initialStats, month: m0, canSend }: { locale: string; initialLive: Live; initialStats: Stats; month: string; canSend: boolean }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const nf = new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 1 });
  const [live, setLive] = useState(initialLive);
  const [stats, setStats] = useState(initialStats);
  const [month, setMonth] = useState(m0);
  const [filter, setFilter] = useState<"all" | LiveStatus>("all");
  const [sendOpen, setSendOpen] = useState(false);
  const [loading, start] = useTransition();

  const reload = useCallback(() => { hrLive(locale).then((r) => r.ok && setLive(r.data as Live)); }, [locale]);
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && reload(), 60_000);
    return () => clearInterval(id);
  }, [reload]);
  const changeMonth = (m: string) => { setMonth(m); start(async () => { const r = await hrStats(m, locale); if (r.ok) setStats(r.data as Stats); }); };

  const c = live.counts;
  const people = live.people.filter((p) => filter === "all" || p.status === filter);
  const kpis: [LiveStatus, number][] = (["in_office", "away", "remote", "field", "not_yet", "absent", "on_leave", "checked_out"] as LiveStatus[]).map((k) => [k, c[k] ?? 0]);

  return (
    <div className="page screen-enter att">
      <div className="page-header">
        <div>
          <h2 className="page-title">{T("لوحة الحضور", "Attendance dashboard")}</h2>
          <div className="page-subtitle">{T(`مباشر · آخر تحديث ${live.now} · يتجدد كل دقيقة`, `Live · updated ${live.now} · refreshes every minute`)}</div>
        </div>
        <div className="hr-new">
          <button className="btn btn-secondary" onClick={reload}><span className="ms">refresh</span>{T("تحديث", "Refresh")}</button>
          {canSend && <button className="btn btn-primary" onClick={() => setSendOpen(true)}><span className="ms">forward_to_inbox</span>{T("إرسال التقارير الشهرية", "Send monthly reports")}</button>}
          <Link className="btn btn-ghost" href={`/${locale}/hr`}>{T("إدارة الموارد البشرية", "HR management")}</Link>
        </div>
      </div>

      <div className="att-kpis">
        {kpis.map(([k, n]) => (
          <button key={k} className={`att-kpi${filter === k ? " is-on" : ""}`} style={{ ["--c" as string]: STATUS[k].c }} onClick={() => setFilter(filter === k ? "all" : k)} aria-pressed={filter === k}>
            <span className="ms" aria-hidden>{STATUS[k].icon}</span>
            <strong>{nf.format(n)}</strong>
            <span>{T(STATUS[k].ar, STATUS[k].en)}</span>
          </button>
        ))}
      </div>

      <div className="att-live">
        <section className="card att-radar-card">
          <header className="hr-sec__head"><h3>{T("المتواجدون حول المقر", "Around headquarters")}</h3><span className="text-sec">{T(`النطاق ${live.office.radius} م`, `${live.office.radius} m area`)}</span></header>
          <Radar people={live.people} radius={live.office.radius} ar={ar} />
          <p className="text-sec att-note">{T("آخر موقع مُبلَّغ لكل موظف اليوم (عند الحضور أو أثناء فتح البوابة). المسافات تقريبية.", "Each employee's last reported position today (at check-in or while the portal was open). Distances are approximate.")}</p>
        </section>

        <section className="card att-people">
          <header className="hr-sec__head">
            <h3>{T("حالة الموظفين الآن", "Who's where now")}</h3>
            {filter !== "all" && <button className="btn btn-ghost btn-sm" onClick={() => setFilter("all")}>{T("عرض الكل", "Show all")}</button>}
          </header>
          <ul className="att-list">
            {people.map((p) => (
              <li key={p.user_id} style={{ ["--c" as string]: STATUS[p.status].c }}>
                <span className="att-dot" aria-hidden />
                <div className="att-who">
                  <strong>{p.name}</strong>
                  <span>{[p.job_title, p.department].filter(Boolean).join(" · ") || "—"}</span>
                </div>
                <div className="att-state">
                  <span className="att-chip">{T(STATUS[p.status].ar, STATUS[p.status].en)}</span>
                  <span className="text-sec">
                    {p.status === "away" && p.outside_since ? T(`منذ ${p.outside_since}`, `since ${p.outside_since}`)
                      : p.status === "on_leave" ? hl(ar, HR.leave, p.leave_type)
                      : p.status === "field" || p.status === "remote" ? (p.work_location ?? "")
                      : p.check_in ? T(`حضور ${p.check_in}${p.check_out ? ` · انصراف ${p.check_out}` : ""}`, `in ${p.check_in}${p.check_out ? ` · out ${p.check_out}` : ""}`) : ""}
                    {p.late_minutes ? T(` · تأخر ${mins(p.late_minutes, true)}`, ` · late ${mins(p.late_minutes, false)}`) : ""}
                  </span>
                </div>
                <div className="att-meta">
                  {p.verified_minutes != null && <span><b>{mins(p.verified_minutes, ar)}</b>{T(" فعلي", " actual")}</span>}
                  {p.last_seen && <span className={p.stale ? "att-stale" : ""}>{T(`آخر ظهور ${p.last_seen}`, `seen ${p.last_seen}`)}{p.distance != null ? ` · ${Math.round(p.distance)} ${T("م", "m")}` : ""}</span>}
                  {p.flags.map((f) => <span key={f} className="hr-flagtxt">{hl(ar, HR.flag, f)}</span>)}
                </div>
              </li>
            ))}
            {people.length === 0 && <li className="text-sec">{T("لا أحد بهذه الحالة الآن.", "Nobody with this status right now.")}</li>}
          </ul>
        </section>
      </div>

      <section className="att-month">
        <header className="att-month__head">
          <h3>{T("إحصاءات الشهر", "Monthly statistics")}</h3>
          <input className="input hr-month" type="month" value={month} max={m0} onChange={(e) => e.target.value && changeMonth(e.target.value)} aria-busy={loading} />
        </header>
        <MonthStats stats={stats} ar={ar} />
      </section>

      {sendOpen && <SendDialog locale={locale} month={month} onClose={() => setSendOpen(false)} />}
    </div>
  );
}

/* ───────── radar: HQ at the centre, square-root distance scale ───────── */
function Radar({ people, radius, ar }: { people: Person[]; radius: number; ar: boolean }) {
  const R = 150; // svg radius
  const max = 500; // metres at the edge
  const scale = (m: number) => Math.min(1, Math.sqrt(m / max)) * R;
  const rings = [radius, 50, 150, 500].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
  const pts = people.filter((p) => p.x != null && p.y != null && ["in_office", "away", "checked_out", "not_yet", "absent"].includes(p.status));
  return (
    <svg className="att-radar" viewBox="-170 -170 340 340" role="img" aria-label={ar ? "مواقع الموظفين حول المقر" : "Employee positions around headquarters"}>
      {rings.map((r) => (
        <g key={r}>
          <circle r={scale(r)} className={r === radius ? "att-fence" : "att-ring"} />
          <text x={scale(r) * 0.71 + 3} y={scale(r) * 0.71 + 10} className="att-ringlbl">{r} {ar ? "م" : "m"}</text>
        </g>
      ))}
      <line x1={-R} x2={R} y1={0} y2={0} className="att-axis" /><line y1={-R} y2={R} x1={0} x2={0} className="att-axis" />
      <text y={-R - 6} x={0} className="att-n" textAnchor="middle">N</text>
      <circle r={5} className="att-hq" />
      {pts.map((p) => {
        const d = Math.hypot(p.x!, p.y!);
        const k = d ? scale(d) / d : 0;
        const x = p.x! * k, y = -p.y! * k;
        const st = STATUS[p.status];
        return (
          <g key={p.user_id} transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}>
            <title>{`${p.name} · ${ar ? st.ar : st.en}${p.distance != null ? ` · ${Math.round(p.distance)} ${ar ? "م" : "m"}` : ""}${p.last_seen ? ` · ${p.last_seen}` : ""}`}</title>
            <circle r={9} fill={st.c} stroke="#fff" strokeWidth={2} />
            <text className="att-ini" textAnchor="middle" dy="3.5">{p.name.slice(0, 1)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ───────── monthly statistics ───────── */
function Delta({ v, p, suffix = "", invert = false }: { v: number | null; p: number | null | undefined; suffix?: string; invert?: boolean }) {
  if (v == null || p == null) return null;
  const d = Math.round((v - p) * 10) / 10;
  if (!d) return <span className="att-delta">=</span>;
  const good = invert ? d < 0 : d > 0;
  return <span className={`att-delta ${good ? "up" : "down"}`} dir="ltr">{d > 0 ? "▲" : "▼"} {Math.abs(d)}{suffix}</span>;
}

function MonthStats({ stats, ar }: { stats: Stats; ar: boolean }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const t = stats.totals;
  const p = stats.prev;
  const maxDay = Math.max(1, ...stats.series.map((s) => s.present + s.late + s.remote + s.on_leave + s.absent));
  const [sort, setSort] = useState<keyof Row>("attendance_pct");
  const rows = useMemo(() => [...stats.rows].sort((a, b) => ((a[sort] as number) ?? 0) - ((b[sort] as number) ?? 0)), [stats.rows, sort]);
  const leaveMax = Math.max(1, ...Object.values(stats.leave_by_type));
  const tiles: [string, string, number | null, number | null | undefined, string, boolean][] = [
    [T("نسبة الحضور", "Attendance"), "%", t.attendance_pct, p?.attendance_pct, "%", false],
    [T("الالتزام بالوقت", "On time"), "%", t.punctuality_pct, p?.punctuality_pct, "%", false],
    [T("الساعات الفعلية", "Actual hours"), "", t.verified_hours, p?.verified_hours, "", false],
    [T("متوسط الساعات الفعلية / يوم", "Avg actual hours / day"), "", t.avg_actual_hours, p?.avg_actual_hours, "", false],
    [T("أيام الغياب", "Absent days"), "", t.absent_days, p?.absent_days, "", true],
    [T("دقائق التأخير", "Minutes late"), "", t.late_minutes, p?.late_minutes, "", true],
    [T("أيام عن بُعد / ميداني", "Remote / field days"), "", t.remote_days, p?.remote_days, "", false],
    [T("مخالفات الحضور", "Attendance exceptions"), "", t.exceptions, p?.exceptions, "", true],
  ];
  return (
    <>
      <div className="att-tiles">
        {tiles.map(([label, unit, v, pv, suf, inv]) => (
          <div key={label} className="att-tile">
            <span>{label}</span>
            <strong>{v == null ? "—" : `${v}${unit}`}</strong>
            {p && <small><Delta v={v} p={pv} suffix={suf} invert={inv} /> {T("عن الشهر السابق", "vs last month")}</small>}
          </div>
        ))}
      </div>

      <div className="att-grid">
        <section className="card hr-sec att-chart-card">
          <header className="hr-sec__head"><h3>{T("الحضور اليومي", "Daily attendance")}</h3></header>
          <div className="att-chart" role="img" aria-label={T("أعمدة يومية للحضور والتأخير والغياب", "Daily bars of attendance, lateness and absence")}>
            {stats.series.map((d) => (
              <div key={d.day} className={`att-col${d.weekend ? " is-weekend" : ""}`} title={`${d.day}\n${SERIES.map((s) => `${T(s.ar, s.en)}: ${d[s.k]}`).join("\n")}`}>
                <div className="att-stack">
                  {SERIES.map((s) => d[s.k] > 0 && <i key={s.k} style={{ height: `${(d[s.k] / maxDay) * 100}%`, background: s.c }} />)}
                </div>
                <span>{Number(d.day.slice(8))}</span>
              </div>
            ))}
          </div>
          <div className="hr-legend">{SERIES.map((s) => <span key={s.k}><i style={{ background: s.c, borderColor: s.c }} />{T(s.ar, s.en)}</span>)}</div>
        </section>

        <section className="card hr-sec">
          <header className="hr-sec__head"><h3>{T("أبرز المؤشرات", "Highlights")}</h3></header>
          <TopList title={T("الأكثر تأخيرًا", "Most late")} items={stats.top_late} fmt={(v) => mins(v, ar)} />
          <TopList title={T("الأكثر غيابًا", "Most absences")} items={stats.top_absent} fmt={(v) => T(`${v} يوم`, `${v} d`)} />
          <TopList title={T("الأكثر مخالفات حضور", "Most exceptions")} items={stats.top_exceptions} fmt={(v) => String(v)} />
          <TopList title={T("الأعلى ساعات فعلية", "Most actual hours")} items={stats.top_hours} fmt={(v) => T(`${v} س`, `${v} h`)} />
        </section>
      </div>

      <div className="att-grid">
        <section className="card hr-sec">
          <header className="hr-sec__head"><h3>{T("الإجازات حسب النوع (أيام عمل)", "Leave by type (working days)")}</h3></header>
          {Object.keys(stats.leave_by_type).length === 0 ? <p className="text-sec">{T("لا إجازات معتمدة هذا الشهر.", "No approved leave this month.")}</p> : (
            <ul className="att-bars">
              {Object.entries(stats.leave_by_type).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <li key={k}><span>{hl(ar, HR.leave, k)}</span><div className="hr-meter"><i style={{ width: `${(v / leaveMax) * 100}%`, background: "#3a6ea5" }} /></div><b>{v}</b></li>
              ))}
            </ul>
          )}
        </section>
        <section className="card hr-sec">
          <header className="hr-sec__head"><h3>{T("الطلبات هذا الشهر", "Requests this month")}</h3></header>
          {Object.keys(stats.requests).length === 0 ? <p className="text-sec">{T("لا طلبات.", "No requests.")}</p> : (
            <table className="tbl att-req"><thead><tr><th>{T("النوع", "Type")}</th><th>{T("الكل", "Total")}</th><th>{T("معتمد", "Approved")}</th><th>{T("مرفوض", "Rejected")}</th><th>{T("معلّق", "Pending")}</th></tr></thead>
              <tbody>{Object.entries(stats.requests).map(([k, v]) => <tr key={k}><td>{hl(ar, HR.kind, k)}</td><td>{v.total}</td><td>{v.approved}</td><td>{v.rejected}</td><td>{v.pending}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card card-tight">
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr>
            {([["name", T("الموظف", "Employee")], ["attendance_pct", T("الحضور", "Attendance")], ["punctuality_pct", T("في الوقت", "On time")], ["avg_check_in", T("متوسط الحضور", "Avg check-in")],
              ["late_minutes", T("التأخير", "Late")], ["absent", T("غياب", "Absent")], ["on_leave", T("إجازة", "Leave")], ["remote_days", T("عن بُعد", "Remote")],
              ["verified_hours", T("ساعات فعلية", "Actual h")], ["exceptions", T("مخالفات", "Exceptions")]] as [keyof Row, string][]).map(([k, l]) => (
              <th key={k}><button className="att-sort" onClick={() => setSort(k)} aria-pressed={sort === k}>{l}{sort === k ? " ↑" : ""}</button></th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td><strong>{r.name}</strong><div className="text-sec" style={{ fontSize: 12 }}>{T(`${r.present} من ${r.working_days} يوم`, `${r.present} of ${r.working_days} days`)}</div></td>
                <td><div className="hr-pct"><div className="hr-meter"><i style={{ width: `${r.attendance_pct}%`, background: r.attendance_pct >= 95 ? "#2f7d4f" : r.attendance_pct >= 85 ? "#c58a1e" : "#b42318" }} /></div><span>{r.attendance_pct}%</span></div></td>
                <td>{r.punctuality_pct == null ? "—" : `${r.punctuality_pct}%`}</td>
                <td dir="ltr">{r.avg_check_in ?? "—"}</td>
                <td>{r.late_minutes ? mins(r.late_minutes, ar) : "—"}<div className="text-sec" style={{ fontSize: 12 }}>{r.late ? T(`${r.late} يوم`, `${r.late} d`) : ""}</div></td>
                <td className={r.absent ? "hr-bad" : ""}>{r.absent}</td>
                <td>{r.on_leave}</td>
                <td>{r.remote_days + r.field_days}</td>
                <td><strong>{r.verified_hours}</strong><span className="text-sec"> / {r.worked_hours}</span></td>
                <td className={r.exceptions ? "hr-bad" : ""}>{r.exceptions || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
    </>
  );
}

function TopList({ title, items, fmt }: { title: string; items: Top; fmt: (v: number) => string }) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.value)) || 1;
  return (
    <div className="att-top">
      <h4>{title}</h4>
      <ul className="att-bars">
        {items.map((i) => <li key={i.user_id}><span>{i.name}</span><div className="hr-meter"><i style={{ width: `${(i.value / max) * 100}%` }} /></div><b>{fmt(i.value)}</b></li>)}
      </ul>
    </div>
  );
}

function SendDialog({ locale, month: m0, onClose }: { locale: string; month: string; onClose: () => void }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const prev = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  const [month, setMonth] = useState(m0 < new Date().toISOString().slice(0, 7) ? m0 : prev);
  const [resend, setResend] = useState(false);
  const [res, setRes] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = month === new Date().toISOString().slice(0, 7);
  return (
    <Modal open onClose={onClose} title={T("إرسال تقارير الحضور الشهرية", "Send monthly attendance reports")}
      subtitle={T("يصل كل موظف تقريره، مع نسخة لمدير الموارد البشرية والرئيس التنفيذي، ثم ملخص للشركة.", "Each employee gets their own report, copied to the HR manager and the CEO, followed by a company summary.")}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{T("إغلاق", "Close")}</button><button className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
        setErr(null); setRes(null);
        const r = await hrSendMonthly(month, resend);
        if (!r.ok) return setErr(r.error);
        const d = r.data as { sent: number; skipped: number; no_email: number; summary: boolean };
        setRes(T(`أُرسل ${d.sent} تقرير${d.skipped ? `، وتُخطّي ${d.skipped} أُرسل سابقًا` : ""}${d.summary ? "، وملخص الشركة" : ""}.`, `Sent ${d.sent} report(s)${d.skipped ? `, skipped ${d.skipped} already sent` : ""}${d.summary ? ", plus the company summary" : ""}.`));
      })}>{pending ? "…" : T("إرسال", "Send")}</button></>}>
      <div className="mx-form">
        <label className="field"><span>{T("الشهر", "Month")}</span><input className="input" type="month" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} /></label>
        {current && <p className="text-sec mx-hint">{T("الشهر الحالي لم ينتهِ: سيُرسل تقرير مرحلي حتى اليوم، ويُرسل التقرير الكامل تلقائيًا في أول الشهر القادم.", "This month isn't over: an interim report up to today is sent, and the full report still goes out automatically on the 1st.")}</p>}
        {!current && <label className="checkbox"><input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} />{T("إعادة الإرسال لمن استلم تقرير هذا الشهر", "Send again to people who already received this month")}</label>}
        <p className="text-sec mx-hint">{T("يُرسل النظام تقارير الشهر السابق تلقائيًا في اليوم الأول من كل شهر بعد الساعة 9 صباحًا.", "Last month's reports are sent automatically on the 1st of each month after 9 AM.")}</p>
        {res && <p className="col-ok">{res}</p>}
        {err && <p className="mx-err">{err}</p>}
      </div>
    </Modal>
  );
}
