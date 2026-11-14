"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { FilterBar, FilterSearch, FilterSelect } from "@/components/EntityFilterBar";
import { RequestDrawer, RequestModal } from "@/components/hr/HrForms";
import { Modal } from "@/components/Modal";
import { getPosition, geoErrorText } from "@/lib/geo";
import { hrAttendanceDay, hrAttendanceReport, hrDecide, hrSaveEmployee, hrSaveSettings, hrSetAttendance } from "@/lib/hr-actions";
import { HR, hl, mins, statusClass, type Balance, type DayStatus, type HrReq } from "@/lib/hr-labels";

type BoardRow = DayStatus & { user_id: number; name: string; department?: string | null };
export type Dash = {
  headcount: number; today: Record<string, number>; board: BoardRow[]; pending: HrReq[]; upcoming_leave: HrReq[]; tickets_to_book: HrReq[];
  month: { requests: number; approved: number; rejected: number }; ticket_cost_year: number;
  balance_flags: { user_id: number; name: string; remaining: number }[]; approver?: string | null; can_approve: boolean; can_edit: boolean; me_id: number;
  alerts: { user_id: number; name: string; kind: string; since?: string | null; distance?: number | null; reason?: string; at?: string; day: string }[];
  remote_today: number;
};
export type Emp = {
  user_id: number; name: string; username: string; email: string; phone?: string | null; role: string; employee_no?: string | null; department?: string | null;
  job_title?: string | null; manager_user_id?: number | null; manager?: string | null; hire_date?: string | null; nationality?: string | null;
  contract_type: string; employment_status: string; annual_leave_days: number; leave_adjustment: number; ticket_entitlement: string;
  ticket_destination?: string | null; ticket_class: string; ticket_family_members: number; work_start?: string | null; work_end?: string | null;
  work_mode: string; remote_days: number[];
  emergency_contact?: string | null; notes?: string | null; balance: Balance;
};
export type ReportRow = { user_id: number; name: string; working_days: number; present: number; late: number; late_minutes: number; absent: number; on_leave: number; early_leave_minutes: number; permission_minutes: number; worked_hours: number; attendance_pct: number;
  verified_hours: number; away_minutes: number; remote_days: number; field_days: number; exceptions: number; refused_checkins: number };
export type Report = { month: string; from: string; to: string; rows: ReportRow[] };
export type HrSettings = {
  approver_user_id?: number | null; cc_emails: string; default_cc: string; work_start: string; work_end: string; grace_minutes: number;
  weekend_days: number[]; monthly_permission_minutes: number; attendance_from: string; effective_approvers: string[]; users: { id: number; name: string; role: string }[];
  office_lat: number; office_lng: number; geofence_radius_m: number; max_accuracy_m: number; enforce_location: boolean; ping_minutes: number;
  left_alert_minutes: number; missing_checkout_minutes: number; checkin_reminder_minutes: number; daily_summary: boolean;
};
type Tab = "overview" | "requests" | "attendance" | "employees" | "settings";

export function HrClient({ locale, dash, requests, employees, settings, report, month, canCreate }: {
  locale: string; dash: Dash; requests: HrReq[]; employees: Emp[]; settings: HrSettings; report: Report; month: string; canCreate: boolean;
}) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [openId, setOpenId] = useState<number | null>(null);
  const [newKind, setNewKind] = useState<null | "leave" | "permission" | "ticket" | "work_location">(null);
  useEffect(() => { const id = Number(new URLSearchParams(window.location.search).get("open")); if (id) setOpenId(id); }, []);
  const can = { approve: dash.can_approve, edit: dash.can_edit };
  const people = employees.map((e) => ({ id: e.user_id, name: e.name }));
  const tabs: [Tab, string, string, number?][] = [
    ["overview", T("نظرة عامة", "Overview"), "space_dashboard"],
    ["requests", T("الطلبات", "Requests"), "inbox", dash.pending.length],
    ["attendance", T("الحضور والانصراف", "Attendance"), "badge"],
    ["employees", T("الموظفون", "Employees"), "groups"],
    ["settings", T("الإعدادات", "Settings"), "tune"],
  ];

  return (
    <div className="page screen-enter hr">
      <div className="page-header">
        <div>
          <h2 className="page-title">{T("الموارد البشرية", "Human resources")}</h2>
          <div className="page-subtitle">{T(`${dash.headcount} موظف · يعتمد الطلبات: ${dash.approver ?? "—"}`, `${dash.headcount} employees · Requests approved by ${dash.approver ?? "—"}`)}</div>
        </div>
        {canCreate && (
          <div className="hr-new">
            <a className="btn btn-primary" href={`/${locale}/hr/attendance`}><span className="ms">monitoring</span>{T("لوحة الحضور", "Attendance dashboard")}</a>
            <button className="btn btn-secondary" onClick={() => setNewKind("leave")}><span className="ms">beach_access</span>{T("تسجيل إجازة", "File leave")}</button>
            <button className="btn btn-secondary" onClick={() => setNewKind("permission")}><span className="ms">schedule</span>{T("استئذان", "Permission")}</button>
            <button className="btn btn-secondary" onClick={() => setNewKind("work_location")}><span className="ms">home_work</span>{T("عن بُعد / ميداني", "Remote / field")}</button>
            <button className="btn btn-secondary" onClick={() => setNewKind("ticket")}><span className="ms">flight</span>{T("تذكرة", "Ticket")}</button>
          </div>
        )}
      </div>

      <nav className="hr-tabs" role="tablist">
        {tabs.map(([k, label, icon, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>
            <span className="ms ms-sm" aria-hidden>{icon}</span>{label}{n ? <b>{n}</b> : null}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview locale={locale} dash={dash} onOpen={setOpenId} onTab={setTab} />}
      {tab === "requests" && <Requests locale={locale} rows={requests} people={people} onOpen={setOpenId} />}
      {tab === "attendance" && <AttendanceTab locale={locale} board={dash.board} report={report} month={month} canEdit={can.edit} />}
      {tab === "employees" && <Employees locale={locale} rows={employees} canEdit={can.edit} />}
      {tab === "settings" && <SettingsTab locale={locale} s={settings} canSave={can.approve} />}

      {newKind && <RequestModal locale={locale} kind={newKind} employees={people} colleagues={people} onClose={() => setNewKind(null)} onDone={(r) => { setNewKind(null); router.refresh(); setOpenId(r.id); }} />}
      {openId != null && <RequestDrawer id={openId} locale={locale} can={can} meId={dash.me_id} onClose={() => { setOpenId(null); router.refresh(); }} />}
    </div>
  );
}

/* ───────── Overview ───────── */
function Overview({ locale, dash, onOpen, onTab }: { locale: string; dash: Dash; onOpen: (id: number) => void; onTab: (t: Tab) => void }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const nf = new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 });
  const [done, setDone] = useState<Record<number, string>>({});
  const [pending, start] = useTransition();
  const t = dash.today;
  const decide = (id: number, ok: boolean) => start(async () => {
    const r = await hrDecide(id, ok, undefined, locale);
    setDone((d) => ({ ...d, [id]: r.ok ? (ok ? T("اعتُمد", "Approved") : T("رُفض", "Rejected")) : r.error }));
    if (r.ok) router.refresh();
  });
  const absentNames = dash.board.filter((b) => b.status === "absent").map((b) => b.name);
  const lateRows = dash.board.filter((b) => b.status === "late");

  return (
    <>
      <div className="mx-kpis">
        <Kpi icon="how_to_reg" label={T("حاضرون اليوم", "In today")} value={`${nf.format((t.present ?? 0) + (t.late ?? 0))} / ${nf.format(dash.headcount)}`} tone="neutral" />
        <Kpi icon="running_with_errors" label={T("متأخرون", "Late")} value={nf.format(t.late ?? 0)} tone={t.late ? "warn" : "good"} sub={lateRows.slice(0, 2).map((r) => r.name).join("، ") || undefined} />
        <Kpi icon="person_off" label={T("غائبون", "Absent")} value={nf.format(t.absent ?? 0)} tone={t.absent ? "bad" : "good"} sub={absentNames.slice(0, 2).join("، ") || undefined} />
        <Kpi icon="beach_access" label={T("في إجازة", "On leave")} value={nf.format(t.on_leave ?? 0)} tone="neutral" />
        <Kpi icon="home_work" label={T("عن بُعد / ميداني", "Remote / field")} value={nf.format(dash.remote_today)} tone="neutral" />
        <Kpi icon="location_off" label={T("تنبيهات الحضور", "Attendance alerts")} value={nf.format(dash.alerts.length)} tone={dash.alerts.length ? "bad" : "good"} />
        <Kpi icon="pending_actions" label={T("طلبات بانتظار الاعتماد", "Pending requests")} value={nf.format(dash.pending.length)} tone={dash.pending.length ? "warn" : "good"} onClick={() => onTab("requests")} />
        <Kpi icon="flight" label={T("تكلفة التذاكر هذا العام", "Ticket spend this year")} value={`${nf.format(dash.ticket_cost_year)} ${T("ر.س", "SAR")}`} tone="neutral" />
      </div>

      <div className="hr-grid">
        <section className="card hr-sec">
          <header className="hr-sec__head"><h3>{T("بانتظار الاعتماد", "Waiting for approval")}</h3></header>
          {dash.pending.length === 0 ? <p className="text-sec">{T("لا توجد طلبات معلّقة.", "No pending requests.")}</p> : (
            <ul className="hr-list">
              {dash.pending.map((r) => (
                <li key={r.id}>
                  <button className="hr-list__main" onClick={() => onOpen(r.id)}>
                    <span className={`hr-kind hr-kind--${r.kind}`}><span className="ms ms-sm" aria-hidden>{r.kind === "leave" ? "beach_access" : r.kind === "ticket" ? "flight" : r.kind === "work_location" ? "home_work" : "schedule"}</span>{hl(ar, HR.kind, r.kind)}</span>
                    <strong>{r.employee}</strong>
                    <span className="text-sec">{r.summary}</span>
                  </button>
                  {done[r.id] ? <span className="mx-chip">{done[r.id]}</span> : dash.can_approve && r.user_id !== dash.me_id ? (
                    <div className="hr-list__act">
                      <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => decide(r.id, true)}>{T("اعتماد", "Approve")}</button>
                      <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => decide(r.id, false)}>{T("رفض", "Reject")}</button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card hr-sec">
          <header className="hr-sec__head"><h3>{T("إجازات الثلاثين يومًا القادمة", "Leave in the next 30 days")}</h3></header>
          {dash.upcoming_leave.length === 0 ? <p className="text-sec">{T("لا توجد إجازات معتمدة قادمة.", "No approved leave coming up.")}</p> : (
            <ul className="hr-list">
              {dash.upcoming_leave.map((r) => (
                <li key={r.id}><button className="hr-list__main" onClick={() => onOpen(r.id)}>
                  <strong>{r.employee}</strong><span className="text-sec">{hl(ar, HR.leave, r.leave_type)} · {r.start_date} → {r.end_date} · {r.days} {T("يوم", "days")}</span>
                </button></li>
              ))}
            </ul>
          )}
          {dash.tickets_to_book.length > 0 && <>
            <header className="hr-sec__head" style={{ marginTop: 16 }}><h3>{T("تذاكر معتمدة بانتظار الحجز", "Approved tickets to book")}</h3></header>
            <ul className="hr-list">
              {dash.tickets_to_book.map((r) => (
                <li key={r.id}><button className="hr-list__main" onClick={() => onOpen(r.id)}><strong>{r.employee}</strong><span className="text-sec">{r.summary}</span></button></li>
              ))}
            </ul>
          </>}
        </section>
      </div>

      {dash.alerts.length > 0 && (
        <section className="card hr-sec hr-alerts">
          <header className="hr-sec__head"><h3>{T("تنبيهات الحضور", "Attendance alerts")}</h3></header>
          <ul className="hr-list">
            {dash.alerts.map((a, i) => (
              <li key={i}>
                <div className="hr-list__main">
                  <span className={`hr-kind hr-flagk--${a.kind}`}><span className="ms ms-sm" aria-hidden>{a.kind === "refused" ? "block" : a.kind === "auto_closed" ? "lock_clock" : "location_off"}</span>{hl(ar, HR.flag, a.kind)}</span>
                  <strong>{a.name}</strong>
                  <span className="text-sec">
                    {a.kind === "refused" ? T(`${a.at}${a.distance != null ? ` · على بعد ${Math.round(a.distance)} م` : ""}${a.reason === "no_location" ? " · بدون موقع" : a.reason === "low_accuracy" ? " · موقع غير دقيق" : ""}`, `${a.at}${a.distance != null ? ` · ${Math.round(a.distance)} m away` : ""}${a.reason === "no_location" ? " · no location" : a.reason === "low_accuracy" ? " · imprecise location" : ""}`)
                      : a.kind === "left_area" ? T(`خارج المكتب منذ ${a.since ?? "—"}`, `Outside the office since ${a.since ?? "—"}`)
                      : a.kind === "auto_closed" ? T(`لم يسجّل الانصراف يوم ${a.day}`, `Didn't check out on ${a.day}`) : a.day}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card hr-sec">
        <header className="hr-sec__head"><h3>{T("لوحة الحضور اليوم", "Today's attendance")}</h3><button className="btn btn-ghost btn-sm" onClick={() => onTab("attendance")}>{T("التفاصيل", "Details")}</button></header>
        <div className="hr-board">
          {dash.board.map((b) => (
            <div key={b.user_id} className={`hr-person hr-person--${b.status}`}>
              <span className="hr-avatar" aria-hidden>{b.name.slice(0, 1)}</span>
              <div><strong>{b.name}</strong><span>{hl(ar, HR.day, b.status)}{b.check_in ? ` · ${b.check_in}` : ""}{b.late_minutes ? ` (+${mins(b.late_minutes, ar)})` : ""}{b.mode && b.mode !== "office" ? ` · ${hl(ar, HR.mode, b.mode)}` : ""}</span>{(b.flags ?? []).length > 0 && <em className="hr-flagtxt">{hl(ar, HR.flag, (b.flags ?? [])[0])}</em>}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Kpi({ icon, label, value, sub, tone, onClick }: { icon: string; label: string; value: string; sub?: string; tone: "good" | "warn" | "bad" | "neutral"; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`mx-kpi is-${tone}`} onClick={onClick}>
      <span className="ms mx-kpi__ico" aria-hidden>{icon}</span>
      <span className="mx-kpi__label">{label}</span>
      <strong className="mx-kpi__value">{value}</strong>
      {sub && <span className="mx-kpi__sub">{sub}</span>}
    </Tag>
  );
}

/* ───────── Requests ───────── */
function Requests({ locale, rows, people, onOpen }: { locale: string; rows: HrReq[]; people: { id: number; name: string }[]; onOpen: (id: number) => void }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [st, setSt] = useState("pending");
  const [kind, setKind] = useState("all");
  const [who, setWho] = useState("all");
  const [q, setQ] = useState("");
  const shown = rows.filter((r) => (st === "all" || r.status === st) && (kind === "all" || r.kind === kind) && (who === "all" || String(r.user_id) === who) &&
    (!q.trim() || `${r.number} ${r.employee} ${r.summary}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <>
      <FilterBar search={<FilterSearch value={q} onChange={setQ} placeholder={T("بحث بالرقم أو الموظف…", "Search number or employee…")} />}>
        <FilterSelect label={T("الحالة", "Status")} value={st} onChange={setSt} options={[{ value: "all", label: T("الكل", "All") }, ...Object.keys(HR.status).map((k) => ({ value: k, label: hl(ar, HR.status, k) }))]} />
        <FilterSelect label={T("النوع", "Type")} value={kind} onChange={setKind} options={[{ value: "all", label: T("الكل", "All") }, ...Object.keys(HR.kind).map((k) => ({ value: k, label: hl(ar, HR.kind, k) }))]} />
        <FilterSelect label={T("الموظف", "Employee")} value={who} onChange={setWho} options={[{ value: "all", label: T("الجميع", "Everyone") }, ...people.map((p) => ({ value: String(p.id), label: p.name }))]} />
      </FilterBar>
      {shown.length === 0 ? <div className="empty-state"><div className="empty-title">{T("لا توجد طلبات مطابقة", "No matching requests")}</div></div> : (
        <div className="card card-tight"><div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>{T("الطلب", "Request")}</th><th>{T("الموظف", "Employee")}</th><th>{T("التفاصيل", "Details")}</th><th>{T("الحالة", "Status")}</th><th>{T("القرار", "Decided by")}</th><th>{T("التاريخ", "Submitted")}</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="mx-row" tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={(e) => e.key === "Enter" && onOpen(r.id)}>
                <td><strong>{hl(ar, HR.kind, r.kind)}</strong><div className="text-sec" style={{ fontSize: 12 }}>{r.number}</div></td>
                <td>{r.employee}</td>
                <td>{r.summary}</td>
                <td><span className={`mx-status ${statusClass(r.status)}`}>{hl(ar, HR.status, r.status)}</span></td>
                <td>{r.decided_by ?? "—"}</td>
                <td className="text-sec">{r.created_at.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </>
  );
}

/* ───────── Attendance ───────── */
function AttendanceTab({ locale, board: initial, report: r0, month: m0, canEdit }: { locale: string; board: BoardRow[]; report: Report; month: string; canEdit: boolean }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [view, setView] = useState<"day" | "month">("day");
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [board, setBoard] = useState(initial);
  const [month, setMonth] = useState(m0);
  const [report, setReport] = useState(r0);
  const [edit, setEdit] = useState<BoardRow | null>(null);
  const loadDay = (d: string) => { setDay(d); hrAttendanceDay(d, locale).then((x) => x.ok && setBoard(x.data as BoardRow[])); };
  const loadMonth = (m: string) => { setMonth(m); hrAttendanceReport(m, locale).then((x) => x.ok && setReport(x.data as Report)); };

  function csv() {
    const head = ["Employee", "Working days", "Present", "Late", "Late minutes", "Absent", "On leave", "Remote days", "Field days", "Early leave minutes", "Permission minutes", "Recorded hours", "Actual hours", "Away minutes", "Exceptions", "Refused check-ins", "Attendance %"];
    const lines = [head, ...report.rows.map((r) => [r.name, r.working_days, r.present, r.late, r.late_minutes, r.absent, r.on_leave, r.remote_days, r.field_days, r.early_leave_minutes, r.permission_minutes, r.worked_hours, r.verified_hours, r.away_minutes, r.exceptions, r.refused_checkins, r.attendance_pct])]
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${report.month}.csv`;
    a.click();
  }

  return (
    <>
      <div className="hr-att-bar">
        <div className="rn-tabs" role="tablist">
          <button role="tab" aria-selected={view === "day"} className={view === "day" ? "is-on" : ""} onClick={() => setView("day")}>{T("يومي", "Daily")}</button>
          <button role="tab" aria-selected={view === "month"} className={view === "month" ? "is-on" : ""} onClick={() => setView("month")}>{T("تقرير شهري", "Monthly report")}</button>
        </div>
        {view === "day"
          ? <input className="input hr-month" type="date" value={day} onChange={(e) => e.target.value && loadDay(e.target.value)} />
          : <div className="hr-row"><input className="input hr-month" type="month" value={month} onChange={(e) => e.target.value && loadMonth(e.target.value)} /><button className="btn btn-secondary btn-sm" onClick={csv}><span className="ms ms-sm">download</span>{T("تصدير CSV", "Export CSV")}</button></div>}
      </div>

      {view === "day" ? (
        <div className="card card-tight"><div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>{T("الموظف", "Employee")}</th><th>{T("الحالة", "Status")}</th><th>{T("الحضور", "In")}</th><th>{T("الانصراف", "Out")}</th><th>{T("التأخير", "Late")}</th><th>{T("المسجّل", "Recorded")}</th><th>{T("الفعلي", "Actual")}</th><th>{T("ملاحظات", "Exceptions")}</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {board.map((b) => (
              <tr key={b.user_id}>
                <td><strong>{b.name}</strong>{b.note && <div className="text-sec" style={{ fontSize: 12 }}>{b.note}</div>}</td>
                <td><span className={`hr-day hr-day--${b.status}`}>{hl(ar, HR.day, b.status)}</span>{b.mode && b.mode !== "office" && <span className="mx-chip" style={{ marginInlineStart: 6 }}>{hl(ar, HR.mode, b.mode)}</span>}{b.excused && <div className="text-sec" style={{ fontSize: 12 }}>{T("بعذر (استئذان)", "Excused (permission)")}</div>}</td>
                <td><span dir="ltr">{b.check_in ?? "—"}</span>{b.source === "manual" && <span className="text-sec"> ✎</span>}{b.in_distance != null && <div className="text-sec" style={{ fontSize: 12 }}>{T(`${Math.round(b.in_distance)} م`, `${Math.round(b.in_distance)} m`)}</div>}</td>
                <td><span dir="ltr">{b.check_out ?? "—"}</span>{b.out_distance != null && <div className={`text-sec ${b.out_distance > 150 ? "hr-bad" : ""}`} style={{ fontSize: 12 }}>{T(`${Math.round(b.out_distance)} م`, `${Math.round(b.out_distance)} m`)}</div>}</td>
                <td>{b.late_minutes ? mins(b.late_minutes, ar) : "—"}</td>
                <td>{b.worked_minutes != null ? mins(b.worked_minutes, ar) : "—"}</td>
                <td><strong>{b.verified_minutes != null ? mins(b.verified_minutes, ar) : "—"}</strong>{!!b.away_minutes && <div className="text-sec" style={{ fontSize: 12 }}>{T(`خارج المكتب ${mins(b.away_minutes, true)}`, `${mins(b.away_minutes, false)} away`)}</div>}</td>
                <td>{(b.flags ?? []).map((f) => <div key={f} className="hr-flagtxt">{hl(ar, HR.flag, f)}</div>)}{!(b.flags ?? []).length && "—"}</td>
                {canEdit && <td><button className="btn btn-ghost btn-sm" onClick={() => setEdit(b)}>{T("تعديل", "Edit")}</button></td>}
              </tr>
            ))}
          </tbody>
        </table></div></div>
      ) : (
        <div className="card card-tight"><div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>{T("الموظف", "Employee")}</th><th>{T("نسبة الحضور", "Attendance")}</th><th>{T("حضور", "Present")}</th><th>{T("تأخير", "Late")}</th><th>{T("غياب", "Absent")}</th><th>{T("إجازة", "Leave")}</th><th>{T("عن بُعد / ميداني", "Remote / field")}</th><th>{T("استئذان", "Permission")}</th><th>{T("الساعات (مسجّلة / فعلية)", "Hours (recorded / actual)")}</th><th>{T("مخالفات", "Exceptions")}</th></tr></thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.user_id}>
                <td><strong>{r.name}</strong><div className="text-sec" style={{ fontSize: 12 }}>{T(`${r.working_days} يوم عمل`, `${r.working_days} working days`)}</div></td>
                <td><div className="hr-pct"><div className="hr-meter"><i style={{ width: `${r.attendance_pct}%`, background: r.attendance_pct >= 95 ? "#2f7d4f" : r.attendance_pct >= 85 ? "#c58a1e" : "#b42318" }} /></div><span>{r.attendance_pct}%</span></div></td>
                <td>{r.present}</td>
                <td>{r.late}{r.late_minutes ? <span className="text-sec"> ({mins(r.late_minutes, ar)})</span> : null}</td>
                <td className={r.absent ? "hr-bad" : ""}>{r.absent}</td>
                <td>{r.on_leave}</td>
                <td>{r.remote_days + r.field_days ? `${r.remote_days} / ${r.field_days}` : "—"}</td>
                <td>{r.permission_minutes ? mins(r.permission_minutes, ar) : "—"}</td>
                <td>{r.worked_hours} / <strong className={r.verified_hours < r.worked_hours * 0.9 ? "hr-bad" : ""}>{r.verified_hours}</strong>{r.away_minutes ? <div className="text-sec" style={{ fontSize: 12 }}>{T(`خارج المكتب ${mins(r.away_minutes, true)}`, `${mins(r.away_minutes, false)} away`)}</div> : null}</td>
                <td className={r.exceptions ? "hr-bad" : ""}>{r.exceptions || "—"}{r.refused_checkins ? <div className="text-sec" style={{ fontSize: 12 }}>{T(`${r.refused_checkins} حضور مرفوض`, `${r.refused_checkins} refused`)}</div> : null}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
      {edit && <EditAttendance locale={locale} row={edit} day={day} onClose={(saved) => { setEdit(null); if (saved) loadDay(day); }} />}
    </>
  );
}

function EditAttendance({ locale, row, day, onClose }: { locale: string; row: BoardRow; day: string; onClose: (saved: boolean) => void }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [f, setF] = useState({ in: row.check_in ?? "", out: row.check_out ?? "", note: row.note ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Modal open onClose={() => onClose(false)} title={T(`تعديل حضور ${row.name}`, `Edit attendance — ${row.name}`)} subtitle={day}
      footer={<><button className="btn btn-secondary" onClick={() => onClose(false)}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
        const r = await hrSetAttendance({ user_id: row.user_id, day, check_in: f.in || null, check_out: f.out || null, note: f.note || null });
        if (!r.ok) return setErr(r.error);
        onClose(true);
      })}>{T("حفظ", "Save")}</button></>}>
      <div className="mx-grid2">
        <label className="field"><span>{T("الحضور", "Check in")}</span><input className="input" type="time" value={f.in} onChange={(e) => setF({ ...f, in: e.target.value })} /></label>
        <label className="field"><span>{T("الانصراف", "Check out")}</span><input className="input" type="time" value={f.out} onChange={(e) => setF({ ...f, out: e.target.value })} /></label>
      </div>
      <label className="field" style={{ marginTop: 12 }}><span>{T("السبب (مثلًا: نسي تسجيل الحضور، مهمة خارجية)", "Reason (e.g. forgot to check in, field visit)")}</span><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      {err && <p className="mx-err">{err}</p>}
    </Modal>
  );
}

/* ───────── Employees ───────── */
function Employees({ locale, rows, canEdit }: { locale: string; rows: Emp[]; canEdit: boolean }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Emp | null>(null);
  const shown = useMemo(() => rows.filter((r) => !q.trim() || `${r.name} ${r.department ?? ""} ${r.job_title ?? ""} ${r.employee_no ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())), [rows, q]);
  return (
    <>
      <FilterBar search={<FilterSearch value={q} onChange={setQ} placeholder={T("بحث بالاسم أو القسم…", "Search name or department…")} />} />
      <div className="card card-tight"><div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>{T("الموظف", "Employee")}</th><th>{T("القسم / المسمى", "Department / title")}</th><th>{T("المدير المباشر", "Manager")}</th><th>{T("تاريخ التعيين", "Hired")}</th><th>{T("رصيد الإجازة", "Leave left")}</th><th>{T("التذكرة", "Ticket")}</th><th>{T("الحالة", "Status")}</th>{canEdit && <th />}</tr></thead>
        <tbody>
          {shown.map((e) => (
            <tr key={e.user_id}>
              <td><strong>{e.name}</strong><div className="text-sec" style={{ fontSize: 12 }}>{[e.employee_no && `#${e.employee_no}`, e.phone].filter(Boolean).join(" · ") || e.username}</div></td>
              <td>{e.department ?? "—"}<div className="text-sec" style={{ fontSize: 12 }}>{e.job_title ?? ""}</div></td>
              <td>{e.manager ?? "—"}</td>
              <td className="text-sec">{e.hire_date ?? "—"}</td>
              <td><strong className={e.balance.remaining < 0 ? "hr-bad" : ""}>{e.balance.remaining}</strong><span className="text-sec"> / {e.balance.entitlement}</span></td>
              <td>{hl(ar, HR.ticketEnt, e.ticket_entitlement)}{e.ticket_destination ? <div className="text-sec" style={{ fontSize: 12 }}>{e.ticket_destination}</div> : null}</td>
              <td><span className={`mx-chip ${e.employment_status === "active" ? "" : "hr-muted"}`}>{hl(ar, HR.emp, e.employment_status)}</span><div className="text-sec" style={{ fontSize: 12 }}>{hl(ar, HR.mode, e.work_mode)}{e.work_mode === "hybrid" && e.remote_days.length ? `: ${e.remote_days.map((d) => HR.weekday[d][ar ? 0 : 1]).join("، ")}` : ""}</div></td>
              {canEdit && <td><button className="btn btn-ghost btn-sm" onClick={() => setEdit(e)}>{T("تعديل", "Edit")}</button></td>}
            </tr>
          ))}
        </tbody>
      </table></div></div>
      {edit && <EmployeeModal locale={locale} e={edit} all={rows} onClose={() => setEdit(null)} />}
    </>
  );
}

function EmployeeModal({ locale, e, all, onClose }: { locale: string; e: Emp; all: Emp[]; onClose: () => void }) {
  const ar = locale === "ar";
  const T = (a: string, en: string) => (ar ? a : en);
  const router = useRouter();
  const [f, setF] = useState<Record<string, string>>({
    employee_no: e.employee_no ?? "", department: e.department ?? "", job_title: e.job_title ?? "", manager_user_id: String(e.manager_user_id ?? ""),
    hire_date: e.hire_date ?? "", nationality: e.nationality ?? "", contract_type: e.contract_type, employment_status: e.employment_status,
    annual_leave_days: String(e.annual_leave_days), leave_adjustment: String(e.leave_adjustment), ticket_entitlement: e.ticket_entitlement,
    ticket_destination: e.ticket_destination ?? "", ticket_class: e.ticket_class, ticket_family_members: String(e.ticket_family_members),
    work_start: e.work_start ?? "", work_end: e.work_end ?? "", emergency_contact: e.emergency_contact ?? "", notes: e.notes ?? "",
    work_mode: e.work_mode || "office",
  });
  const [rdays, setRdays] = useState<number[]>(e.remote_days ?? []);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));
  const n = (k: string) => (f[k] === "" ? null : f[k]);
  function save() {
    start(async () => {
      const r = await hrSaveEmployee(e.user_id, {
        employee_no: n("employee_no"), department: n("department"), job_title: n("job_title"), manager_user_id: f.manager_user_id ? Number(f.manager_user_id) : null,
        hire_date: n("hire_date"), nationality: n("nationality"), contract_type: f.contract_type, employment_status: f.employment_status,
        annual_leave_days: Number(f.annual_leave_days || 0), leave_adjustment: Number(f.leave_adjustment || 0), ticket_entitlement: f.ticket_entitlement,
        ticket_destination: n("ticket_destination"), ticket_class: f.ticket_class, ticket_family_members: Number(f.ticket_family_members || 0),
        work_start: n("work_start"), work_end: n("work_end"), emergency_contact: n("emergency_contact"), notes: n("notes"),
        work_mode: f.work_mode, remote_days: f.work_mode === "hybrid" ? rdays : [],
      });
      if (!r.ok) return setErr(r.error);
      onClose();
      router.refresh();
    });
  }
  const sel = (k: string, map: Record<string, readonly [string, string]>) => (
    <select className="select" value={f[k]} onChange={(ev) => set(k, ev.target.value)}>{Object.keys(map).map((x) => <option key={x} value={x}>{hl(ar, map, x)}</option>)}</select>
  );
  return (
    <Modal open onClose={onClose} size="lg" title={e.name} subtitle={T("الملف الوظيفي", "Employee record")}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" disabled={pending} onClick={save}>{T("حفظ", "Save")}</button></>}>
      <div className="mx-form">
        <h4 className="mx-h">{T("البيانات الوظيفية", "Job")}</h4>
        <div className="mx-grid2">
          <label className="field"><span>{T("الرقم الوظيفي", "Employee no.")}</span><input className="input" dir="ltr" value={f.employee_no} onChange={(ev) => set("employee_no", ev.target.value)} /></label>
          <label className="field"><span>{T("القسم", "Department")}</span><input className="input" value={f.department} onChange={(ev) => set("department", ev.target.value)} /></label>
          <label className="field"><span>{T("المسمى الوظيفي", "Job title")}</span><input className="input" value={f.job_title} onChange={(ev) => set("job_title", ev.target.value)} /></label>
          <label className="field"><span>{T("المدير المباشر", "Manager")}</span><select className="select" value={f.manager_user_id} onChange={(ev) => set("manager_user_id", ev.target.value)}><option value="">—</option>{all.filter((x) => x.user_id !== e.user_id).map((x) => <option key={x.user_id} value={x.user_id}>{x.name}</option>)}</select></label>
          <label className="field"><span>{T("تاريخ التعيين", "Hire date")}</span><input className="input" type="date" value={f.hire_date} onChange={(ev) => set("hire_date", ev.target.value)} /></label>
          <label className="field"><span>{T("الجنسية", "Nationality")}</span><input className="input" value={f.nationality} onChange={(ev) => set("nationality", ev.target.value)} /></label>
          <label className="field"><span>{T("نوع العقد", "Contract")}</span>{sel("contract_type", HR.contract)}</label>
          <label className="field"><span>{T("الحالة الوظيفية", "Status")}</span>{sel("employment_status", HR.emp)}</label>
        </div>
        <h4 className="mx-h">{T("الإجازات والدوام", "Leave & hours")}</h4>
        <div className="mx-grid2">
          <label className="field"><span>{T("الإجازة السنوية (يوم/سنة)", "Annual leave (days/year)")}</span><input className="input" type="number" min={0} max={60} value={f.annual_leave_days} onChange={(ev) => set("annual_leave_days", ev.target.value)} /></label>
          <label className="field"><span>{T("رصيد مرحّل / تعديل (±)", "Carry-over / adjustment (±)")}</span><input className="input" type="number" step="0.5" value={f.leave_adjustment} onChange={(ev) => set("leave_adjustment", ev.target.value)} /></label>
          <label className="field"><span>{T("بداية الدوام (اختياري)", "Start time (optional)")}</span><input className="input" type="time" value={f.work_start} onChange={(ev) => set("work_start", ev.target.value)} /></label>
          <label className="field"><span>{T("نهاية الدوام (اختياري)", "End time (optional)")}</span><input className="input" type="time" value={f.work_end} onChange={(ev) => set("work_end", ev.target.value)} /></label>
        </div>
        <div className="mx-grid2">
          <label className="field"><span>{T("مكان العمل", "Where they work")}</span>
            <select className="select" value={f.work_mode} onChange={(ev) => set("work_mode", ev.target.value)}>
              <option value="office">{T("من المكتب (حضور بالموقع)", "Office (location-checked)")}</option>
              <option value="hybrid">{T("مرن: أيام محددة عن بُعد", "Hybrid: set remote days")}</option>
              <option value="remote">{T("عن بُعد دائمًا", "Fully remote")}</option>
            </select>
          </label>
        </div>
        {f.work_mode === "hybrid" && (
          <fieldset className="hr-weekend"><legend>{T("أيام العمل عن بُعد", "Remote days")}</legend>
            {[6, 0, 1, 2, 3, 5].map((d) => <label key={d} className="checkbox"><input type="checkbox" checked={rdays.includes(d)} onChange={(ev) => setRdays(ev.target.checked ? [...rdays, d] : rdays.filter((x) => x !== d))} />{HR.weekday[d][ar ? 0 : 1]}</label>)}
          </fieldset>
        )}
        <p className="text-sec mx-hint">{T("الموظف «من المكتب» يحتاج طلب عمل عن بُعد/ميداني معتمدًا لتسجيل الحضور من خارج المقر.", "Office employees need an approved remote/field request to check in away from headquarters.")}</p>
        <p className="text-sec mx-hint">{T("نظام العمل السعودي: 21 يومًا سنويًا، و30 يومًا بعد خمس سنوات خدمة.", "Saudi Labor Law: 21 days a year, 30 days after five years of service.")}</p>
        <h4 className="mx-h">{T("تذاكر السفر", "Travel tickets")}</h4>
        <div className="mx-grid2">
          <label className="field"><span>{T("الاستحقاق", "Entitlement")}</span>{sel("ticket_entitlement", HR.ticketEnt)}</label>
          <label className="field"><span>{T("الوجهة", "Destination")}</span><input className="input" value={f.ticket_destination} onChange={(ev) => set("ticket_destination", ev.target.value)} /></label>
          <label className="field"><span>{T("الدرجة", "Class")}</span>{sel("ticket_class", HR.cls)}</label>
          <label className="field"><span>{T("عدد المرافقين", "Family members")}</span><input className="input" type="number" min={0} max={12} value={f.ticket_family_members} onChange={(ev) => set("ticket_family_members", ev.target.value)} /></label>
        </div>
        <h4 className="mx-h">{T("أخرى", "Other")}</h4>
        <label className="field"><span>{T("جهة اتصال للطوارئ", "Emergency contact")}</span><input className="input" value={f.emergency_contact} onChange={(ev) => set("emergency_contact", ev.target.value)} /></label>
        <label className="field"><span>{T("ملاحظات", "Notes")}</span><textarea className="textarea" rows={2} value={f.notes} onChange={(ev) => set("notes", ev.target.value)} /></label>
        {err && <p className="mx-err">{err}</p>}
      </div>
    </Modal>
  );
}

/* ───────── Settings ───────── */
function SettingsTab({ locale, s, canSave }: { locale: string; s: HrSettings; canSave: boolean }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const [f, setF] = useState({ approver: String(s.approver_user_id ?? ""), cc: s.cc_emails, start: s.work_start, end: s.work_end, grace: String(s.grace_minutes), cap: String(s.monthly_permission_minutes), from: s.attendance_from,
    lat: String(s.office_lat), lng: String(s.office_lng), radius: String(s.geofence_radius_m), acc: String(s.max_accuracy_m), ping: String(s.ping_minutes),
    left: String(s.left_alert_minutes), noout: String(s.missing_checkout_minutes), noin: String(s.checkin_reminder_minutes) });
  const [enforce, setEnforce] = useState(s.enforce_location);
  const [summary, setSummary] = useState(s.daily_summary);
  const [here, setHere] = useState<string | null>(null);
  const [weekend, setWeekend] = useState<number[]>(s.weekend_days);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    setErr(null); setMsg(null);
    const r = await hrSaveSettings({ approver_user_id: f.approver ? Number(f.approver) : null, cc_emails: f.cc || null, work_start: f.start, work_end: f.end, grace_minutes: Number(f.grace || 0), weekend_days: weekend, monthly_permission_minutes: Number(f.cap || 0), attendance_from: f.from || null,
      office_lat: Number(f.lat), office_lng: Number(f.lng), geofence_radius_m: Number(f.radius || 15), max_accuracy_m: Number(f.acc || 100), enforce_location: enforce,
      ping_minutes: Number(f.ping || 5), left_alert_minutes: Number(f.left || 15), missing_checkout_minutes: Number(f.noout || 30), checkin_reminder_minutes: Number(f.noin || 30), daily_summary: summary });
    if (!r.ok) return setErr(r.error);
    setMsg(T("حُفظت الإعدادات.", "Settings saved."));
    router.refresh();
  });
  return (
    <section className="card hr-sec hr-settings">
      <h3>{T("مسار الاعتماد", "Approval workflow")}</h3>
      <div className="mx-grid2">
        <label className="field"><span>{T("معتمد الطلبات (مدير الموارد البشرية)", "Approver (HR manager)")}</span>
          <select className="select" value={f.approver} disabled={!canSave} onChange={(e) => setF({ ...f, approver: e.target.value })}>
            <option value="">{T("تلقائي: من لديه دور مدير الموارد البشرية", "Automatic: users with the HR manager role")}</option>
            {s.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="field"><span>{T("نسخة البريد (للإجازات والتذاكر)", "Email copy (leave and tickets)")}</span>
          <input className="input" dir="ltr" disabled={!canSave} value={f.cc} placeholder={T("فارغ = الرئيس التنفيذي (نسخة تنبيهات الدفعات)", "Empty = CEO (payment-alerts Cc)")} onChange={(e) => setF({ ...f, cc: e.target.value })} />
        </label>
      </div>
      <p className="text-sec mx-hint">{T(`يعتمد حاليًا: ${s.effective_approvers.join("، ") || "—"}. لا يعتمد أحد طلبه؛ طلبات المعتمد نفسه تذهب لمدير النظام.`, `Currently approving: ${s.effective_approvers.join(", ") || "—"}. Nobody approves their own request; the approver's own requests go to an administrator.`)}</p>

      <h3>{T("الدوام والحضور", "Working hours & attendance")}</h3>
      <div className="mx-grid2">
        <label className="field"><span>{T("بداية الدوام", "Start")}</span><input className="input" type="time" disabled={!canSave} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
        <label className="field"><span>{T("نهاية الدوام", "End")}</span><input className="input" type="time" disabled={!canSave} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        <label className="field"><span>{T("سماحية التأخير (دقيقة)", "Grace period (minutes)")}</span><input className="input" type="number" min={0} disabled={!canSave} value={f.grace} onChange={(e) => setF({ ...f, grace: e.target.value })} /></label>
        <label className="field"><span>{T("حد الاستئذان الشهري (دقيقة)", "Monthly permission limit (minutes)")}</span><input className="input" type="number" min={0} disabled={!canSave} value={f.cap} onChange={(e) => setF({ ...f, cap: e.target.value })} /></label>
        <label className="field"><span>{T("بدء احتساب الحضور من", "Count attendance from")}</span><input className="input" type="date" disabled={!canSave} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
      </div>
      <h3>{T("التحقق من الموقع", "Location check")}</h3>
      <label className="checkbox"><input type="checkbox" disabled={!canSave} checked={enforce} onChange={(e) => setEnforce(e.target.checked)} />{T("إلزام موظفي المكتب بتسجيل الحضور من داخل نطاق المقر", "Office employees must check in inside the headquarters area")}</label>
      <div className="mx-grid2">
        <label className="field"><span>{T("خط العرض للمقر", "HQ latitude")}</span><input className="input" dir="ltr" disabled={!canSave} value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} /></label>
        <label className="field"><span>{T("خط الطول للمقر", "HQ longitude")}</span><input className="input" dir="ltr" disabled={!canSave} value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} /></label>
        <label className="field"><span>{T("نصف قطر النطاق (متر)", "Allowed radius (metres)")}</span><input className="input" type="number" min={5} disabled={!canSave} value={f.radius} onChange={(e) => setF({ ...f, radius: e.target.value })} /></label>
        <label className="field"><span>{T("أقصى خطأ مقبول في دقة الموقع (متر)", "Max location error accepted (metres)")}</span><input className="input" type="number" min={10} disabled={!canSave} value={f.acc} onChange={(e) => setF({ ...f, acc: e.target.value })} /></label>
      </div>
      <div className="hr-row">
        <button className="btn btn-secondary btn-sm" type="button" disabled={!canSave} onClick={async () => {
          setHere(T("جارٍ تحديد موقعك…", "Finding your location…"));
          const g = await getPosition();
          if (!g.ok) return setHere(geoErrorText(g.error, ar));
          setF((x) => ({ ...x, lat: g.pos.lat.toFixed(7), lng: g.pos.lng.toFixed(7) }));
          setHere(T(`حُدّد موقعك الحالي كمقر (دقة ±${g.pos.accuracy} م). احفظ لتطبيقه.`, `Set to your current location (±${g.pos.accuracy} m). Save to apply.`));
        }}><span className="ms ms-sm">my_location</span>{T("استخدام موقعي الحالي كمقر", "Use my current location as HQ")}</button>
        <a className="btn btn-ghost btn-sm" href={`https://www.google.com/maps?q=${f.lat},${f.lng}`} target="_blank" rel="noreferrer"><span className="ms ms-sm">map</span>{T("عرض على الخريطة", "View on map")}</a>
      </div>
      {here && <p className="text-sec mx-hint">{here}</p>}
      <p className="text-sec mx-hint">{T("دقة GPS داخل المباني عادة 10–30 م؛ لذلك يُقبل التسجيل إذا تداخل نطاق دقة الجهاز مع النطاق المسموح (بحد أقصى 20 م إضافية). كل تسجيل يُحفظ مع المسافة والدقة للمراجعة.", "Indoor GPS is usually accurate to 10–30 m, so a check-in counts if the phone's accuracy circle overlaps the allowed area (by at most 20 m more). Every check-in is stored with its distance and accuracy for review.")}</p>

      <h3>{T("المتابعة والتنبيهات", "Monitoring & alerts")}</h3>
      <div className="mx-grid2">
        <label className="field"><span>{T("تحديث الموقع أثناء فتح البوابة (دقيقة)", "Location check while the portal is open (minutes)")}</span><input className="input" type="number" min={1} disabled={!canSave} value={f.ping} onChange={(e) => setF({ ...f, ping: e.target.value })} /></label>
        <label className="field"><span>{T("تنبيه المغادرة دون انصراف بعد (دقيقة)", "Alert after leaving without checking out (minutes)")}</span><input className="input" type="number" min={5} disabled={!canSave} value={f.left} onChange={(e) => setF({ ...f, left: e.target.value })} /></label>
        <label className="field"><span>{T("تذكير بعدم الحضور بعد بداية الدوام (دقيقة)", "Reminder if not checked in after start (minutes)")}</span><input className="input" type="number" min={5} disabled={!canSave} value={f.noin} onChange={(e) => setF({ ...f, noin: e.target.value })} /></label>
        <label className="field"><span>{T("تذكير بالانصراف بعد نهاية الدوام (دقيقة)", "Check-out reminder after end of day (minutes)")}</span><input className="input" type="number" min={5} disabled={!canSave} value={f.noout} onChange={(e) => setF({ ...f, noout: e.target.value })} /></label>
      </div>
      <label className="checkbox"><input type="checkbox" disabled={!canSave} checked={summary} onChange={(e) => setSummary(e.target.checked)} />{T("إرسال ملخص يومي للحضور لمعتمد الموارد البشرية (بعد ساعة من بداية الدوام)", "Email a daily attendance summary to the HR approver (an hour after start time)")}</label>

      <fieldset className="hr-weekend" disabled={!canSave}>
        <legend>{T("أيام العطلة الأسبوعية", "Weekend days")}</legend>
        {[5, 6, 0, 1, 2, 3, 4].map((d) => (
          <label key={d} className="checkbox"><input type="checkbox" checked={weekend.includes(d)} onChange={(e) => setWeekend(e.target.checked ? [...weekend, d] : weekend.filter((x) => x !== d))} />{HR.weekday[d][ar ? 0 : 1]}</label>
        ))}
      </fieldset>
      {canSave ? <button className="btn btn-primary" disabled={pending} onClick={save}>{T("حفظ الإعدادات", "Save settings")}</button> : <p className="text-sec">{T("تعديل الإعدادات لمن لديه صلاحية الاعتماد.", "Only approvers can change these settings.")}</p>}
      {msg && <p className="col-ok">{msg}</p>}
      {err && <p className="mx-err">{err}</p>}
    </section>
  );
}
