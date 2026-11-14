"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { FilterBar, FilterSearch, FilterSelect } from "@/components/EntityFilterBar";
import { Modal } from "@/components/Modal";
import { markPaymentPaid } from "@/lib/actions";
import { ReceiptInput, receiptProblem, uploadPaymentReceipt } from "@/components/ReceiptInput";
import { colActions, colAddAction } from "@/lib/renewal-actions";

type Bucket = "upcoming" | "d1_30" | "d31_60" | "d61_90" | "d90p";
export type CRow = {
  payment_id: number; contract_number?: string | null; amount: number; due_date: string; days_overdue: number; bucket: Bucket;
  tenant?: string | null; tenant_phone?: string | null; building_id?: number | null; building?: string | null; unit?: string | null; owner?: string | null;
  assignee_id?: number | null; assignee?: string | null; actions: number; last_action?: string | null; last_action_at?: string | null;
  promise_date?: string | null; promise_amount?: number | null; promise_state?: "broken" | "today" | "pending" | null;
  escalated: boolean; disputed: boolean;
};
export type CStats = {
  buckets: Record<Bucket, { count: number; amount: number }>; overdue_amount: number; overdue_count: number;
  broken_promises: number; promises_today: number; untouched_overdue: number; collection_rate_month: number | null; collected_month: number;
};
type Act = { id: number; at: string; actor?: string | null; kind: string; note?: string | null; promise_date?: string | null; promise_amount?: number | null };

const BUCKETS: { k: Bucket; ar: string; en: string; c: string }[] = [
  { k: "upcoming", ar: "خلال 7 أيام", en: "Due in 7 days", c: "#8aa1c7" },
  { k: "d1_30", ar: "1–30 يومًا", en: "1–30 days", c: "#d9a441" },
  { k: "d31_60", ar: "31–60 يومًا", en: "31–60 days", c: "#d4762c" },
  { k: "d61_90", ar: "61–90 يومًا", en: "61–90 days", c: "#c0462a" },
  { k: "d90p", ar: "أكثر من 90", en: "90+ days", c: "#8e1b1b" },
];
const ACT: Record<string, [string, string, string]> = {
  call: ["call", "اتصال", "Call"], no_answer: ["phone_missed", "لم يرد", "No answer"], whatsapp: ["chat", "تذكير واتساب", "WhatsApp reminder"],
  visit: ["directions_walk", "زيارة", "Visit"], promise: ["event_available", "وعد بالسداد", "Promise to pay"], dispute: ["report", "اعتراض", "Dispute"],
  escalate: ["priority_high", "تصعيد للإدارة", "Escalated"], note: ["sticky_note_2", "ملاحظة", "Note"],
};

export function CollectionsClient({ locale, rows, stats, canEdit }: { locale: string; rows: CRow[]; stats: CStats; canEdit: boolean }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const nf = new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 });
  const sar = (n?: number | null) => (n == null ? "—" : `${nf.format(n)} ${T("ر.س", "SAR")}`);
  const [bucket, setBucket] = useState<"all" | "overdue" | Bucket>("overdue");
  const [flag, setFlag] = useState("all");
  const [who, setWho] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => { const id = Number(new URLSearchParams(window.location.search).get("open")); if (id) setOpenId(id); }, []);

  const people = useMemo(() => Array.from(new Map(rows.filter((r) => r.assignee_id).map((r) => [r.assignee_id!, r.assignee!])).entries()), [rows]);
  const shown = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    return (bucket === "all" || (bucket === "overdue" ? r.bucket !== "upcoming" : r.bucket === bucket)) &&
      (who === "all" || String(r.assignee_id ?? "") === who) &&
      (flag === "all" || (flag === "broken" && r.promise_state === "broken") || (flag === "untouched" && r.actions === 0 && r.days_overdue > 0) ||
        (flag === "promise" && r.promise_state && r.promise_state !== "broken") || (flag === "escalated" && r.escalated) || (flag === "disputed" && r.disputed)) &&
      (!s || `${r.contract_number ?? ""} ${r.tenant ?? ""} ${r.building ?? ""} ${r.unit ?? ""}`.toLowerCase().includes(s));
  });
  const totalAll = BUCKETS.reduce((a, b) => a + stats.buckets[b.k].amount, 0) || 1;
  const open = rows.find((r) => r.payment_id === openId) ?? null;

  return (
    <div className="page screen-enter col">
      <div className="page-header">
        <div>
          <h2 className="page-title">{T("التحصيل", "Collections")}</h2>
          <div className="page-subtitle">{T("الدفعات المتأخرة والمستحقة خلال أسبوع، مع سجل المتابعة ووعود السداد. الوعود التي فات موعدها تظهر أولًا.", "Overdue instalments and those due this week, with the follow-up log and promises to pay. Missed promises come first.")}</div>
        </div>
      </div>

      <div className="mx-kpis">
        <Kpi icon="hourglass_bottom" label={T("إجمالي المتأخرات", "Total overdue")} value={sar(stats.overdue_amount)} sub={T(`${nf.format(stats.overdue_count)} دفعة`, `${nf.format(stats.overdue_count)} instalments`)} tone={stats.overdue_amount ? "bad" : "good"} />
        <Kpi icon="heart_broken" label={T("وعود لم يُلتزم بها", "Missed promises")} value={nf.format(stats.broken_promises)} tone={stats.broken_promises ? "bad" : "good"} onClick={() => { setFlag("broken"); setBucket("all"); }} />
        <Kpi icon="event_available" label={T("وعود سداد اليوم", "Promised for today")} value={nf.format(stats.promises_today)} tone="neutral" />
        <Kpi icon="phone_disabled" label={T("متأخرة دون أي متابعة", "Overdue, no follow-up yet")} value={nf.format(stats.untouched_overdue)} tone={stats.untouched_overdue ? "warn" : "good"} onClick={() => { setFlag("untouched"); setBucket("overdue"); }} />
        <Kpi icon="percent" label={T("نسبة التحصيل هذا الشهر", "Collected this month")} value={stats.collection_rate_month == null ? "—" : `${nf.format(stats.collection_rate_month)}%`} sub={sar(stats.collected_month)} tone={(stats.collection_rate_month ?? 100) >= 90 ? "good" : "warn"} />
      </div>

      <section className="card col-aging" aria-label={T("أعمار الديون", "Ageing")}>
        <div className="col-aging__head"><strong>{T("أعمار المتأخرات", "Ageing")}</strong><span className="text-sec">{T("اضغط على فئة لتصفية القائمة", "Click a band to filter")}</span></div>
        <div className="col-bar" role="img" aria-label={BUCKETS.map((b) => `${T(b.ar, b.en)}: ${sar(stats.buckets[b.k].amount)}`).join(", ")}>
          {BUCKETS.map((b) => stats.buckets[b.k].amount > 0 && <span key={b.k} style={{ width: `${(stats.buckets[b.k].amount / totalAll) * 100}%`, background: b.c }} />)}
        </div>
        <div className="col-legend">
          {BUCKETS.map((b) => (
            <button key={b.k} className={bucket === b.k ? "is-on" : ""} onClick={() => { setBucket(bucket === b.k ? "overdue" : b.k); setFlag("all"); }}>
              <i style={{ background: b.c }} />
              <span>{T(b.ar, b.en)}</span>
              <strong>{sar(stats.buckets[b.k].amount)}</strong>
              <small>{nf.format(stats.buckets[b.k].count)}</small>
            </button>
          ))}
        </div>
      </section>

      <FilterBar search={<FilterSearch value={q} onChange={setQ} placeholder={T("بحث بالعقد أو المستأجر أو المبنى…", "Search lease, tenant or building…")} />}>
        <FilterSelect label={T("الفترة", "Period")} value={bucket} onChange={(x) => setBucket(x as typeof bucket)} options={[{ value: "overdue", label: T("كل المتأخر", "All overdue") }, { value: "all", label: T("المتأخر + القادم", "Overdue + upcoming") }, ...BUCKETS.map((b) => ({ value: b.k, label: T(b.ar, b.en) }))]} />
        <FilterSelect label={T("الحالة", "Status")} value={flag} onChange={setFlag} options={[{ value: "all", label: T("الكل", "All") }, { value: "broken", label: T("وعد لم يُلتزم به", "Missed promise") }, { value: "promise", label: T("لديه وعد سداد", "Has a promise") }, { value: "untouched", label: T("بدون متابعة", "No follow-up") }, { value: "escalated", label: T("مُصعّد", "Escalated") }, { value: "disputed", label: T("عليه اعتراض", "Disputed") }]} />
        {people.length > 0 && <FilterSelect label={T("المسؤول", "Assignee")} value={who} onChange={setWho} options={[{ value: "all", label: T("الجميع", "Everyone") }, ...people.map(([id, n]) => ({ value: String(id), label: n }))]} />}
      </FilterBar>

      {shown.length === 0 ? (
        <div className="empty-state"><div className="empty-icon"><span className="ms">savings</span></div><div className="empty-title">{rows.length ? T("لا توجد دفعات مطابقة", "No matching instalments") : T("لا توجد متأخرات", "Nothing overdue")}</div></div>
      ) : (
        <div className="card card-tight">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{T("المستأجر", "Tenant")}</th><th>{T("العقار", "Property")}</th><th>{T("المبلغ", "Amount")}</th><th>{T("التأخير", "Overdue")}</th><th>{T("آخر متابعة", "Last follow-up")}</th><th>{T("وعد السداد", "Promise")}</th><th>{T("المسؤول", "Assignee")}</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.payment_id} className="mx-row" tabIndex={0} onClick={() => setOpenId(r.payment_id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(r.payment_id)}>
                    <td><strong>{r.tenant || "—"}</strong><div className="text-sec" style={{ fontSize: 12 }}>{r.contract_number}{r.escalated ? ` · ${T("مُصعّد", "escalated")}` : ""}{r.disputed ? ` · ${T("اعتراض", "disputed")}` : ""}</div></td>
                    <td>{r.building}{r.unit ? <div className="text-sec" style={{ fontSize: 12 }}>{T("وحدة", "Unit")} {r.unit}</div> : null}</td>
                    <td><strong>{sar(r.amount)}</strong></td>
                    <td><span className={`col-age col-age--${r.bucket}`}>{r.days_overdue > 0 ? T(`${nf.format(r.days_overdue)} يوم`, `${nf.format(r.days_overdue)} days`) : r.days_overdue === 0 ? T("اليوم", "Today") : T(`بعد ${nf.format(-r.days_overdue)} يوم`, `in ${nf.format(-r.days_overdue)} days`)}</span></td>
                    <td>{r.last_action ? <>{ACT[r.last_action]?.[ar ? 1 : 2]}<div className="text-sec" style={{ fontSize: 12 }}>{r.last_action_at?.slice(0, 10)}</div></> : <span className="text-sec">{T("لا شيء", "None")}</span>}</td>
                    <td>{r.promise_date ? <span className={`mx-sla ${r.promise_state === "broken" ? "mx-sla--breached" : r.promise_state === "today" ? "mx-sla--at_risk" : "mx-sla--on_track"}`}>{r.promise_state === "broken" ? T("فات الموعد ", "Missed ") : ""}{r.promise_date}</span> : "—"}</td>
                    <td>{r.assignee || <span className="text-sec">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && <Drawer r={open} locale={locale} canEdit={canEdit} sar={sar} onClose={() => { setOpenId(null); router.refresh(); }} />}
    </div>
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

function waNumber(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("966") ? d : d.startsWith("0") ? `966${d.slice(1)}` : d.length === 9 ? `966${d}` : d;
}

function Drawer({ r, locale, canEdit, sar, onClose }: { r: CRow; locale: string; canEdit: boolean; sar: (n?: number | null) => string; onClose: () => void }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [acts, setActs] = useState<Act[] | null>(null);
  const [panel, setPanel] = useState<null | "promise" | "log" | "paid">(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [receipt, setReceipt] = useState<File | null>(null);
  const v = (k: string) => f[k] ?? "";
  const set = (k: string, x: string) => setF((o) => ({ ...o, [k]: x }));
  const load = () => colActions(r.payment_id).then((x) => (x.ok ? setActs(x.data as Act[]) : setErr(x.error)));
  useEffect(() => { load(); }, [r.payment_id]); // eslint-disable-line react-hooks/exhaustive-deps

  function log(body: Record<string, unknown>, ok: string) {
    setErr(null);
    start(async () => {
      const x = await colAddAction(r.payment_id, body);
      if (!x.ok) return setErr(x.error);
      setMsg(ok); setPanel(null); setF({}); load();
    });
  }
  const amount = new Intl.NumberFormat("en-US").format(r.amount);
  const waText = encodeURIComponent(
    `السلام عليكم ${r.tenant ?? ""}،\nنود تذكيركم بدفعة الإيجار لعقد ${r.contract_number ?? ""} (${r.building ?? ""} - وحدة ${r.unit ?? ""}) بمبلغ ${amount} ريال، المستحقة بتاريخ ${r.due_date}.\nشاكرين لكم — شركة مكتسبات العقارية\n\nDear ${r.tenant ?? ""}, this is a reminder of the rent instalment for lease ${r.contract_number ?? ""} of SAR ${amount}, due on ${r.due_date}. Thank you — Muktasabat Real Estate`,
  );

  return (
    <Modal open onClose={onClose} size="lg" title={`${r.tenant || "—"} — ${sar(r.amount)}`} subtitle={`${r.contract_number ?? ""} · ${r.building ?? ""}${r.unit ? ` · ${T("وحدة", "Unit")} ${r.unit}` : ""}${r.owner ? ` · ${T("المالك", "Owner")}: ${r.owner}` : ""}`}>
      <div className="mx-detail">
        <div className="mx-chips">
          <span className={`col-age col-age--${r.bucket}`}>{r.days_overdue > 0 ? T(`متأخرة ${r.days_overdue} يوم`, `${r.days_overdue} days overdue`) : T(`تستحق ${r.due_date}`, `Due ${r.due_date}`)}</span>
          {r.promise_date && <span className={`mx-sla ${r.promise_state === "broken" ? "mx-sla--breached" : "mx-sla--on_track"}`}>{T("وعد بالسداد", "Promise")} {r.promise_date}{r.promise_amount ? ` · ${sar(r.promise_amount)}` : ""}</span>}
          {r.escalated && <span className="mx-status mx-status--rejected">{T("مُصعّد", "Escalated")}</span>}
        </div>

        {canEdit && (
          <div className="col-quick">
            {r.tenant_phone && (
              <>
                <a className="btn btn-secondary btn-sm" href={`https://wa.me/${waNumber(r.tenant_phone)}?text=${waText}`} target="_blank" rel="noreferrer" onClick={() => log({ kind: "whatsapp" }, T("سُجّل تذكير واتساب", "WhatsApp reminder logged"))}>
                  <span className="ms ms-sm">chat</span>{T("تذكير واتساب", "WhatsApp reminder")}
                </a>
                <a className="btn btn-secondary btn-sm" href={`tel:${r.tenant_phone}`} dir="ltr"><span className="ms ms-sm">call</span>{r.tenant_phone}</a>
              </>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => setPanel("log")}><span className="ms ms-sm">edit_note</span>{T("تسجيل متابعة", "Log follow-up")}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setPanel("promise")}><span className="ms ms-sm">event_available</span>{T("وعد بالسداد", "Promise to pay")}</button>
            <button className="btn btn-primary btn-sm" onClick={() => setPanel("paid")}><span className="ms ms-sm">paid</span>{T("تسجيل السداد", "Record payment")}</button>
          </div>
        )}

        {panel === "log" && (
          <div className="mx-panel">
            <label className="field"><span>{T("النوع", "Type")}</span>
              <select className="select" value={v("kind") || "call"} onChange={(e) => set("kind", e.target.value)}>
                {["call", "no_answer", "visit", "dispute", "escalate", "note"].map((k) => <option key={k} value={k}>{ACT[k][ar ? 1 : 2]}</option>)}
              </select>
            </label>
            <label className="field" style={{ gridColumn: "span 2" }}><span>{T("ملاحظة", "Note")}</span><input className="input" value={v("note")} onChange={(e) => set("note", e.target.value)} /></label>
            {(v("kind") === "escalate") && <p className="mx-hint text-sec">{T("يُرسل بريد للإدارة (المستلم في نسخة تنبيهات الدفعات).", "Emails management (the payment-alerts Cc recipient).")}</p>}
            <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => log({ kind: v("kind") || "call", note: v("note") || null }, T("سُجّلت المتابعة", "Follow-up logged"))}>{T("حفظ", "Save")}</button>
          </div>
        )}
        {panel === "promise" && (
          <div className="mx-panel">
            <label className="field"><span>{T("تاريخ السداد الموعود", "Promised date")}</span><input className="input" type="date" value={v("date")} onChange={(e) => set("date", e.target.value)} /></label>
            <label className="field"><span>{T("المبلغ", "Amount")}</span><input className="input" type="number" dir="ltr" placeholder={String(r.amount)} value={v("amt")} onChange={(e) => set("amt", e.target.value)} /></label>
            <label className="field"><span>{T("ملاحظة", "Note")}</span><input className="input" value={v("note")} onChange={(e) => set("note", e.target.value)} /></label>
            <button className="btn btn-primary btn-sm" disabled={pending || !v("date")} onClick={() => log({ kind: "promise", promise_date: v("date"), promise_amount: v("amt") ? Number(v("amt")) : null, note: v("note") || null }, T("سُجّل الوعد", "Promise logged"))}>{T("حفظ الوعد", "Save promise")}</button>
          </div>
        )}
        {panel === "paid" && (
          <div className="mx-panel">
            <label className="field"><span>{T("طريقة الدفع", "Method")}</span>
              <select className="select" value={v("method") || "bank_transfer"} onChange={(e) => set("method", e.target.value)}>
                <option value="bank_transfer">{T("تحويل بنكي", "Bank transfer")}</option><option value="cash">{T("نقدًا", "Cash")}</option><option value="cheque">{T("شيك", "Cheque")}</option>
              </select>
            </label>
            <label className="field"><span>{T("تاريخ السداد", "Paid on")}</span><input className="input" type="date" value={v("pd")} onChange={(e) => set("pd", e.target.value)} /></label>
            <label className="field"><span>{T("رقم الإيصال", "Receipt no.")}</span><input className="input" dir="ltr" value={v("rc")} onChange={(e) => set("rc", e.target.value)} /></label>
            <ReceiptInput file={receipt} onChange={setReceipt} ar={ar} />
            <button className="btn btn-primary btn-sm" disabled={pending || !receipt} onClick={() => start(async () => {
              setErr(null);
              const bad = receiptProblem(receipt, ar);
              if (bad || !receipt) return setErr(bad);
              // Evidence first: if the upload fails nothing is marked paid.
              const up = await uploadPaymentReceipt(r.payment_id, receipt, "payment");
              if (!up.ok) return setErr(up.error);
              const x = await markPaymentPaid(r.payment_id, { payment_method: (v("method") || "bank_transfer") as "bank_transfer", paid_date: v("pd") || null, receipt_number: v("rc") || null });
              if (!x.ok) return setErr(x.error);
              setMsg(T("سُجّل السداد — سيُرسل إشعار للمالك وتبدأ مهلة تحويل حصته.", "Payment recorded — the owner's payout clock starts now."));
              setPanel(null); setReceipt(null);
            })}>{pending ? "…" : T("تأكيد السداد", "Confirm payment")}</button>
          </div>
        )}
        {msg && <p className="col-ok">{msg}</p>}
        {err && <p className="mx-err">{err}</p>}

        <h4 className="mx-h">{T("سجل المتابعة", "Follow-up log")}</h4>
        {acts == null ? <p className="text-sec">…</p> : acts.length === 0 ? <p className="text-sec">{T("لم تُسجّل أي متابعة بعد.", "No follow-up logged yet.")}</p> : (
          <ol className="mx-timeline">
            {acts.map((a) => (
              <li key={a.id}><span className="mx-dot" aria-hidden /><div>
                <strong>{ACT[a.kind]?.[ar ? 1 : 2] ?? a.kind}</strong>
                {a.promise_date && <span> — {a.promise_date}{a.promise_amount ? ` · ${sar(a.promise_amount)}` : ""}</span>}
                {a.note && <span> — {a.note}</span>}
                <div className="text-sec" style={{ fontSize: 12 }}>{a.actor} · {a.at.slice(0, 16).replace("T", " ")}</div>
              </div></li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
}
