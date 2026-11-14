"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { FilterBar, FilterSearch, FilterSelect } from "@/components/EntityFilterBar";
import { Modal } from "@/components/Modal";
import { rnAction, rnGet } from "@/lib/renewal-actions";

export type Renewal = {
  id: number; contract_id: number; contract_number?: string | null; stage: string; tenant_intent: string;
  end_date: string; days_left: number; bucket: "overdue" | "d30" | "d60" | "d90";
  building_id?: number | null; building?: string | null; unit?: string | null; owner?: string | null;
  tenant?: string | null; tenant_phone?: string | null; assignee_id?: number | null; assignee?: string | null;
  current_rent: number; proposed_rent?: number | null; change_pct?: number | null; unit_rent?: number | null;
  next_follow_up?: string | null; follow_up_due: boolean;
  owner_decision_by?: string | null; owner_decision_note?: string | null; lost_reason?: string | null;
  listing_id?: number | null; new_contract_number?: string | null;
  events?: { at: string; actor?: string | null; action: string; note?: string | null }[];
};
export type RnStats = {
  open: number; d30: number; overdue: number; no_contact: number; awaiting_owner: number; follow_ups_due: number;
  rent_at_stake: number; retention_pct: number | null; avg_change_pct: number | null; closed_12m: number;
};
type Opt = { id: number; name: string };

const STAGES = ["due", "contacted", "offer_sent", "awaiting_owner", "agreed"] as const;
const L = {
  stage: { due: ["لم يُتواصل بعد", "Not contacted"], contacted: ["تم التواصل", "Contacted"], offer_sent: ["عرض مُرسل", "Offer sent"], awaiting_owner: ["بانتظار المالك", "Waiting for owner"], agreed: ["تم الاتفاق", "Agreed"], renewed: ["جُدّد", "Renewed"], lost: ["لن يُجدّد", "Not renewing"] },
  intent: { unknown: ["غير معروف", "Unknown"], renew: ["يرغب بالتجديد", "Wants to renew"], undecided: ["متردد", "Undecided"], leave: ["سيغادر", "Leaving"] },
  lost: { price: ["السعر", "Price"], relocation: ["الانتقال لمكان آخر", "Moving away"], bought_home: ["شراء مسكن", "Bought a home"], dissatisfied: ["عدم الرضا", "Dissatisfied"], owner_ending: ["المالك لا يرغب بالتجديد", "Owner not renewing"], other: ["أخرى", "Other"] },
  action: { opened: ["فُتح الملف تلقائيًا", "Opened automatically"], assigned: ["أُسند", "Assigned"], contact_renew: ["تواصل: يرغب بالتجديد", "Contact: wants to renew"], contact_undecided: ["تواصل: متردد", "Contact: undecided"], contact_leave: ["تواصل: سيغادر", "Contact: leaving"], contact_unknown: ["محاولة تواصل", "Contact attempt"], offer: ["عرض تجديد", "Renewal offer"], owner_approval_requested: ["طُلبت موافقة المالك", "Owner approval requested"], owner_approved: ["وافق المالك", "Owner approved"], owner_rejected: ["رفض المالك", "Owner rejected"], agreed: ["تم الاتفاق", "Agreed"], renewed: ["جُدّد العقد", "Lease renewed"], lost: ["لن يُجدّد", "Not renewing"], listing_drafted: ["أُنشئ إعلان مسودة للوحدة", "Draft listing created"], note: ["ملاحظة", "Note"] },
} as const;

export function RenewalsClient({ locale, open, closed, stats, users, can }: {
  locale: string; open: Renewal[]; closed: Renewal[]; stats: RnStats; users: Opt[]; can: { edit: boolean; approve: boolean };
}) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const lbl = <K extends keyof typeof L>(k: K, v: string) => ((L[k] as Record<string, readonly [string, string]>)[v]?.[ar ? 0 : 1] ?? v);
  const router = useRouter();
  const nf = new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 });
  const sar = (n: number) => `${nf.format(n)} ${T("ر.س", "SAR")}`;
  const [view, setView] = useState<"board" | "closed">("board");
  const [q, setQ] = useState("");
  const [who, setWho] = useState("all");
  const [win, setWin] = useState("all");
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("open"));
    if (id) setOpenId(id);
  }, []);

  const match = (r: Renewal) => {
    const s = q.trim().toLowerCase();
    return (who === "all" || String(r.assignee_id ?? "") === who) && (win === "all" || r.bucket === win) &&
      (!s || `${r.contract_number ?? ""} ${r.building ?? ""} ${r.unit ?? ""} ${r.tenant ?? ""}`.toLowerCase().includes(s));
  };
  const board = useMemo(() => open.filter(match), [open, q, who, win]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = useMemo(() => closed.filter(match), [closed, q, who, win]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page screen-enter rn">
      <div className="page-header">
        <div>
          <h2 className="page-title">{T("تجديد العقود", "Lease renewals")}</h2>
          <div className="page-subtitle">{T("يُفتح ملف تجديد تلقائيًا قبل انتهاء كل عقد بـ90 يومًا ويُسند لمسؤول المبنى. خفض الإيجار يحتاج موافقة المالك.", "A renewal opens automatically 90 days before each lease ends and goes to the building's employee. A lower rent needs the owner's approval.")}</div>
        </div>
      </div>

      <div className="mx-kpis">
        <Kpi icon="event_upcoming" label={T("ملفات مفتوحة", "Open renewals")} value={nf.format(stats.open)} sub={T(`${nf.format(stats.d30)} تنتهي خلال 30 يومًا`, `${nf.format(stats.d30)} end within 30 days`)} tone={stats.d30 ? "warn" : "neutral"} />
        <Kpi icon="phone_missed" label={T("لم يُتواصل معهم", "Not contacted yet")} value={nf.format(stats.no_contact)} tone={stats.no_contact ? "warn" : "good"} />
        <Kpi icon="notifications_active" label={T("متابعات مستحقة اليوم", "Follow-ups due")} value={nf.format(stats.follow_ups_due)} tone={stats.follow_ups_due ? "warn" : "good"} />
        <Kpi icon="gavel" label={T("بانتظار المالك", "Waiting for owner")} value={nf.format(stats.awaiting_owner)} tone="neutral" />
        <Kpi icon="payments" label={T("إيجار سنوي قيد التجديد", "Annual rent up for renewal")} value={sar(stats.rent_at_stake)} tone={stats.overdue ? "bad" : "neutral"} sub={stats.overdue ? T(`${nf.format(stats.overdue)} عقود انتهت دون قرار`, `${nf.format(stats.overdue)} ended with no decision`) : undefined} />
        <Kpi icon="loyalty" label={T("نسبة التجديد (12 شهرًا)", "Renewal rate (12 months)")} value={stats.retention_pct == null ? "—" : `${nf.format(stats.retention_pct)}%`} sub={stats.avg_change_pct == null ? undefined : T(`متوسط تغيّر الإيجار ${stats.avg_change_pct > 0 ? "+" : ""}${stats.avg_change_pct}%`, `Avg rent change ${stats.avg_change_pct > 0 ? "+" : ""}${stats.avg_change_pct}%`)} tone={(stats.retention_pct ?? 100) >= 70 ? "good" : "warn"} />
      </div>

      <FilterBar
        statusRow={
          <div className="rn-tabs" role="tablist">
            <button role="tab" aria-selected={view === "board"} className={view === "board" ? "is-on" : ""} onClick={() => setView("board")}>{T("قيد المتابعة", "In progress")} <span>{nf.format(open.length)}</span></button>
            <button role="tab" aria-selected={view === "closed"} className={view === "closed" ? "is-on" : ""} onClick={() => setView("closed")}>{T("المغلقة", "Closed")} <span>{nf.format(closed.length)}</span></button>
          </div>
        }
        search={<FilterSearch value={q} onChange={setQ} placeholder={T("بحث بالعقد أو المبنى أو المستأجر…", "Search lease, building or tenant…")} />}
      >
        <FilterSelect label={T("ينتهي خلال", "Ends within")} value={win} onChange={setWin} options={[{ value: "all", label: T("الكل", "All") }, { value: "overdue", label: T("منتهي", "Already ended") }, { value: "d30", label: T("30 يومًا", "30 days") }, { value: "d60", label: T("60 يومًا", "60 days") }, { value: "d90", label: T("90 يومًا", "90 days") }]} />
        <FilterSelect label={T("المسؤول", "Assignee")} value={who} onChange={setWho} options={[{ value: "all", label: T("الجميع", "Everyone") }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]} />
      </FilterBar>

      {view === "board" ? (
        open.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><span className="ms">event_available</span></div>
            <div className="empty-title">{T("لا توجد عقود تنتهي خلال 90 يومًا", "No leases end in the next 90 days")}</div>
            <div className="empty-sub">{T("ستظهر هنا تلقائيًا عند اقتراب موعد انتهائها.", "They appear here automatically as their end date approaches.")}</div>
          </div>
        ) : (
          <div className="rn-board">
            {STAGES.map((s) => {
              const items = board.filter((r) => r.stage === s);
              return (
                <section key={s} className="rn-col" aria-label={lbl("stage", s)}>
                  <header><span>{lbl("stage", s)}</span><b>{nf.format(items.length)}</b></header>
                  {items.map((r) => (
                    <button key={r.id} className={`rn-card rn-card--${r.bucket}`} onClick={() => setOpenId(r.id)}>
                      <span className={`rn-days rn-days--${r.bucket}`}>{r.days_left < 0 ? T(`انتهى منذ ${nf.format(-r.days_left)} يوم`, `Ended ${nf.format(-r.days_left)}d ago`) : T(`باقي ${nf.format(r.days_left)} يوم`, `${nf.format(r.days_left)} days left`)}</span>
                      <strong>{r.tenant || "—"}</strong>
                      <span className="rn-meta">{r.building}{r.unit ? ` · ${T("وحدة", "Unit")} ${r.unit}` : ""}</span>
                      <span className="rn-rent">
                        {sar(r.current_rent)}
                        {r.proposed_rent != null && r.change_pct != null && <em dir="ltr" className={r.change_pct < 0 ? "down" : "up"}>{r.change_pct > 0 ? "+" : ""}{r.change_pct}%</em>}
                      </span>
                      <span className="rn-foot">
                        <span>{r.assignee || T("غير مُسند", "Unassigned")}</span>
                        {r.follow_up_due && <span className="rn-flag"><span className="ms ms-sm">notifications_active</span>{T("متابعة اليوم", "Follow up")}</span>}
                      </span>
                    </button>
                  ))}
                </section>
              );
            })}
          </div>
        )
      ) : (
        <div className="card card-tight">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{T("العقد", "Lease")}</th><th>{T("المستأجر", "Tenant")}</th><th>{T("النتيجة", "Outcome")}</th><th>{T("الإيجار", "Rent")}</th><th>{T("الانتهاء", "Ended")}</th></tr></thead>
              <tbody>
                {done.map((r) => (
                  <tr key={r.id} className="mx-row" onClick={() => setOpenId(r.id)}>
                    <td><strong>{r.contract_number}</strong><div className="text-sec" style={{ fontSize: 12 }}>{r.building} · {r.unit}</div></td>
                    <td>{r.tenant}</td>
                    <td><span className={`mx-status ${r.stage === "renewed" ? "mx-status--completed" : "mx-status--rejected"}`}>{lbl("stage", r.stage)}</span>{r.lost_reason && <div className="text-sec" style={{ fontSize: 12 }}>{lbl("lost", r.lost_reason)}</div>}</td>
                    <td>{sar(r.proposed_rent ?? r.current_rent)}{r.change_pct != null && r.stage === "renewed" && <span className="text-sec" dir="ltr"> ({r.change_pct > 0 ? "+" : ""}{r.change_pct}%)</span>}</td>
                    <td className="text-sec">{r.end_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {openId != null && <Drawer id={openId} locale={locale} users={users} can={can} lbl={lbl} sar={sar} onClose={() => { setOpenId(null); router.refresh(); }} />}
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon: string; label: string; value: string; sub?: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <div className={`mx-kpi is-${tone}`}>
      <span className="ms mx-kpi__ico" aria-hidden>{icon}</span>
      <span className="mx-kpi__label">{label}</span>
      <strong className="mx-kpi__value">{value}</strong>
      {sub && <span className="mx-kpi__sub">{sub}</span>}
    </div>
  );
}

function Drawer({ id, locale, users, can, lbl, sar, onClose }: {
  id: number; locale: string; users: Opt[]; can: { edit: boolean; approve: boolean };
  lbl: <K extends keyof typeof L>(k: K, v: string) => string; sar: (n: number) => string; onClose: () => void;
}) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [r, setR] = useState<Renewal | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "contact" | "offer" | "decide" | "renewed" | "lost" | "assign">(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const v = (k: string) => f[k] ?? "";
  const set = (k: string, x: string) => setF((o) => ({ ...o, [k]: x }));
  const dtf = new Intl.DateTimeFormat(ar ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  useEffect(() => { rnGet(id, locale).then((x) => (x.ok ? setR(x.data as Renewal) : setErr(x.error))); }, [id, locale]);

  function act(a: Parameters<typeof rnAction>[1], body: Record<string, unknown>) {
    setErr(null);
    start(async () => {
      const x = await rnAction(id, a, body, locale);
      if (!x.ok) return setErr(x.error);
      setR(x.data as Renewal);
      setPanel(null);
      setF({});
    });
  }

  if (!r) return <Modal open onClose={onClose} title="…">{err ? <p className="mx-err">{err}</p> : <p className="text-sec">{T("جارٍ التحميل…", "Loading…")}</p>}</Modal>;
  const st = r.stage;
  const isOpen = !["renewed", "lost"].includes(st);
  const steps = ["due", "contacted", "offer_sent", "agreed", "renewed"];
  const cur = steps.indexOf(st === "awaiting_owner" ? "offer_sent" : st === "lost" ? "renewed" : st);

  return (
    <Modal open onClose={onClose} size="lg" title={`${r.tenant || "—"} — ${r.contract_number ?? ""}`} subtitle={`${r.building ?? ""}${r.unit ? ` · ${T("وحدة", "Unit")} ${r.unit}` : ""}${r.owner ? ` · ${T("المالك", "Owner")}: ${r.owner}` : ""}`}>
      <div className="mx-detail">
        <div className="mx-chips">
          <span className={`mx-status ${st === "renewed" ? "mx-status--completed" : st === "lost" ? "mx-status--rejected" : st === "awaiting_owner" ? "mx-status--awaiting_approval" : "mx-status--assigned"}`}>{lbl("stage", st)}</span>
          <span className={`rn-days rn-days--${r.bucket}`}>{r.days_left < 0 ? T(`انتهى منذ ${-r.days_left} يوم`, `Ended ${-r.days_left} days ago`) : T(`ينتهي ${r.end_date} · باقي ${r.days_left} يوم`, `Ends ${r.end_date} · ${r.days_left} days left`)}</span>
          <span className="mx-chip">{lbl("intent", r.tenant_intent)}</span>
        </div>
        {st !== "lost" && (
          <ol className="mx-steps">{steps.map((s, i) => <li key={s} className={i < cur || st === "renewed" ? "is-done" : i === cur ? "is-current" : ""}>{lbl("stage", s)}</li>)}</ol>
        )}
        <dl className="mx-facts">
          <div><dt>{T("الإيجار السنوي الحالي", "Current annual rent")}</dt><dd>{sar(r.current_rent)}</dd></div>
          <div><dt>{T("الإيجار المقترح", "Proposed rent")}</dt><dd>{r.proposed_rent != null ? <>{sar(r.proposed_rent)}{r.change_pct != null && <span dir="ltr" className={`rn-chg ${r.change_pct < 0 ? "down" : "up"}`}> {r.change_pct > 0 ? "+" : ""}{r.change_pct}%</span>}</> : "—"}</dd></div>
          <div><dt>{T("سعر الوحدة المسجّل", "Unit list rent")}</dt><dd>{r.unit_rent ? sar(r.unit_rent) : "—"}</dd></div>
          <div><dt>{T("جوال المستأجر", "Tenant phone")}</dt><dd>{r.tenant_phone ? <a href={`https://wa.me/${r.tenant_phone.replace(/\D/g, "").replace(/^0/, "966")}`} target="_blank" rel="noreferrer" dir="ltr">{r.tenant_phone}</a> : "—"}</dd></div>
          <div><dt>{T("المسؤول", "Assignee")}</dt><dd>{r.assignee || "—"}</dd></div>
          <div><dt>{T("المتابعة القادمة", "Next follow-up")}</dt><dd>{r.next_follow_up || "—"}</dd></div>
          {r.owner_decision_by && <div><dt>{T("قرار المالك", "Owner decision")}</dt><dd>{r.owner_decision_by}{r.owner_decision_note ? ` — ${r.owner_decision_note}` : ""}</dd></div>}
          {r.lost_reason && <div><dt>{T("سبب عدم التجديد", "Reason")}</dt><dd>{lbl("lost", r.lost_reason)}{r.listing_id ? ` · ${T("أُنشئ إعلان مسودة", "draft listing created")}` : ""}</dd></div>}
          {r.new_contract_number && <div><dt>{T("العقد الجديد", "New lease")}</dt><dd>{r.new_contract_number}</dd></div>}
        </dl>

        {can.edit && isOpen && (
          <div className="mx-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setPanel("contact")}><span className="ms ms-sm">call</span>{T("تسجيل تواصل", "Log contact")}</button>
            {st !== "agreed" && <button className="btn btn-secondary btn-sm" onClick={() => setPanel("offer")}><span className="ms ms-sm">request_quote</span>{T("عرض تجديد", "Renewal offer")}</button>}
            {st === "awaiting_owner" && can.approve && <button className="btn btn-primary btn-sm" onClick={() => setPanel("decide")}><span className="ms ms-sm">gavel</span>{T("قرار نيابة عن المالك", "Record owner decision")}</button>}
            {["contacted", "offer_sent"].includes(st) && <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => act("agree", {})}><span className="ms ms-sm">handshake</span>{T("تم الاتفاق", "Mark agreed")}</button>}
            {st === "agreed" && <button className="btn btn-primary btn-sm" onClick={() => setPanel("renewed")}><span className="ms ms-sm">task_alt</span>{T("تم توقيع التجديد", "Renewal signed")}</button>}
            <button className="btn btn-secondary btn-sm" onClick={() => setPanel("assign")}><span className="ms ms-sm">person_add</span>{T("إسناد", "Assign")}</button>
            <button className="btn btn-ghost btn-sm mx-danger" onClick={() => setPanel("lost")}>{T("لن يُجدّد", "Not renewing")}</button>
          </div>
        )}

        {panel === "contact" && (
          <div className="mx-panel">
            <label className="field"><span>{T("رغبة المستأجر", "Tenant intent")}</span>
              <select className="select" value={v("intent") || "renew"} onChange={(e) => set("intent", e.target.value)}>
                {(["renew", "undecided", "leave", "unknown"] as const).map((k) => <option key={k} value={k}>{k === "unknown" ? T("لم يُرد", "No answer") : lbl("intent", k)}</option>)}
              </select>
            </label>
            <label className="field"><span>{T("المتابعة القادمة", "Next follow-up")}</span><input className="input" type="date" value={v("next")} onChange={(e) => set("next", e.target.value)} /></label>
            <label className="field"><span>{T("ملاحظة", "Note")}</span><input className="input" value={v("note")} onChange={(e) => set("note", e.target.value)} /></label>
            <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => act("contact", { tenant_intent: v("intent") || "renew", note: v("note") || null, next_follow_up: v("next") || null })}>{T("حفظ", "Save")}</button>
          </div>
        )}
        {panel === "offer" && (
          <div className="mx-panel">
            <label className="field"><span>{T("الإيجار السنوي المقترح (ر.س)", "Proposed annual rent (SAR)")}</span><input className="input" type="number" min={0} dir="ltr" value={v("rent")} placeholder={String(r.current_rent)} onChange={(e) => set("rent", e.target.value)} /></label>
            <label className="field"><span>{T("ملاحظة", "Note")}</span><input className="input" value={v("note")} onChange={(e) => set("note", e.target.value)} /></label>
            <p className="mx-hint text-sec">{T("إذا كان الإيجار المقترح أقل من الحالي، يُرسل للمالك للموافقة.", "If the proposed rent is lower than today's, it goes to the owner for approval.")}</p>
            <button className="btn btn-primary btn-sm" disabled={pending || !v("rent")} onClick={() => act("offer", { proposed_rent: Number(v("rent")), note: v("note") || null })}>{T("حفظ العرض", "Save offer")}</button>
          </div>
        )}
        {panel === "decide" && (
          <div className="mx-panel">
            <label className="field"><span>{T("ملاحظة (مثلًا: وافق المالك هاتفيًا)", "Note (e.g. owner approved by phone)")}</span><input className="input" value={v("note")} onChange={(e) => set("note", e.target.value)} /></label>
            <div className="mx-row"><button className="btn btn-primary btn-sm" disabled={pending} onClick={() => act("decision", { approve: true, note: v("note") || null })}>{T("موافقة", "Approve")}</button><button className="btn btn-danger btn-sm" disabled={pending} onClick={() => act("decision", { approve: false, note: v("note") || null })}>{T("رفض", "Reject")}</button></div>
          </div>
        )}
        {panel === "renewed" && (
          <div className="mx-panel">
            <label className="field"><span>{T("رقم العقد الجديد (اختياري)", "New lease number (optional)")}</span><input className="input" dir="ltr" value={v("num")} onChange={(e) => set("num", e.target.value)} /></label>
            <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => act("renewed", { new_contract_number: v("num") || null })}>{T("إغلاق كمُجدّد", "Close as renewed")}</button>
          </div>
        )}
        {panel === "lost" && (
          <div className="mx-panel">
            <label className="field"><span>{T("السبب", "Reason")}</span>
              <select className="select" value={v("reason") || "price"} onChange={(e) => set("reason", e.target.value)}>{Object.keys(L.lost).map((k) => <option key={k} value={k}>{lbl("lost", k)}</option>)}</select>
            </label>
            <label className="field"><span>{T("ملاحظة", "Note")}</span><input className="input" value={v("note")} onChange={(e) => set("note", e.target.value)} /></label>
            <label className="checkbox"><input type="checkbox" checked={v("listing") !== "0"} onChange={(e) => set("listing", e.target.checked ? "1" : "0")} /> {T("إنشاء إعلان مسودة للوحدة على الموقع لبدء التسويق مبكرًا", "Create a draft website listing for the unit to start marketing early")}</label>
            <button className="btn btn-danger btn-sm" disabled={pending} onClick={() => act("lost", { reason: v("reason") || "price", note: v("note") || null, create_listing: v("listing") !== "0" })}>{T("إغلاق الملف", "Close renewal")}</button>
          </div>
        )}
        {panel === "assign" && (
          <div className="mx-panel">
            <label className="field"><span>{T("الموظف", "Employee")}</span><select className="select" value={v("who") || String(r.assignee_id ?? "")} onChange={(e) => set("who", e.target.value)}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
            <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => act("assign", { assignee_id: Number(v("who") || r.assignee_id) || null })}>{T("حفظ", "Save")}</button>
          </div>
        )}
        {err && <p className="mx-err">{err}</p>}

        <h4 className="mx-h">{T("سجل المتابعة", "Activity")}</h4>
        <ol className="mx-timeline">
          {(r.events ?? []).slice().reverse().map((e, i) => (
            <li key={i}><span className="mx-dot" aria-hidden /><div>
              <strong>{lbl("action", e.action)}</strong>{e.note && e.action !== "opened" && <span> — {e.note}</span>}
              <div className="text-sec" style={{ fontSize: 12 }}>{e.actor === "system" ? T("النظام", "System") : e.actor} · {dtf.format(new Date(e.at + "Z"))}</div>
            </div></li>
          ))}
        </ol>
        {can.edit && (
          <div className="mx-row">
            <input className="input" placeholder={T("أضف ملاحظة…", "Add a note…")} value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn-secondary btn-sm" disabled={pending || !note.trim()} onClick={() => { act("notes", { note: note.trim() }); setNote(""); }}>{T("إضافة", "Add")}</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
