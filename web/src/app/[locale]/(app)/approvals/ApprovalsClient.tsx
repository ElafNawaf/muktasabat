"use client";

import { formApprove, formReject } from "@/lib/forms-actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { markOwnerTransferred } from "@/lib/actions";
import { decideApproval } from "@/lib/workflow-actions";

type Kind = "work_order" | "renewal" | "payout" | "hr" | "bank" | "expense" | "form";
export type ChainStep = { step: number; label: string; approver: string; status: string; decided_by?: string | null; on_behalf?: boolean; decided_at?: string | null; overdue?: boolean; escalated?: boolean };
export type Item = {
  kind: Kind; id: number; ref?: string | null; title?: string | null; where: string; owner?: string | null;
  amount?: number | null; limit?: number | null; current?: number | null; gross?: number | null; change_pct?: number | null;
  since?: string | null; due?: string | null; days_late?: number; days_left?: number; priority?: string;
  waiting_on: "owner" | "company"; urgent: boolean; href: string; hr_kind?: "leave" | "permission" | "ticket" | "work_location"; reason?: string | null; requested_by?: string | null;
  step?: number; steps?: number; step_label?: string; on_behalf?: boolean; overdue?: boolean; escalated?: boolean; chain?: ChainStep[];
  category?: string; vendor?: string | null;
};
export type Inbox = { items: Item[]; can: Record<Kind, boolean>; counts: Record<Kind, number> };
export type HistoryItem = {
  kind: Kind; id: number; ref?: string | null; title?: string | null; where: string; owner?: string | null;
  decision: "approved" | "rejected" | "transferred"; auto: boolean; by?: string | null; note?: string | null;
  at?: string | null; amount?: number | null; days_late?: number; href: string;
};

const KIND: Record<Kind, { icon: string; ar: string; en: string }> = {
  work_order: { icon: "handyman", ar: "تقدير صيانة", en: "Maintenance estimate" },
  renewal: { icon: "autorenew", ar: "تجديد بإيجار أقل", en: "Renewal at lower rent" },
  payout: { icon: "account_balance", ar: "تحويل حصة المالك", en: "Owner payout" },
  hr: { icon: "badge", ar: "طلبات الموظفين", en: "Staff requests" },
  bank: { icon: "account_balance_wallet", ar: "تغيير حساب الراتب", en: "Salary account change" },
  expense: { icon: "receipt_long", ar: "اعتماد مصروف", en: "Expense approval" },
  form: { icon: "dynamic_form", ar: "تعديل نموذج", en: "Form change" },
};
const HR_KIND: Record<string, [string, string, string]> = {
  leave: ["beach_access", "طلب إجازة", "Leave request"], permission: ["schedule", "طلب استئذان", "Permission request"], ticket: ["flight", "طلب تذكرة سفر", "Travel ticket request"],
  work_location: ["home_work", "طلب عمل عن بُعد / ميداني", "Remote / field work request"],
};

export function ApprovalsClient({ locale, inbox, history }: { locale: string; inbox: Inbox; history: HistoryItem[] }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const nf = new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 });
  const sar = (n?: number | null) => (n == null ? "—" : `${nf.format(n)} ${T("ر.س", "SAR")}`);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [gone, setGone] = useState<Set<string>>(new Set());
  const items = inbox.items.filter((i) => !gone.has(`${i.kind}:${i.id}`) && (kind === "all" || i.kind === kind));
  const hist = history.filter((h) => kind === "all" || h.kind === kind);
  const kinds = (Object.keys(KIND) as Kind[]).filter(
    (k) => (k === "payout" && inbox.can.payout) || inbox.items.some((i) => i.kind === k) || history.some((h) => h.kind === k),
  );
  const left = inbox.items.filter((i) => !gone.has(`${i.kind}:${i.id}`));
  const total = left.length;
  const urgent = left.filter((i) => i.urgent).length;
  const payoutSum = left.filter((i) => i.kind === "payout").reduce((a, i) => a + (i.amount ?? 0), 0);

  return (
    <div className="page screen-enter ap">
      <div className="page-header">
        <div>
          <h2 className="page-title">{T("الموافقات", "Approvals")}</h2>
          <div className="page-subtitle">{T("كل ما ينتظر قرارك أنت في مكان واحد. يظهر الطلب لمن عليه الدور في مسار الاعتماد فقط، وينتقل للخطوة التالية تلقائيًا بعد موافقتك.", "Everything waiting for your decision, in one place. A request shows up for whoever's turn it is in its approval chain, and moves to the next step as soon as you approve.")}</div>
        </div>
      </div>

      <div className="ap-summary">
        <div><strong>{nf.format(total)}</strong><span>{T("بانتظار قرار", "Waiting for a decision")}</span></div>
        <div className={urgent ? "is-bad" : ""}><strong>{nf.format(urgent)}</strong><span>{T("عاجلة أو متأخرة", "Urgent or late")}</span></div>
        {inbox.can.payout && <div><strong>{sar(payoutSum)}</strong><span>{T("مستحق للملاك", "Owed to owners")}</span></div>}
      </div>

      <div className="ap-bar">
        <div className="rn-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "pending"} className={tab === "pending" ? "is-on" : ""} onClick={() => setTab("pending")}>{T("بانتظار القرار", "Pending")} <span>{nf.format(total)}</span></button>
          <button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "is-on" : ""} onClick={() => setTab("history")}>{T("السجل (60 يومًا)", "History (60 days)")} <span>{nf.format(history.length)}</span></button>
        </div>
        <div className="ap-kinds">
          <button className={kind === "all" ? "is-on" : ""} onClick={() => setKind("all")}>{T("الكل", "All")}</button>
          {kinds.map((k) => (
            <button key={k} className={kind === k ? "is-on" : ""} onClick={() => setKind(k)}>
              <span className="ms ms-sm" aria-hidden>{KIND[k].icon}</span>{T(KIND[k].ar, KIND[k].en)}
              {tab === "pending" && <b>{nf.format(left.filter((i) => i.kind === k).length)}</b>}
            </button>
          ))}
        </div>
      </div>

      {tab === "pending" ? (
        items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><span className="ms">task_alt</span></div>
            <div className="empty-title">{T("لا شيء بانتظارك", "Nothing waiting for you")}</div>
            <div className="empty-sub">{T("ستظهر هنا الطلبات التي تحتاج قرارك فور وصولها.", "Requests that need your decision will appear here as they come in.")}</div>
          </div>
        ) : (
          <div className="ap-list">
            {items.map((i) => <Row key={`${i.kind}:${i.id}`} i={i} locale={locale} sar={sar} onDone={() => setGone((s) => new Set(s).add(`${i.kind}:${i.id}`))} />)}
          </div>
        )
      ) : hist.length === 0 ? (
        <div className="empty-state"><div className="empty-title">{T("لا توجد قرارات مسجلة في هذه الفترة", "No decisions recorded in this period")}</div></div>
      ) : (
        <div className="card card-tight">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{T("الطلب", "Request")}</th><th>{T("القرار", "Decision")}</th><th>{T("بواسطة", "By")}</th><th>{T("المبلغ", "Amount")}</th><th>{T("التاريخ", "Date")}</th></tr></thead>
              <tbody>
                {hist.map((h, n) => (
                  <tr key={n}>
                    <td>
                      <Link href={`/${locale}/${h.href}`} className="ap-link"><span className="ms ms-sm" aria-hidden>{KIND[h.kind]?.icon}</span>{h.title || T(KIND[h.kind].ar, KIND[h.kind].en)}</Link>
                      <div className="text-sec" style={{ fontSize: 12 }}>{[h.ref, h.where, h.owner].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>
                      <span className={`mx-status ${h.decision === "rejected" ? "mx-status--rejected" : "mx-status--completed"}`}>
                        {h.decision === "transferred" ? T("حُوّل", "Transferred") : h.decision === "approved" ? (h.auto ? T("اعتماد تلقائي", "Auto-approved") : T("موافقة", "Approved")) : T("رفض", "Rejected")}
                      </span>
                      {h.decision === "transferred" && (h.days_late ?? 0) > 0 && <div className="text-sec" style={{ fontSize: 12 }}>{T(`متأخر ${h.days_late} يوم`, `${h.days_late} days late`)}</div>}
                      {h.note && <div className="text-sec" style={{ fontSize: 12 }}>{h.note}</div>}
                    </td>
                    <td>{h.by ? (h.by === "system" ? T("النظام", "System") : h.by) : "—"}</td>
                    <td>{sar(h.amount)}</td>
                    <td className="text-sec">{h.at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ago(iso: string | null | undefined, ar: boolean) {
  if (!iso) return "";
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso.length <= 10 ? iso : iso + "Z").getTime()) / 86_400_000));
  if (d === 0) return ar ? "اليوم" : "today";
  return ar ? `منذ ${d} يوم` : `${d} day${d === 1 ? "" : "s"} ago`;
}

function Row({ i, locale, sar, onDone }: { i: Item; locale: string; sar: (n?: number | null) => string; onDone: () => void }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const [note, setNote] = useState("");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(p: () => Promise<{ ok: boolean; error?: string }>, label: string) {
    setErr(null);
    start(async () => {
      const r = await p();
      if (!r.ok) return setErr(r.error ?? "Error");
      setDone(label);
      setTimeout(() => { onDone(); router.refresh(); }, 900);
    });
  }
  const decide = (approve: boolean) => {
    if (i.kind === "form") {
      return run(() => (approve ? formApprove(i.id, note || undefined, locale) : formReject(i.id, note || (locale === "ar" ? "رُفض من صندوق الموافقات" : "Rejected from the approvals inbox"))), approve ? T("اعتُمد وطُبّق", "Approved & applied") : T("تم الرفض", "Rejected"));
    }
    setErr(null);
    start(async () => {
      const r = await decideApproval(i.kind, i.id, approve, note || undefined);
      if (!r.ok) return setErr(r.error);
      setDone(
        !approve ? T("تم الرفض", "Rejected")
          : r.data.result === "pending" ? T("وافقت — انتقل للخطوة التالية", "Approved — moved to the next step")
          : T("تمت الموافقة النهائية", "Fully approved"),
      );
      setTimeout(() => { onDone(); router.refresh(); }, 1100);
    });
  };

  return (
    <article className={`ap-item${i.urgent ? " is-urgent" : ""}${done ? " is-done" : ""}`}>
      <span className="ap-ico ms" aria-hidden>{i.kind === "hr" && i.hr_kind ? HR_KIND[i.hr_kind][0] : KIND[i.kind].icon}</span>
      <div className="ap-body">
        <div className="ap-head">
          <span className="ap-kind">{i.kind === "hr" && i.hr_kind ? T(HR_KIND[i.hr_kind][1], HR_KIND[i.hr_kind][2]) : T(KIND[i.kind].ar, KIND[i.kind].en)}</span>
          {(i.steps ?? 0) > 0 && <span className="ap-step">{T(`الخطوة ${i.step} من ${i.steps}`, `Step ${i.step} of ${i.steps}`)} · {i.step_label}</span>}
          {i.overdue ? <span className="mx-sla mx-sla--breached">{i.escalated ? T("تجاوز وقت الاستجابة — صُعّد", "Past response time — escalated") : T("تجاوز وقت الاستجابة", "Past response time")}</span>
          : i.urgent && <span className="mx-sla mx-sla--breached">{i.kind === "hr" ? T("يبدأ خلال يومين", "Starts within 2 days") : i.kind === "payout" ? T(`متأخر ${i.days_late} يوم`, `${i.days_late} days late`) : i.kind === "renewal" ? T(`العقد ينتهي خلال ${i.days_left} يوم`, `Lease ends in ${i.days_left} days`) : T("أولوية عالية", "High priority")}</span>}
          <span className="ap-since">{i.kind === "payout" ? T(`دفع المستأجر ${ago(i.since, true)}`, `Tenant paid ${ago(i.since, false)}`) : i.waiting_on === "owner" ? T(`بانتظار المالك ${ago(i.since, true)}`, `Waiting for owner ${ago(i.since, false)}`) : T(`قُدّم ${ago(i.since, true)}`, `Submitted ${ago(i.since, false)}`)}</span>
        </div>
        <Link href={`/${locale}/${i.href}`} className="ap-title">{i.title || [i.ref, i.where].filter(Boolean).join(" — ")}</Link>
        <div className="ap-meta">{[i.title ? i.ref : null, i.title ? i.where : null, i.owner ? `${T("المالك", "Owner")}: ${i.owner}` : null].filter(Boolean).join(" · ")}</div>
        <div className="ap-money">
          {i.kind === "work_order" && <>{T("التقدير", "Estimate")} <strong>{sar(i.amount)}</strong> <span className="text-sec">· {T("الحد المفوَّض", "limit")} {sar(i.limit)}</span></>}
          {i.kind === "renewal" && <>{sar(i.current)} → <strong>{sar(i.amount)}</strong> {i.change_pct != null && <span className="rn-chg down" dir="ltr">{i.change_pct}%</span>}</>}
          {i.kind === "hr" && i.amount != null && <>{T("التكلفة التقديرية", "Estimated cost")} <strong>{sar(i.amount)}</strong></>}
          {i.kind === "expense" && <>{T("المبلغ", "Amount")} <strong>{sar(i.amount)}</strong> {i.vendor && <span className="text-sec">· {i.vendor}</span>}</>}
          {i.kind === "payout" && <>{T("صافي المالك ≈", "Owner net ≈")} <strong>{sar(i.amount)}</strong> <span className="text-sec">· {T("من دفعة", "from")} {sar(i.gross)} · {T("الاستحقاق", "due")} {i.due}</span></>}
        </div>
        {(i.kind === "hr" || i.kind === "form") && i.reason && <p className="ap-hint text-sec">{i.kind === "form" && i.requested_by ? `${i.requested_by}: ` : ""}{i.reason}</p>}
        {i.chain && i.chain.length > 1 && (
          <ol className="ap-chain" aria-label={T("مسار الاعتماد", "Approval chain")}>
            {i.chain.map((c) => (
              <li key={c.step} className={`is-${c.status}`} title={c.decided_by ? `${c.decided_by}${c.on_behalf ? T(" (نيابة)", " (on behalf)") : ""}` : c.approver}>
                <span className="ms" aria-hidden>{c.status === "approved" ? "check_circle" : c.status === "rejected" ? "cancel" : c.status === "pending" ? "pending" : "radio_button_unchecked"}</span>
                {c.label}
              </li>
            ))}
          </ol>
        )}
        {i.waiting_on === "owner" && i.on_behalf && <p className="ap-hint text-sec">{T("القرار هنا يُسجّل باسمك نيابة عن المالك (مثلًا بعد موافقته هاتفيًا). المالك يستطيع أيضًا القرار من بوابته.", "Deciding here records it in your name on the owner's behalf (e.g. after they agreed by phone). The owner can also decide in their portal.")}</p>}
      </div>
      <div className="ap-act">
        {done ? (
          <span className="mx-status mx-status--completed">{done}</span>
        ) : i.kind === "payout" ? (
          <>
            <input className="input" placeholder={T("رقم مرجع التحويل", "Transfer reference")} value={ref} onChange={(e) => setRef(e.target.value)} dir="ltr" />
            <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => markOwnerTransferred(i.id, { reference: ref || undefined }), T("سُجّل التحويل", "Transfer recorded"))}>{T("تم التحويل", "Mark transferred")}</button>
          </>
        ) : (
          <>
            <input className="input" placeholder={T("ملاحظة (اختياري)", "Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="ap-btns">
              <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => decide(true)}>{T("موافقة", "Approve")}</button>
              <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => decide(false)}>{T("رفض", "Reject")}</button>
            </div>
          </>
        )}
        {err && <p className="mx-err">{err}</p>}
      </div>
    </article>
  );
}
