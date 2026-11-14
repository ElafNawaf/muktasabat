"use client";

import { useEffect, useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { hrBook, hrCancel, hrCreate, hrDecide, hrGet } from "@/lib/hr-actions";
import { HR, hl, statusClass, type HrReq } from "@/lib/hr-labels";

type Opt = { id: number; name: string };

/* ───────── New request ───────── */
export function RequestModal({ locale, kind, onClose, onDone, employees, colleagues, leaves, defaults }: {
  locale: string; kind: "leave" | "permission" | "ticket"; onClose: () => void; onDone: (r: HrReq) => void;
  employees?: Opt[]; colleagues?: Opt[]; leaves?: HrReq[];
  defaults?: { to_city?: string | null; travel_class?: string | null; travellers?: number };
}) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<Record<string, string>>({
    leave_type: "annual", permission_type: "early_leave", ticket_purpose: "annual_leave", start_date: today, round_trip: "1",
    travellers: String(defaults?.travellers ?? 1), to_city: defaults?.to_city ?? "", from_city: ar ? "الرياض" : "Riyadh",
    travel_class: defaults?.travel_class ?? "economy",
  });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const v = (k: string) => f[k] ?? "";
  const set = (k: string, x: string) => setF((o) => ({ ...o, [k]: x }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const body: Record<string, unknown> = { kind, start_date: v("start_date"), reason: v("reason") || null };
    if (v("user_id")) body.user_id = Number(v("user_id"));
    if (kind === "leave") Object.assign(body, { leave_type: v("leave_type"), end_date: v("end_date") || v("start_date"), delegate_user_id: v("delegate") ? Number(v("delegate")) : null });
    if (kind === "permission") Object.assign(body, { permission_type: v("permission_type"), from_time: v("from_time"), to_time: v("to_time") });
    if (kind === "ticket") Object.assign(body, {
      ticket_purpose: v("ticket_purpose"), from_city: v("from_city"), to_city: v("to_city"), return_date: v("round_trip") === "1" ? v("return_date") || null : null,
      round_trip: v("round_trip") === "1", travellers: Number(v("travellers") || 1), travel_class: v("travel_class"),
      estimated_cost: v("estimated_cost") ? Number(v("estimated_cost")) : null, leave_request_id: v("leave_id") ? Number(v("leave_id")) : null,
    });
    start(async () => {
      const r = await hrCreate(body, locale);
      if (!r.ok) return setErr(r.error);
      onDone(r.data as HrReq);
    });
  }
  const title = kind === "leave" ? T("طلب إجازة", "Request leave") : kind === "permission" ? T("طلب استئذان", "Request permission") : T("طلب تذكرة سفر", "Request a travel ticket");
  const hint = kind === "permission"
    ? T("الاستئذان: خروج أو تأخر لساعات خلال يوم عمل.", "A permission covers a few hours of a working day (late arrival, early leave, or stepping out).")
    : T("يُرسل الطلب لمدير الموارد البشرية للاعتماد، مع نسخة للرئيس التنفيذي.", "Goes to the HR manager for approval, with the CEO copied.");

  return (
    <Modal open onClose={onClose} title={title} subtitle={hint}
      footer={<><button className="btn btn-secondary" type="button" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" form="hr-new" disabled={pending}>{pending ? "…" : T("إرسال الطلب", "Submit request")}</button></>}>
      <form id="hr-new" className="mx-form" onSubmit={submit}>
        {employees && (
          <label className="field"><span>{T("الموظف (اتركه فارغًا لنفسك)", "Employee (leave empty for yourself)")}</span>
            <select className="select" value={v("user_id")} onChange={(e) => set("user_id", e.target.value)}><option value="">{T("أنا", "Me")}</option>{employees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </label>
        )}
        {kind === "leave" && (
          <div className="mx-grid2">
            <label className="field"><span>{T("نوع الإجازة", "Leave type")}</span>
              <select className="select" value={v("leave_type")} onChange={(e) => set("leave_type", e.target.value)}>{Object.keys(HR.leave).map((k) => <option key={k} value={k}>{hl(ar, HR.leave, k)}</option>)}</select>
            </label>
            <label className="field"><span>{T("القائم بالأعمال (اختياري)", "Covering colleague (optional)")}</span>
              <select className="select" value={v("delegate")} onChange={(e) => set("delegate", e.target.value)}><option value="">—</option>{(colleagues ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            </label>
            <label className="field"><span>{T("من", "From")}</span><input className="input" type="date" required value={v("start_date")} onChange={(e) => set("start_date", e.target.value)} /></label>
            <label className="field"><span>{T("إلى", "To")}</span><input className="input" type="date" required min={v("start_date")} value={v("end_date")} onChange={(e) => set("end_date", e.target.value)} /></label>
          </div>
        )}
        {kind === "permission" && (
          <div className="mx-grid2">
            <label className="field"><span>{T("النوع", "Type")}</span>
              <select className="select" value={v("permission_type")} onChange={(e) => set("permission_type", e.target.value)}>{Object.keys(HR.permission).map((k) => <option key={k} value={k}>{hl(ar, HR.permission, k)}</option>)}</select>
            </label>
            <label className="field"><span>{T("التاريخ", "Date")}</span><input className="input" type="date" required value={v("start_date")} onChange={(e) => set("start_date", e.target.value)} /></label>
            <label className="field"><span>{T("من الساعة", "From")}</span><input className="input" type="time" required value={v("from_time")} onChange={(e) => set("from_time", e.target.value)} /></label>
            <label className="field"><span>{T("إلى الساعة", "To")}</span><input className="input" type="time" required value={v("to_time")} onChange={(e) => set("to_time", e.target.value)} /></label>
          </div>
        )}
        {kind === "ticket" && (
          <div className="mx-grid2">
            <label className="field"><span>{T("الغرض", "Purpose")}</span>
              <select className="select" value={v("ticket_purpose")} onChange={(e) => set("ticket_purpose", e.target.value)}>{Object.keys(HR.purpose).map((k) => <option key={k} value={k}>{hl(ar, HR.purpose, k)}</option>)}</select>
            </label>
            {leaves && leaves.length > 0 && (
              <label className="field"><span>{T("مرتبطة بإجازة", "Linked leave")}</span>
                <select className="select" value={v("leave_id")} onChange={(e) => { set("leave_id", e.target.value); const l = leaves.find((x) => String(x.id) === e.target.value); if (l) { set("start_date", l.start_date ?? ""); set("return_date", l.end_date ?? ""); } }}>
                  <option value="">—</option>{leaves.map((l) => <option key={l.id} value={l.id}>{l.number} · {l.start_date} → {l.end_date}</option>)}
                </select>
              </label>
            )}
            <label className="field"><span>{T("من مدينة", "From")}</span><input className="input" required value={v("from_city")} onChange={(e) => set("from_city", e.target.value)} /></label>
            <label className="field"><span>{T("إلى مدينة", "To")}</span><input className="input" required value={v("to_city")} onChange={(e) => set("to_city", e.target.value)} /></label>
            <label className="field"><span>{T("تاريخ الذهاب", "Departure")}</span><input className="input" type="date" required value={v("start_date")} onChange={(e) => set("start_date", e.target.value)} /></label>
            <label className="field"><span>{T("نوع الرحلة", "Trip")}</span>
              <select className="select" value={v("round_trip")} onChange={(e) => set("round_trip", e.target.value)}><option value="1">{T("ذهاب وعودة", "Return")}</option><option value="0">{T("ذهاب فقط", "One way")}</option></select>
            </label>
            {v("round_trip") === "1" && <label className="field"><span>{T("تاريخ العودة", "Return")}</span><input className="input" type="date" min={v("start_date")} value={v("return_date")} onChange={(e) => set("return_date", e.target.value)} /></label>}
            <label className="field"><span>{T("عدد المسافرين", "Travellers")}</span><input className="input" type="number" min={1} max={12} value={v("travellers")} onChange={(e) => set("travellers", e.target.value)} /></label>
            <label className="field"><span>{T("الدرجة", "Class")}</span>
              <select className="select" value={v("travel_class")} onChange={(e) => set("travel_class", e.target.value)}>{Object.keys(HR.cls).map((k) => <option key={k} value={k}>{hl(ar, HR.cls, k)}</option>)}</select>
            </label>
            <label className="field"><span>{T("التكلفة التقديرية (اختياري)", "Estimated cost (optional)")}</span><input className="input" type="number" min={0} dir="ltr" value={v("estimated_cost")} onChange={(e) => set("estimated_cost", e.target.value)} /></label>
          </div>
        )}
        <label className="field"><span>{T("السبب / ملاحظات", "Reason / notes")}</span><textarea className="textarea" rows={2} maxLength={2000} value={v("reason")} onChange={(e) => set("reason", e.target.value)} /></label>
        {err && <p className="mx-err">{err}</p>}
      </form>
    </Modal>
  );
}

/* ───────── Request detail ───────── */
export function RequestDrawer({ id, locale, onClose, can, meId }: {
  id: number; locale: string; onClose: () => void; can: { approve?: boolean; edit?: boolean }; meId: number;
}) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [r, setR] = useState<HrReq | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [book, setBook] = useState({ ref: "", cost: "" });
  const [pending, start] = useTransition();
  const nf = new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 });
  useEffect(() => { hrGet(id, locale).then((x) => (x.ok ? setR(x.data as HrReq) : setErr(x.error))); }, [id, locale]);
  const run = (p: Promise<{ ok: boolean; data?: unknown; error?: string }>) => start(async () => {
    setErr(null);
    const x = await p;
    if (!x.ok) return setErr(x.error ?? "Error");
    setR(x.data as HrReq);
  });

  if (!r) return <Modal open onClose={onClose} title="…">{err ? <p className="mx-err">{err}</p> : <p className="text-sec">{T("جارٍ التحميل…", "Loading…")}</p>}</Modal>;
  const own = r.user_id === meId;
  return (
    <Modal open onClose={onClose} size="lg" title={`${r.number} — ${hl(ar, HR.kind, r.kind)}`} subtitle={r.employee}>
      <div className="mx-detail">
        <div className="mx-chips">
          <span className={`mx-status ${statusClass(r.status)}`}>{hl(ar, HR.status, r.status)}</span>
          {r.kind === "leave" && <span className="mx-chip">{hl(ar, HR.leave, r.leave_type)}</span>}
          {r.kind === "permission" && <span className="mx-chip">{hl(ar, HR.permission, r.permission_type)}</span>}
          {r.kind === "ticket" && <span className="mx-chip">{hl(ar, HR.purpose, r.ticket_purpose)}</span>}
        </div>
        <dl className="mx-facts">
          {r.kind === "leave" && <>
            <div><dt>{T("الفترة", "Dates")}</dt><dd>{r.start_date} → {r.end_date}</dd></div>
            <div><dt>{T("أيام العمل", "Working days")}</dt><dd>{r.days}</dd></div>
            <div><dt>{T("القائم بالأعمال", "Covering")}</dt><dd>{r.delegate || "—"}</dd></div>
            {r.balance && <div><dt>{T("رصيد الإجازة السنوية", "Annual leave balance")}</dt><dd>{T(`المتبقي ${r.balance.remaining} من ${r.balance.entitlement}`, `${r.balance.remaining} of ${r.balance.entitlement} left`)}</dd></div>}
          </>}
          {r.kind === "permission" && <>
            <div><dt>{T("التاريخ", "Date")}</dt><dd>{r.start_date}</dd></div>
            <div><dt>{T("الوقت", "Time")}</dt><dd dir="ltr">{r.from_time} – {r.to_time}</dd></div>
            <div><dt>{T("المدة", "Duration")}</dt><dd>{r.minutes} {T("دقيقة", "min")}</dd></div>
          </>}
          {r.kind === "ticket" && <>
            <div><dt>{T("المسار", "Route")}</dt><dd>{r.from_city} → {r.to_city}</dd></div>
            <div><dt>{T("التواريخ", "Dates")}</dt><dd>{r.start_date}{r.round_trip && r.return_date ? ` ↔ ${r.return_date}` : ` (${T("ذهاب فقط", "one way")})`}</dd></div>
            <div><dt>{T("المسافرون / الدرجة", "Travellers / class")}</dt><dd>{r.travellers} · {hl(ar, HR.cls, r.travel_class)}</dd></div>
            <div><dt>{T("التكلفة", "Cost")}</dt><dd>{r.actual_cost != null ? `${nf.format(r.actual_cost)} ${T("ر.س", "SAR")}` : r.estimated_cost != null ? `≈ ${nf.format(r.estimated_cost)} ${T("ر.س", "SAR")}` : "—"}</dd></div>
            {r.booking_ref && <div><dt>{T("رقم الحجز", "Booking ref")}</dt><dd dir="ltr">{r.booking_ref}</dd></div>}
          </>}
          {r.decided_by && <div><dt>{T("القرار", "Decision")}</dt><dd>{r.decided_by}{r.decision_note ? ` — ${r.decision_note}` : ""}</dd></div>}
        </dl>
        {r.reason && <p className="mx-desc">{r.reason}</p>}

        {r.status === "pending" && can.approve && !own && (
          <div className="mx-panel">
            <label className="field" style={{ gridColumn: "1 / -1" }}><span>{T("ملاحظة القرار (اختياري)", "Decision note (optional)")}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="mx-row"><button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(hrDecide(r.id, true, note || undefined, locale))}>{T("اعتماد", "Approve")}</button><button className="btn btn-danger btn-sm" disabled={pending} onClick={() => run(hrDecide(r.id, false, note || undefined, locale))}>{T("رفض", "Reject")}</button></div>
          </div>
        )}
        {r.status === "pending" && can.approve && own && <p className="text-sec mx-hint">{T("لا يمكنك اعتماد طلبك؛ يُرسل لمدير النظام.", "You can't approve your own request; it goes to an administrator.")}</p>}
        {r.kind === "ticket" && r.status === "approved" && can.edit && (
          <div className="mx-panel">
            <label className="field"><span>{T("رقم الحجز", "Booking ref")}</span><input className="input" dir="ltr" value={book.ref} onChange={(e) => setBook({ ...book, ref: e.target.value })} /></label>
            <label className="field"><span>{T("التكلفة الفعلية (ر.س)", "Actual cost (SAR)")}</span><input className="input" type="number" dir="ltr" value={book.cost} onChange={(e) => setBook({ ...book, cost: e.target.value })} /></label>
            <button className="btn btn-primary btn-sm" disabled={pending || !book.ref} onClick={() => run(hrBook(r.id, { booking_ref: book.ref, actual_cost: book.cost ? Number(book.cost) : null }, locale))}>{T("تسجيل الحجز", "Record booking")}</button>
          </div>
        )}
        {(r.status === "pending" && own) || (can.edit && ["pending", "approved"].includes(r.status)) ? (
          <div><button className="btn btn-ghost btn-sm mx-danger" disabled={pending} onClick={() => run(hrCancel(r.id, locale))}>{T("إلغاء الطلب", "Cancel request")}</button></div>
        ) : null}
        {err && <p className="mx-err">{err}</p>}

        <h4 className="mx-h">{T("السجل", "Activity")}</h4>
        <ol className="mx-timeline">
          {(r.events ?? []).slice().reverse().map((e, i) => (
            <li key={i}><span className="mx-dot" aria-hidden /><div>
              <strong>{hl(ar, HR.action, e.action)}</strong>{e.note && e.note !== "over_monthly_cap" && <span> — {e.note}</span>}
              {e.note === "over_monthly_cap" && <span className="mx-sla mx-sla--at_risk" style={{ marginInlineStart: 6 }}>{T("يتجاوز حد الاستئذان الشهري", "Over the monthly permission limit")}</span>}
              <div className="text-sec" style={{ fontSize: 12 }}>{e.actor} · {e.at.slice(0, 16).replace("T", " ")}</div>
            </div></li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}
