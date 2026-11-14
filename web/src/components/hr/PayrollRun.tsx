"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { PAY, monthLabel, pl, sar, type PayLine, type PayRunFull } from "@/lib/payroll";
import { payApprove, payCancel, payEditLine, payPaid, payRecalc, payReturn, paySubmit } from "@/lib/payroll-actions";

type Res = { ok: boolean; error?: string };
const dt = (s?: string | null) => (s ? s.slice(0, 16).replace("T", " ") : "");

export function PayrollRun({ locale, run }: { locale: string; run: PayRunFull }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<PayLine | null>(null);
  const [back, setBack] = useState(false);
  const [note, setNote] = useState("");
  const [payDate, setPayDate] = useState(run.payment_date ?? new Date().toISOString().slice(0, 10));
  const [q, setQ] = useState("");
  const t = run.totals;
  const act = (fn: () => Promise<Res>, ok?: string, after?: () => void) => start(async () => {
    setErr(null); setMsg(null);
    const r = await fn();
    if (!r.ok) return setErr(r.error ?? "Error");
    if (ok) setMsg(ok);
    after?.();
    router.refresh();
  });
  const steps = [
    { k: "draft", label: T("إعداد", "Prepared"), who: run.created_by, at: run.calculated_at, done: true },
    { k: "submitted", label: T("رُفع للاعتماد", "Submitted"), who: run.submitted_by, at: run.submitted_at, done: ["submitted", "approved", "paid"].includes(run.status) },
    { k: "approved", label: T("اعتُمد", "Approved"), who: run.approved_by, at: run.approved_at, done: ["approved", "paid"].includes(run.status) },
    { k: "paid", label: T("صُرف", "Paid"), who: run.paid_by, at: run.payment_date, done: run.status === "paid" },
  ];
  const lines = run.lines.filter((l) => !q.trim() || `${l.name} ${l.employee_no ?? ""} ${l.id_number ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const warnLines = run.lines.filter((l) => !l.excluded && l.warnings.some((w) => w.code !== "partial_month"));

  return (
    <div className="page screen-enter py-page">
      <div className="cdoc-bar">
        <Link className="btn btn-ghost btn-sm" href={`/${locale}/hr?tab=payroll`}><span className="ms ms-sm" aria-hidden>{ar ? "arrow_forward" : "arrow_back"}</span>{T("الرواتب", "Payroll")}</Link>
        <div className="cdoc-bar__end">
          <a className="btn btn-secondary btn-sm" href={`/api/hr/payroll/${run.id}/register.xlsx`}><span className="ms ms-sm" aria-hidden>table_view</span>{T("كشف المسير (Excel)", "Payroll register (Excel)")}</a>
          {["approved", "paid"].includes(run.status) && <a className="btn btn-primary btn-sm" href={`/api/hr/payroll/${run.id}/wps.csv`}><span className="ms ms-sm" aria-hidden>account_balance</span>{T("ملف حماية الأجور (مدد)", "WPS file (Mudad)")}</a>}
        </div>
      </div>

      <header className="py-head" style={{ ["--c" as string]: run.company_color || "#7B1A1A" }}>
        <span className="py-run__co">{run.company_code}</span>
        <div>
          <h2 className="page-title">{T(`مسير رواتب ${monthLabel(ar, run.month)}`, `Payroll · ${monthLabel(ar, run.month)}`)}</h2>
          <p className="text-sec">{run.company} · {T("يوم الصرف", "pay day")} {run.payment_date ?? "—"}</p>
        </div>
        <span className={`py-status is-${run.status}`}>{pl(ar, PAY.status, run.status)}</span>
      </header>

      <ol className="cdoc-steps py-steps" aria-label={T("مراحل المسير", "Payroll progress")}>
        {steps.map((s) => (
          <li key={s.k} className={s.done ? "is-done" : steps.find((x) => !x.done)?.k === s.k ? "is-on" : ""}>
            <span className="cdoc-steps__dot ms" aria-hidden>{s.done ? "check" : ""}</span>
            <div><b>{s.label}</b>{s.done && (s.who || s.at) && <small>{[s.who, dt(s.at)].filter(Boolean).join(" · ")}</small>}</div>
          </li>
        ))}
      </ol>

      {run.returned_note && run.status === "draft" && <p className="cdoc-alert"><span className="ms" aria-hidden>undo</span>{T("أُعيد للتعديل: ", "Sent back: ")}<b>{run.returned_note}</b></p>}

      <div className="py-totals">
        <div><small>{T("الموظفون", "Employees")}</small><b>{t.employees}</b>{t.excluded > 0 && <span className="text-sec">{T(`+${t.excluded} مستبعد`, `+${t.excluded} excluded`)}</span>}</div>
        <div><small>{T("إجمالي الاستحقاقات", "Gross earnings")}</small><b>{sar(ar, t.gross, 0)}</b><span className="text-sec">{T("إضافي", "OT")} {sar(ar, t.overtime, 0)} · {T("إضافات", "add.")} {sar(ar, t.additions, 0)}</span></div>
        <div><small>{T("الاستقطاعات", "Deductions")}</small><b>{sar(ar, t.deductions, 0)}</b><span className="text-sec">{T("تأمينات", "GOSI")} {sar(ar, t.gosi_employee, 0)} · {T("أقساط", "loans")} {sar(ar, t.loans, 0)}</span></div>
        <div className="is-net"><small>{T("صافي الرواتب", "Net pay")}</small><b>{sar(ar, t.net, 0)}</b><span className="text-sec">{T("يُحوَّل عبر حماية الأجور", "transferred via WPS")}</span></div>
        <div><small>{T("التكلفة على الشركة", "Cost to company")}</small><b>{sar(ar, t.cost, 0)}</b><span className="text-sec">{T("تأمينات صاحب العمل", "employer GOSI")} {sar(ar, t.gosi_employer, 0)}</span></div>
      </div>

      <section className="card py-actions">
        {run.status === "draft" && (
          <>
            <p className="text-sec">{warnLines.length ? T(`${warnLines.length} موظف بحاجة لمراجعة قبل الرفع.`, `${warnLines.length} employee(s) need a look before submitting.`) : T("راجع الأسطر، أضف الإضافي والمكافآت والخصومات، ثم ارفع المسير لاعتماده من شخص آخر.", "Review the lines, add overtime, bonuses or deductions, then submit for someone else to approve.")}</p>
            <div className="mx-row">
              <button className="btn btn-secondary" disabled={pending} onClick={() => act(() => payRecalc(run.id), T("أُعيد الحساب من العقود والحضور.", "Recalculated from contracts and attendance."))}><span className="ms ms-sm" aria-hidden>refresh</span>{T("إعادة الحساب", "Recalculate")}</button>
              <button className="btn btn-primary" disabled={pending} onClick={() => act(() => paySubmit(run.id), T("رُفع للاعتماد.", "Submitted for approval."))}><span className="ms ms-sm" aria-hidden>send</span>{T("رفع للاعتماد", "Submit for approval")}</button>
              <button className="btn btn-ghost mx-danger" disabled={pending} onClick={() => act(() => payCancel(run.id), undefined, () => router.push(`/${locale}/hr?tab=payroll`))}>{T("إلغاء المسير", "Cancel run")}</button>
            </div>
          </>
        )}
        {run.status === "submitted" && (
          run.can.approve ? (
            <>
              <p className="text-sec">{T(`رفعه ${run.submitted_by}. راجع الإجماليات والأسطر ثم اعتمد أو أعد للتعديل.`, `Submitted by ${run.submitted_by}. Check the totals and lines, then approve or send back.`)}</p>
              <div className="mx-row">
                <button className="btn btn-primary" disabled={pending} onClick={() => act(() => payApprove(run.id), T("اعتُمد المسير.", "Payroll approved."))}><span className="ms ms-sm" aria-hidden>verified</span>{T("اعتماد المسير", "Approve payroll")}</button>
                <button className="btn btn-secondary" disabled={pending} onClick={() => setBack(true)}>{T("إعادة للتعديل", "Send back")}</button>
              </div>
            </>
          ) : <p className="text-sec"><span className="ms ms-sm" aria-hidden>hourglass_top</span> {T("بانتظار اعتماد شخص آخر لديه صلاحية الاعتماد (لا يعتمد رافع المسير مسيره).", "Waiting for another approver — whoever submits a payroll can't approve it.")}</p>
        )}
        {run.status === "approved" && (
          <>
            <ol className="py-howto">
              <li>{T("نزّل ملف حماية الأجور وقارنه بقالب منصة مدد ثم ارفعه.", "Download the WPS file, compare it with Mudad's template and upload it.")}</li>
              <li>{T("بعد تنفيذ البنك للتحويل سجّل تاريخ الصرف — تُرسل القسائم للموظفين وتُسجل أقساط السلف.", "When the bank has paid, record the pay date — payslips go to employees and loan instalments are booked.")}</li>
            </ol>
            <div className="mx-row">
              <input className="input py-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} aria-label={T("تاريخ الصرف", "Pay date")} />
              <button className="btn btn-primary" disabled={pending || !payDate} onClick={() => act(() => payPaid(run.id, payDate), T("سُجّل الصرف وأُرسلت القسائم.", "Marked paid; payslips sent."))}><span className="ms ms-sm" aria-hidden>task_alt</span>{T("تسجيل الصرف", "Mark as paid")}</button>
              <button className="btn btn-ghost" disabled={pending} onClick={() => setBack(true)}>{T("إعادة للتعديل", "Send back")}</button>
            </div>
          </>
        )}
        {run.status === "paid" && <p className="text-sec"><span className="ms ms-sm" aria-hidden>lock</span> {T(`صُرف في ${run.payment_date}. المسير مقفل، والقسائم متاحة للموظفين.`, `Paid on ${run.payment_date}. The payroll is locked and payslips are with employees.`)}</p>}
        {msg && <p className="col-ok">{msg}</p>}{err && <p className="mx-err">{err}</p>}
      </section>

      {run.missing.length > 0 && (
        <p className="py-missing"><span className="ms ms-sm" aria-hidden>info</span>{T("بلا عقد ساري لهذا الشهر (غير مشمولين): ", "No contract for this month (not included): ")}
          {run.missing.map((m, i) => <span key={m.user_id}>{i ? "، " : ""}<Link href={`/${locale}/hr/people/${m.user_id}?tab=contracts`}>{m.name}</Link></span>)}
        </p>
      )}

      <section className="card card-tight">
        <div className="py-tblhead">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T("بحث بالاسم أو الرقم…", "Search name or number…")} aria-label={T("بحث", "Search")} />
          <span className="text-sec">{run.can.edit ? T("انقر على موظف لتعديل سطره", "Click an employee to adjust their line") : T("انقر على موظف لعرض التفاصيل", "Click an employee for details")}</span>
        </div>
        <div className="tbl-wrap"><table className="tbl py-tbl">
          <thead><tr>
            <th>{T("الموظف", "Employee")}</th><th className="num">{T("الأيام", "Days")}</th><th className="num">{T("الأساسي", "Basic")}</th><th className="num">{T("البدلات", "Allowances")}</th>
            <th className="num">{T("إضافي وإضافات", "OT & additions")}</th><th className="num">{T("الإجمالي", "Gross")}</th><th className="num">{T("الاستقطاعات", "Deductions")}</th><th className="num">{T("الصافي", "Net")}</th>
          </tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.id} className={`mx-row ${l.excluded ? "py-excluded" : ""}`} tabIndex={0} onClick={() => setOpen(l)} onKeyDown={(e) => e.key === "Enter" && setOpen(l)}>
              <td>
                <strong>{l.name}</strong>
                <div className="text-sec py-small">{[l.employee_no, l.job_title, pl(ar, PAY.scheme, l.gosi_scheme)].filter(Boolean).join(" · ")}</div>
                {l.excluded ? <span className="py-tag">{T("مستبعد", "Excluded")}</span> : l.warnings.filter((w) => w.code !== "partial_month").map((w) => <span key={w.code} className="py-tag is-warn">{w.label}</span>)}
              </td>
              <td className="num">{l.payable_days}{l.absent_days ? <div className="py-small py-neg">−{l.absent_days}</div> : null}</td>
              <td className="num">{sar(ar, l.basic, 0)}</td>
              <td className="num">{sar(ar, l.housing + l.transport + l.other_allowance, 0)}</td>
              <td className="num">{l.overtime_amount + l.additions ? sar(ar, l.overtime_amount + l.additions, 0) : "—"}</td>
              <td className="num">{sar(ar, l.gross, 0)}</td>
              <td className="num py-neg">{sar(ar, l.total_deductions, 0)}</td>
              <td className="num"><b>{sar(ar, l.net, 2)}</b></td>
            </tr>
          ))}</tbody>
          <tfoot><tr>
            <td>{T("الإجمالي", "Total")}</td><td /><td className="num">{sar(ar, t.basic, 0)}</td><td className="num">{sar(ar, t.allowances, 0)}</td>
            <td className="num">{sar(ar, t.overtime + t.additions, 0)}</td><td className="num">{sar(ar, t.gross, 0)}</td><td className="num">{sar(ar, t.deductions, 0)}</td><td className="num"><b>{sar(ar, t.net, 2)}</b></td>
          </tr></tfoot>
        </table></div>
      </section>

      {open && <LineDrawer ar={ar} locale={locale} runId={run.id} l={run.lines.find((x) => x.id === open.id) ?? open} editable={run.can.edit} onClose={() => setOpen(null)} />}
      {back && (
        <Modal open onClose={() => setBack(false)} title={T("إعادة المسير للتعديل", "Send the payroll back")}
          footer={<><button className="btn btn-secondary" onClick={() => setBack(false)}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" disabled={pending || note.trim().length < 3} onClick={() => act(() => payReturn(run.id, note), T("أُعيد للتعديل.", "Sent back."), () => setBack(false))}>{T("إعادة", "Send back")}</button></>}>
          <label className="field"><span>{T("ما الذي يحتاج تعديلًا؟", "What needs changing?")}</span><textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </Modal>
      )}
    </div>
  );
}

function LineDrawer({ ar, locale, runId, l, editable, onClose }: { ar: boolean; locale: string; runId: number; l: PayLine; editable: boolean; onClose: () => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const ov = l.overrides ?? {};
  const [f, setF] = useState({
    overtime_hours: String(l.overtime_hours || ""), absent_days: String(l.absent_days), unpaid_days: String(l.unpaid_days), late_minutes: String(l.late_minutes),
    skip_loans: Boolean(ov.skip_loans), excluded: l.excluded, note: l.note ?? "",
  });
  const [adj, setAdj] = useState(l.adjustments);
  const [na, setNa] = useState({ kind: "addition" as "addition" | "deduction", label: "", amount: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (reset: string[] = []) => start(async () => {
    setErr(null);
    const body: Record<string, unknown> = { adjustments: adj, skip_loans: f.skip_loans, excluded: f.excluded, note: f.note || null, reset };
    const num = (k: keyof typeof f, cur: number) => { const v = Number(f[k]); if (!reset.includes(k as string) && String(f[k]) !== "" && v !== cur) body[k as string] = v; };
    num("overtime_hours", l.overtime_hours); num("absent_days", l.absent_days); num("unpaid_days", l.unpaid_days); num("late_minutes", l.late_minutes);
    const r = await payEditLine(runId, l.id, body);
    if (!r.ok) return setErr(r.error ?? "Error");
    router.refresh();
    onClose();
  });
  const row = (label: string, v: number, neg = false, hint?: string) => v ? <li><span>{label}{hint && <small> · {hint}</small>}</span><b className={neg ? "py-neg" : ""}>{sar(ar, v)}</b></li> : null;
  const auto = (k: string) => k in ov && ov[k] !== undefined && typeof ov[k] === "number";

  return (
    <Modal open onClose={onClose} size="lg" title={l.name ?? ""} subtitle={[l.job_title, l.id_number, l.iban && `${l.bank_code ?? ""} ${l.iban}`].filter(Boolean).join(" · ")}
      footer={editable ? <><button className="btn btn-secondary" onClick={onClose}>{T("إغلاق", "Close")}</button><button className="btn btn-primary" disabled={pending} onClick={() => save()}>{T("حفظ وإعادة الحساب", "Save & recalculate")}</button></> : undefined}>
      <div className="py-line">
        <div className="py-cols">
          <section>
            <h4>{T("الاستحقاقات", "Earnings")}</h4>
            <ul className="py-list">
              {row(T("الراتب الأساسي", "Basic salary"), l.basic)}
              {row(T("بدل السكن", "Housing"), l.housing)}
              {row(T("بدل النقل", "Transport"), l.transport)}
              {row(l.other_allowance_label || T("بدلات أخرى", "Other allowance"), l.other_allowance)}
              {row(T("العمل الإضافي", "Overtime"), l.overtime_amount, false, T(`${l.overtime_hours} ساعة`, `${l.overtime_hours} h`))}
              {l.adjustments.filter((a) => a.kind === "addition").map((a, i) => <li key={i}><span>{a.label}</span><b>{sar(ar, a.amount)}</b></li>)}
              <li className="is-sum"><span>{T("الإجمالي", "Gross")}</span><b>{sar(ar, l.gross)}</b></li>
            </ul>
          </section>
          <section>
            <h4>{T("الاستقطاعات", "Deductions")}</h4>
            <ul className="py-list">
              {row(T("أيام خارج العقد", "Days outside the contract"), l.proration_deduction, true, T(`${l.payable_days}/30 يوم مستحق`, `${l.payable_days}/30 days payable`))}
              {row(T("غياب", "Absence"), l.absence_deduction, true, T(`${l.absent_days} يوم`, `${l.absent_days} d`))}
              {row(T("إجازة بدون راتب", "Unpaid leave"), l.unpaid_deduction, true, T(`${l.unpaid_days} يوم`, `${l.unpaid_days} d`))}
              {row(T("تأخير", "Lateness"), l.late_deduction, true, T(`${l.late_minutes} دقيقة`, `${l.late_minutes} min`))}
              {row(T("التأمينات الاجتماعية", "GOSI"), l.gosi_employee, true, `${pl(ar, PAY.scheme, l.gosi_scheme)}`)}
              {l.loans.map((x) => <li key={x.loan_id}><span>{T("قسط", "Instalment")} {x.number}<small> · {T("متبقٍ", "left")} {sar(ar, x.remaining, 0)}</small></span><b className="py-neg">{sar(ar, x.amount)}</b></li>)}
              {l.adjustments.filter((a) => a.kind === "deduction").map((a, i) => <li key={i}><span>{a.label}</span><b className="py-neg">{sar(ar, a.amount)}</b></li>)}
              <li className="is-sum"><span>{T("الإجمالي", "Total")}</span><b className="py-neg">{sar(ar, l.total_deductions)}</b></li>
            </ul>
          </section>
        </div>
        <div className="py-net"><span>{T("صافي الراتب", "Net pay")}</span><b>{sar(ar, l.net)}</b><small>{T(`تأمينات صاحب العمل ${sar(ar, l.gosi_employer)} على أجر ${sar(ar, l.gosi_base, 0)}`, `Employer GOSI ${sar(ar, l.gosi_employer)} on SAR ${l.gosi_base.toLocaleString()}`)}</small></div>
        {l.warnings.length > 0 && <ul className="py-warns">{l.warnings.map((w) => <li key={w.code}><span className="ms ms-sm" aria-hidden>warning</span>{w.label}{(w.code === "no_iban" || w.code === "bad_iban") && <> — <Link href={`/${locale}/hr/people/${l.user_id}?tab=bank`}>{T("تحديث الحساب البنكي", "update bank details")}</Link></>}</li>)}</ul>}

        {editable && (
          <section className="py-edit">
            <h4>{T("تعديل هذا الشهر", "Adjust this month")}</h4>
            <div className="ef-g3">
              {([["overtime_hours", T("ساعات العمل الإضافي", "Overtime hours")], ["absent_days", T("أيام الغياب", "Absent days")], ["unpaid_days", T("أيام إجازة بدون راتب", "Unpaid leave days")], ["late_minutes", T("دقائق التأخير", "Late minutes")]] as const).map(([k, label]) => (
                <label key={k} className="field"><span>{label}{auto(k) && <button type="button" className="py-reset" onClick={() => save([k])}>{T("إرجاع للحساب الآلي", "back to automatic")}</button>}</span>
                  <input className="input" type="number" min={0} step={k === "late_minutes" ? 1 : 0.5} dir="ltr" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
              ))}
            </div>
            <h4>{T("إضافات وخصومات", "Additions & deductions")}</h4>
            {adj.length > 0 && <ul className="py-adj">{adj.map((a, i) => (
              <li key={i}><span className={`py-tag ${a.kind === "deduction" ? "is-warn" : "is-ok"}`}>{a.kind === "addition" ? T("إضافة", "Addition") : T("خصم", "Deduction")}</span>{a.label}<b>{sar(ar, a.amount)}</b>
                <button className="icon-btn" aria-label={T("حذف", "Remove")} onClick={() => setAdj(adj.filter((_, j) => j !== i))}><span className="ms ms-sm">close</span></button></li>
            ))}</ul>}
            <div className="py-adj__new">
              <select className="select" value={na.kind} onChange={(e) => setNa({ ...na, kind: e.target.value as "addition" | "deduction" })} aria-label={T("النوع", "Type")}><option value="addition">{T("إضافة (مكافأة، عمولة…)", "Addition (bonus, commission…)")}</option><option value="deduction">{T("خصم (جزاء، تلفيات…)", "Deduction (penalty, damage…)")}</option></select>
              <input className="input" value={na.label} onChange={(e) => setNa({ ...na, label: e.target.value })} placeholder={T("الوصف", "Description")} />
              <input className="input" type="number" min={0} dir="ltr" value={na.amount} onChange={(e) => setNa({ ...na, amount: e.target.value })} placeholder={T("المبلغ", "Amount")} />
              <button className="btn btn-secondary btn-sm" disabled={na.label.trim().length < 2 || !Number(na.amount)} onClick={() => { setAdj([...adj, { kind: na.kind, label: na.label.trim(), amount: Number(na.amount) }]); setNa({ ...na, label: "", amount: "" }); }}>{T("إضافة", "Add")}</button>
            </div>
            <div className="ct-toggles">
              {l.loans.length > 0 || f.skip_loans ? <label className="ct-check"><input type="checkbox" checked={f.skip_loans} onChange={(e) => setF({ ...f, skip_loans: e.target.checked })} />{T("تأجيل أقساط السلف هذا الشهر", "Skip loan instalments this month")}</label> : null}
              <label className="ct-check"><input type="checkbox" checked={f.excluded} onChange={(e) => setF({ ...f, excluded: e.target.checked })} />{T("استبعاد الموظف من هذا المسير", "Leave this employee out of this payroll")}</label>
            </div>
            <label className="field"><span>{T("ملاحظة", "Note")}</span><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
            {err && <p className="mx-err">{err}</p>}
          </section>
        )}
      </div>
    </Modal>
  );
}
