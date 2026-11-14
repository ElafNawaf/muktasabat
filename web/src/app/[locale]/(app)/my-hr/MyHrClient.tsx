"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { RequestDrawer, RequestModal } from "@/components/hr/HrForms";
import { geoErrorText, getPosition } from "@/lib/geo";
import { hrCheckIn, hrCheckOut, hrMyAttendance } from "@/lib/hr-actions";
import { HR, hl, mins, statusClass, type Balance, type DayStatus, type HrReq } from "@/lib/hr-labels";

export type MyHr = {
  user: { id: number; name: string; job_title?: string | null; department?: string | null; employee_no?: string | null; hire_date?: string | null;
    ticket_entitlement: string; ticket_destination?: string | null; ticket_class: string; ticket_family_members: number };
  balance: Balance; today: DayStatus; work: { start: string; end: string; grace: number; weekend: number[]; mode: string };
  location: { mode_today: "office" | "remote" | "field"; via?: string | null; radius: number; enforce: boolean; office_lat: number; office_lng: number };
  approver?: string | null; requests: HrReq[]; colleagues: { id: number; name: string }[];
};

export function MyHrClient({ locale, data, days: initialDays, month: m0, meId }: { locale: string; data: MyHr; days: (DayStatus & { day: string })[]; month: string; meId: number }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const [newKind, setNewKind] = useState<null | "leave" | "permission" | "ticket" | "work_location">(null);
  const [locating, setLocating] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("new") === "work_location") setNewKind("work_location"); }, []);
  const [openId, setOpenId] = useState<number | null>(null);
  const [month, setMonth] = useState(m0);
  const [days, setDays] = useState(initialDays);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const t = data.today;
  const b = data.balance;
  const pct = b.entitlement ? Math.min(100, ((b.used + b.pending) / b.entitlement) * 100) : 0;

  const loc = data.location;
  const needLoc = loc.mode_today === "office" && loc.enforce;
  const clock = (fn: typeof hrCheckIn) => start(async () => {
    setErr(null); setInfo(null);
    setLocating(true);
    const g = await getPosition();
    setLocating(false);
    if (!g.ok && needLoc) return setErr(geoErrorText(g.error, ar));
    const r = await fn(g.ok ? g.pos : { error: g.error });
    if (!r.ok) return setErr(r.error);
    const res = r.data as { distance?: number | null; verified_minutes?: number; away?: boolean };
    if (res.away) setInfo(T("سُجّل الانصراف بعيدًا عن المكتب؛ تُحتسب ساعاتك حتى آخر وقت كنت فيه في المكتب.", "You checked out away from the office; your hours count until the last time you were seen there."));
    else if (res.distance != null) setInfo(T(`تم. المسافة عن المكتب ${Math.round(res.distance)} م.`, `Done. ${Math.round(res.distance)} m from the office.`));
    router.refresh();
    const d = await hrMyAttendance(month);
    if (d.ok) setDays(d.data as typeof days);
  });
  const changeMonth = (m: string) => { setMonth(m); hrMyAttendance(m).then((d) => d.ok && setDays(d.data as typeof days)); };
  const lead = days.length ? (new Date(days[0].day + "T00:00:00").getDay() + 1) % 7 : 0; // grid starts Saturday

  return (
    <div className="page screen-enter hr">
      <div className="page-header">
        <div>
          <h2 className="page-title">{T("خدماتي الوظيفية", "My HR")}</h2>
          <div className="page-subtitle">{[data.user.job_title, data.user.department, data.user.employee_no && `#${data.user.employee_no}`].filter(Boolean).join(" · ") || data.user.name}</div>
        </div>
        <div className="hr-new">
          <button className="btn btn-primary" onClick={() => setNewKind("leave")}><span className="ms">beach_access</span>{T("طلب إجازة", "Request leave")}</button>
          <button className="btn btn-secondary" onClick={() => setNewKind("permission")}><span className="ms">schedule</span>{T("استئذان", "Permission")}</button>
          <button className="btn btn-secondary" onClick={() => setNewKind("work_location")}><span className="ms">home_work</span>{T("عن بُعد / ميداني", "Remote / field")}</button>
          <button className="btn btn-secondary" onClick={() => setNewKind("ticket")}><span className="ms">flight</span>{T("تذكرة سفر", "Travel ticket")}</button>
        </div>
      </div>

      <div className="hr-top">
        <section className={`hr-clock hr-clock--${t.status}`}>
          <div className="hr-clock__head">
            <span className="ms" aria-hidden>badge</span>
            <div><strong>{T("حضور اليوم", "Today")}</strong><span>{T(`الدوام ${data.work.start} – ${data.work.end}`, `Hours ${data.work.start} – ${data.work.end}`)}</span></div>
            <span className={`hr-day hr-day--${t.status}`}>{hl(ar, HR.day, t.status)}{t.late_minutes ? ` · ${mins(t.late_minutes, ar)}` : ""}</span>
          </div>
          <p className={`hr-where hr-where--${loc.mode_today}`}>
            <span className="ms ms-sm" aria-hidden>{loc.mode_today === "office" ? "location_on" : loc.mode_today === "field" ? "directions_car" : "home"}</span>
            {loc.mode_today === "office"
              ? (loc.enforce ? T(`اليوم من المكتب: يُسجَّل الحضور ضمن ${loc.radius} م من المقر.`, `Office day: check in within ${loc.radius} m of headquarters.`) : T("اليوم من المكتب.", "Office day."))
              : loc.mode_today === "field" ? T(`عمل ميداني معتمد${loc.via ? ` (${loc.via})` : ""}: يمكنك التسجيل من أي مكان.`, `Approved field work${loc.via ? ` (${loc.via})` : ""}: check in from anywhere.`)
              : T(`عمل عن بُعد${loc.via ? ` معتمد (${loc.via})` : ""}: يمكنك التسجيل من أي مكان.`, `Remote day${loc.via ? `, approved (${loc.via})` : ""}: check in from anywhere.`)}
          </p>
          <div className="hr-clock__times">
            <div><span>{T("الحضور", "Check in")}</span><strong dir="ltr">{t.check_in ?? "--:--"}</strong></div>
            <div><span>{T("الانصراف", "Check out")}</span><strong dir="ltr">{t.check_out ?? "--:--"}</strong></div>
            <div><span>{T("الساعات الفعلية", "Actual hours")}</span><strong>{t.verified_minutes != null ? mins(t.verified_minutes, ar) : "—"}</strong></div>
          </div>
          {t.status !== "on_leave" && (
            !t.check_in
              ? <button className="btn btn-primary hr-clock__btn" disabled={pending} onClick={() => clock(hrCheckIn)}><span className="ms">login</span>{locating ? T("جارٍ تحديد موقعك…", "Finding your location…") : T("تسجيل الحضور", "Check in")}</button>
              : !t.check_out
                ? <button className="btn btn-secondary hr-clock__btn" disabled={pending} onClick={() => clock(hrCheckOut)}><span className="ms">logout</span>{locating ? T("جارٍ تحديد موقعك…", "Finding your location…") : T("تسجيل الانصراف", "Check out")}</button>
                : <p className="text-sec">{T("سُجّل حضورك وانصرافك اليوم.", "You're checked in and out for today.")}</p>
          )}
          {(t.flags ?? []).map((f) => <p key={f} className="hr-flag"><span className="ms ms-sm" aria-hidden>warning</span>{hl(ar, HR.flag, f)}{f === "left_area" && t.outside_since ? T(` منذ ${t.outside_since}`, ` since ${t.outside_since}`) : ""}</p>)}
          {!!t.away_minutes && <p className="text-sec hr-note">{T(`وقت خارج المكتب اليوم: ${mins(t.away_minutes, true)} (غير محتسب)`, `Time away from the office today: ${mins(t.away_minutes, false)} (not counted)`)}</p>}
          {info && <p className="col-ok">{info}</p>}
          {err && <p className="mx-err">{err}</p>}
          {err && needLoc && <button className="btn btn-ghost btn-sm" onClick={() => setNewKind("work_location")}>{T("لست في المكتب؟ قدّم طلب عمل عن بُعد / ميداني", "Not at the office? Request remote or field work")}</button>}
        </section>

        <section className="hr-bal">
          <div className="hr-bal__main">
            <span>{T(`رصيد الإجازة السنوية ${b.year}`, `Annual leave ${b.year}`)}</span>
            <strong>{b.remaining}<small> / {b.entitlement} {T("يوم", "days")}</small></strong>
            <div className="hr-meter" aria-hidden><i style={{ width: `${pct}%` }} /></div>
            <p className="text-sec">{T(`مستخدم ${b.used} · قيد الاعتماد ${b.pending}`, `${b.used} used · ${b.pending} pending`)}</p>
          </div>
          <div className="hr-bal__row">
            <div><span>{T("استئذانات هذا الشهر", "Permissions this month")}</span><strong>{mins(b.permission_minutes_month, ar)}<small> / {mins(b.permission_minutes_cap, ar)}</small></strong></div>
            <div><span>{T("تذكرة السفر", "Ticket entitlement")}</span><strong>{hl(ar, HR.ticketEnt, data.user.ticket_entitlement)}</strong>
              {data.user.ticket_entitlement !== "none" && <small className="text-sec">{[data.user.ticket_destination, hl(ar, HR.cls, data.user.ticket_class), data.user.ticket_family_members ? T(`+${data.user.ticket_family_members} مرافقين`, `+${data.user.ticket_family_members} family`) : null].filter(Boolean).join(" · ")}</small>}
            </div>
          </div>
        </section>
      </div>

      <section className="card hr-sec">
        <header className="hr-sec__head"><h3>{T("طلباتي", "My requests")}</h3></header>
        {data.requests.length === 0 ? <p className="text-sec">{T("لم تقدّم أي طلب بعد.", "You haven't made any requests yet.")}</p> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{T("الطلب", "Request")}</th><th>{T("التفاصيل", "Details")}</th><th>{T("الحالة", "Status")}</th><th>{T("التاريخ", "Submitted")}</th></tr></thead>
              <tbody>
                {data.requests.map((r) => (
                  <tr key={r.id} className="mx-row" tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(r.id)}>
                    <td><strong>{hl(ar, HR.kind, r.kind)}</strong><div className="text-sec" style={{ fontSize: 12 }}>{r.number}</div></td>
                    <td>{r.summary}</td>
                    <td><span className={`mx-status ${statusClass(r.status)}`}>{hl(ar, HR.status, r.status)}</span></td>
                    <td className="text-sec">{r.created_at.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card hr-sec">
        <header className="hr-sec__head">
          <h3>{T("سجل حضوري", "My attendance")}</h3>
          <input className="input hr-month" type="month" value={month} max={m0} onChange={(e) => e.target.value && changeMonth(e.target.value)} />
        </header>
        <div className="hr-cal" role="grid">
          {[5, 6, 0, 1, 2, 3, 4].map((w) => <div key={w} className="hr-cal__wd">{HR.weekday[w][ar ? 0 : 1]}</div>)}
          {Array.from({ length: lead }).map((_, i) => <div key={`x${i}`} />)}
          {days.map((d) => (
            <div key={d.day} className={`hr-cal__d hr-cal__d--${d.status}`} title={`${d.day} · ${hl(ar, HR.day, d.status)}${d.check_in ? ` · ${d.check_in}–${d.check_out ?? ""}` : ""}`}>
              <b>{Number(d.day.slice(8))}</b>
              <span dir="ltr">{d.check_in ? `${d.check_in}${d.check_out ? `–${d.check_out}` : ""}` : d.status === "on_leave" ? hl(ar, HR.day, "on_leave") : ""}</span>
            </div>
          ))}
        </div>
        <div className="hr-legend">{(["present", "late", "absent", "on_leave", "weekend"] as const).map((k) => <span key={k}><i className={`hr-cal__d--${k}`} />{hl(ar, HR.day, k)}</span>)}</div>
      </section>

      {newKind && (
        <RequestModal locale={locale} kind={newKind} colleagues={data.colleagues}
          leaves={data.requests.filter((r) => r.kind === "leave" && ["pending", "approved"].includes(r.status))}
          defaults={{ to_city: data.user.ticket_destination, travel_class: data.user.ticket_class, travellers: 1 + (data.user.ticket_family_members || 0) }}
          onClose={() => setNewKind(null)} onDone={(r) => { setNewKind(null); router.refresh(); setOpenId(r.id); }} />
      )}
      {openId != null && <RequestDrawer id={openId} locale={locale} meId={meId} can={{}} onClose={() => { setOpenId(null); router.refresh(); }} />}
    </div>
  );
}
