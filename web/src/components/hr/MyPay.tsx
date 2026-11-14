"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PAY, monthLabel, pl, sar, type Loan } from "@/lib/payroll";
import { meRequestLoan } from "@/lib/payroll-actions";

export type MySlip = { id: number; month: string; net: number; gross: number; deductions: number; payment_date?: string | null };

const nextMonth = () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 7); };

export function MyPay({ locale, slips, loans }: { locale: string; slips: MySlip[]; loans: Loan[] }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState(false);
  const [f, setF] = useState({ kind: "advance" as "advance" | "loan", amount: "", installments: "1", start_month: nextMonth(), reason: "", consent: false });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const open = loans.find((l) => l.status === "pending");
  const active = loans.filter((l) => l.status === "approved");
  const inst = Math.max(1, Number(f.installments) || 1);
  const monthly = Number(f.amount) ? Number(f.amount) / inst : 0;
  const submit = () => start(async () => {
    setErr(null); setOk(null);
    const r = await meRequestLoan({ kind: f.kind, amount: Number(f.amount), installments: inst, start_month: f.start_month, reason: f.reason || null, consent: f.consent });
    if (!r.ok) return setErr(r.error);
    setOk(T("أُرسل طلبك إلى الموارد البشرية.", "Your request went to HR."));
    setAsk(false);
    setF({ ...f, amount: "", reason: "", consent: false });
    router.refresh();
  });

  return (
    <div className="page screen-enter mypay">
      <section className="card">
        <div className="mypay__head"><h3>{T("قسائم الرواتب", "Payslips")}</h3><span className="text-sec">{T("تظهر القسيمة هنا بعد صرف الراتب.", "A payslip appears here once the salary is paid.")}</span></div>
        {slips.length === 0 ? <p className="text-sec mypay__empty">{T("لا توجد قسائم بعد. ستصلك رسالة عند صرف أول راتب عبر النظام.", "No payslips yet. You'll get an email when your first salary is paid through the system.")}</p> : (
          <ul className="mypay__slips">{slips.map((s) => (
            <li key={s.id}><Link href={`/${locale}/my-hr/payslips/${s.id}`}>
              <span className="ms" aria-hidden>receipt_long</span>
              <div><b>{monthLabel(ar, s.month)}</b><small className="text-sec">{T("صُرف", "Paid")} {s.payment_date ?? "—"} · {T("الإجمالي", "gross")} {sar(ar, s.gross, 0)}</small></div>
              <strong>{sar(ar, s.net)}</strong>
            </Link></li>
          ))}</ul>
        )}
      </section>

      <section className="card">
        <div className="mypay__head"><h3>{T("السلف والقروض", "Advances & loans")}</h3>
          {!ask && !open && <button className="btn btn-secondary btn-sm" onClick={() => setAsk(true)}><span className="ms ms-sm" aria-hidden>add</span>{T("طلب سلفة", "Request an advance")}</button>}
        </div>
        {open && <p className="text-sec"><span className="ms ms-sm" aria-hidden>hourglass_top</span> {T(`طلبك ${open.number} بانتظار قرار الموارد البشرية.`, `Your request ${open.number} is waiting for HR.`)}</p>}
        {ok && <p className="col-ok">{ok}</p>}
        {ask && (
          <div className="mypay__form">
            <div className="ef-g3">
              <label className="field"><span>{T("النوع", "Type")}</span><select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "advance" | "loan", installments: e.target.value === "advance" ? "1" : f.installments })}>
                <option value="advance">{T("سلفة على الراتب (حتى 3 أقساط)", "Salary advance (up to 3 instalments)")}</option><option value="loan">{T("قرض (حتى 60 قسطًا)", "Loan (up to 60 instalments)")}</option></select></label>
              <label className="field"><span>{T("المبلغ (ر.س)", "Amount (SAR)")}</span><input className="input" type="number" min={1} dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
              <label className="field"><span>{T("عدد الأقساط", "Instalments")}</span><input className="input" type="number" min={1} max={f.kind === "advance" ? 3 : 60} dir="ltr" value={f.installments} onChange={(e) => setF({ ...f, installments: e.target.value })} /></label>
              <label className="field"><span>{T("يبدأ الخصم من", "Deduct from")}</span><input className="input" type="month" dir="ltr" value={f.start_month} onChange={(e) => setF({ ...f, start_month: e.target.value })} /></label>
              <label className="field mypay__wide"><span>{T("السبب (اختياري)", "Reason (optional)")}</span><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
            </div>
            {monthly > 0 && <p className="mypay__calc">{T(`القسط الشهري ≈ ${sar(ar, monthly)} لمدة ${inst} شهر`, `Monthly instalment ≈ ${sar(ar, monthly)} for ${inst} month(s)`)}</p>}
            <label className="ct-check"><input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
              {T("أوافق على خصم الأقساط من راتبي الشهري حتى السداد الكامل.", "I agree that the instalments are deducted from my monthly salary until it's repaid.")}</label>
            {err && <p className="mx-err">{err}</p>}
            <div className="mx-row">
              <button className="btn btn-primary" disabled={pending || !Number(f.amount) || !f.consent} onClick={submit}>{T("إرسال الطلب", "Send request")}</button>
              <button className="btn btn-ghost" onClick={() => setAsk(false)}>{T("إلغاء", "Cancel")}</button>
            </div>
          </div>
        )}
        {loans.length === 0 && !ask ? <p className="text-sec mypay__empty">{T("لا توجد سلف أو قروض.", "No advances or loans.")}</p> : (
          <ul className="py-loans">{loans.map((l) => {
            const pct = l.amount ? Math.min(100, (l.repaid / l.amount) * 100) : 0;
            return (
              <li key={l.id} className="py-req">
                <div className="py-req__top"><b>{pl(ar, PAY.kind, l.kind)} {l.number}</b><span className={`py-status is-${l.status === "approved" ? "submitted" : l.status === "settled" ? "paid" : l.status === "pending" ? "draft" : "cancelled"}`}>{pl(ar, PAY.loanStatus, l.status)}</span></div>
                <div className="text-sec py-small">{sar(ar, l.amount)} · {T(`${l.installments} قسط × ${sar(ar, l.monthly_amount)} من ${l.start_month}`, `${l.installments} × ${sar(ar, l.monthly_amount)} from ${l.start_month}`)}</div>
                {(l.status === "approved" || l.status === "settled") && <><div className="py-bar"><span style={{ width: `${pct}%` }} /></div><div className="py-small text-sec">{T("سُدد", "Repaid")} {sar(ar, l.repaid)} · {T("المتبقي", "left")} {sar(ar, l.remaining)}</div></>}
                {l.decision_note && <div className="py-small text-sec">{l.decision_note}</div>}
              </li>
            );
          })}</ul>
        )}
        {active.length > 0 && <p className="py-small text-sec">{T("تُخصم الأقساط تلقائيًا في مسير الرواتب الشهري.", "Instalments come off automatically in the monthly payroll.")}</p>}
      </section>
    </div>
  );
}
