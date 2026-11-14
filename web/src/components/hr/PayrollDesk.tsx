"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import type { Company } from "@/lib/hr-people";
import { PAY, monthLabel, pl, sar, type Loan, type PayRun, type PaySettings } from "@/lib/payroll";
import { payCancelLoan, payCreateLoan, payCreateRun, payDecideLoan, paySaveSettings } from "@/lib/payroll-actions";

type Res = { ok: boolean; error?: string; data?: unknown };

/** HR › Payroll: monthly runs per company, loans & advances, payroll rules. */
export function PayrollDesk({ locale, runs, loans, settings, companies, people }: {
  locale: string; runs: PayRun[]; loans: Loan[]; settings: PaySettings; companies: Company[]; people: { id: number; name: string }[];
}) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [comp, setComp] = useState(String(companies.find((c) => c.is_holding)?.id ?? companies[0]?.id ?? ""));
  const [month, setMonth] = useState(thisMonth);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [loanNew, setLoanNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const pendingLoans = loans.filter((l) => l.status === "pending");
  const activeLoans = loans.filter((l) => l.status === "approved");
  const outstanding = activeLoans.reduce((s, l) => s + l.remaining, 0);
  const last = runs.find((r) => r.status === "paid");

  const create = () => start(async () => {
    setErr(null);
    const r = await payCreateRun({ company_id: Number(comp), month });
    if (!r.ok) return setErr(r.error);
    router.push(`/${locale}/hr/payroll/${(r.data as { id: number }).id}`);
  });

  const byMonth = new Map<string, PayRun[]>();
  runs.forEach((r) => byMonth.set(r.month, [...(byMonth.get(r.month) ?? []), r]));

  return (
    <div className="py">
      <div className="py-kpis">
        <div className="py-kpi"><span className="ms" aria-hidden>payments</span><b>{last ? sar(ar, last.totals.net, 0) : "—"}</b><small>{last ? T(`آخر صافي مصروف · ${monthLabel(ar, last.month)}`, `Last net paid · ${monthLabel(ar, last.month)}`) : T("لا يوجد مسير مصروف بعد", "No payroll paid yet")}</small></div>
        <div className="py-kpi"><span className="ms" aria-hidden>account_balance</span><b>{last ? sar(ar, last.totals.cost, 0) : "—"}</b><small>{T("تكلفة الرواتب على الشركة (مع التأمينات)", "Payroll cost to the company (incl. GOSI)")}</small></div>
        <div className="py-kpi"><span className="ms" aria-hidden>pending_actions</span><b>{runs.filter((r) => r.status === "submitted").length}</b><small>{T("مسيرات بانتظار الاعتماد", "Runs awaiting approval")}</small></div>
        <div className="py-kpi"><span className="ms" aria-hidden>savings</span><b>{sar(ar, outstanding, 0)}</b><small>{T(`سلف وقروض قائمة (${activeLoans.length})`, `Outstanding advances & loans (${activeLoans.length})`)}</small></div>
      </div>

      <section className="card py-new">
        <div>
          <h3>{T("مسير رواتب جديد", "New payroll run")}</h3>
          <p className="text-sec">{T("يُحسب تلقائيًا من العقود السارية والحضور والتأمينات والأقساط. تراجعه وتعدّله ثم ترفعه للاعتماد.", "Calculated from active contracts, attendance, GOSI and loan instalments. Review, adjust, then submit for approval.")}</p>
        </div>
        <div className="py-new__form">
          <label className="field"><span>{T("الشركة", "Company")}</span><select className="select" value={comp} onChange={(e) => setComp(e.target.value)}>{companies.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="field"><span>{T("الشهر", "Month")}</span><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
          <button className="btn btn-primary" disabled={pending || !comp || !month} onClick={create}><span className="ms ms-sm" aria-hidden>calculate</span>{pending ? T("جارٍ الحساب…", "Calculating…") : T("إنشاء وحساب", "Create & calculate")}</button>
        </div>
        {err && <p className="mx-err">{err}</p>}
      </section>

      <section className="card py-runs">
        <header className="hr-sec__head"><h3>{T("المسيرات", "Payroll runs")}</h3></header>
        {runs.length === 0 ? <p className="text-sec">{T("لا توجد مسيرات بعد. ابدأ بمسير الشهر الحالي أعلاه.", "No payroll runs yet. Start with this month above.")}</p> : (
          [...byMonth.entries()].map(([m, list]) => (
            <div key={m} className="py-month">
              <h4>{monthLabel(ar, m)}</h4>
              <div className="py-month__runs">
                {list.map((r) => (
                  <Link key={r.id} href={`/${locale}/hr/payroll/${r.id}`} className={`py-run is-${r.status}`} style={{ ["--c" as string]: r.company_color || "#7B1A1A" }}>
                    <span className="py-run__co">{r.company_code || r.company}</span>
                    <div className="py-run__main">
                      <b>{r.company}</b>
                      <span className="text-sec">{T(`${r.totals.employees} موظف`, `${r.totals.employees} employees`)} · {T("صافي", "net")} {sar(ar, r.totals.net, 0)}</span>
                    </div>
                    {r.totals.warnings > 0 && r.status === "draft" && <span className="py-warn" title={T("تنبيهات تحتاج مراجعة", "Warnings to review")}><span className="ms ms-sm" aria-hidden>warning</span>{r.totals.warnings}</span>}
                    <span className={`py-status is-${r.status}`}>{pl(ar, PAY.status, r.status)}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="card py-loans">
        <header className="hr-sec__head">
          <h3>{T("السلف والقروض", "Advances & loans")}</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => setLoanNew(true)}><span className="ms ms-sm" aria-hidden>add</span>{T("سلفة أو قرض لموظف", "Advance or loan for an employee")}</button>
        </header>
        {pendingLoans.length > 0 && (
          <div className="py-pending">
            <h4>{T("طلبات بانتظار قرارك", "Requests waiting for you")}</h4>
            {pendingLoans.map((l) => <LoanDecision key={l.id} ar={ar} l={l} />)}
          </div>
        )}
        {loans.length === 0 ? <p className="text-sec">{T("لا توجد سلف أو قروض. يطلبها الموظف من خدماتي الوظيفية، أو تسجلها هنا.", "No advances or loans. Employees request them in My HR, or you record one here.")}</p> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{T("الرقم", "No.")}</th><th>{T("الموظف", "Employee")}</th><th>{T("النوع", "Type")}</th><th>{T("المبلغ", "Amount")}</th><th>{T("القسط الشهري", "Monthly")}</th><th>{T("المتبقي", "Remaining")}</th><th>{T("الحالة", "Status")}</th><th /></tr></thead>
            <tbody>{loans.filter((l) => l.status !== "pending").map((l) => (
              <tr key={l.id}>
                <td className="mono">{l.number}</td><td>{l.employee}</td><td>{pl(ar, PAY.kind, l.kind)}</td>
                <td>{sar(ar, l.amount, 0)}</td><td>{sar(ar, l.monthly_amount, 0)}<div className="text-sec py-small">{T(`من ${l.start_month}`, `from ${l.start_month}`)}{!l.consent ? T(" · بحد 10% (م92)", " · capped 10% (art. 92)") : ""}</div></td>
                <td><b>{sar(ar, l.remaining, 0)}</b><div className="py-bar" aria-hidden><i style={{ width: `${Math.min(100, (l.repaid / l.amount) * 100)}%` }} /></div></td>
                <td><span className={`py-status is-${l.status}`}>{pl(ar, PAY.loanStatus, l.status)}</span></td>
                <td>{l.status === "approved" && <CancelLoan ar={ar} id={l.id} />}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="card py-settings">
        <header className="hr-sec__head">
          <div>
            <h3>{T("قواعد الاحتساب", "Payroll rules")}</h3>
            <p className="text-sec py-small">{T(`التأمينات: السعودي (النظام الحالي) ${settings.gosi_old_employee}% موظف / ${settings.gosi_old_employer}% صاحب عمل · النظام الجديد حاليًا ${settings.gosi_new_annuities_now + settings.gosi_saned}% / ${settings.gosi_new_annuities_now + settings.gosi_saned + settings.gosi_hazards}% · غير السعودي ${settings.gosi_hazards}% على صاحب العمل.`, `GOSI: Saudi (existing) ${settings.gosi_old_employee}% employee / ${settings.gosi_old_employer}% employer · new law now ${settings.gosi_new_annuities_now + settings.gosi_saned}% / ${settings.gosi_new_annuities_now + settings.gosi_saned + settings.gosi_hazards}% · non-Saudi ${settings.gosi_hazards}% employer.`)}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(!showSettings)} aria-expanded={showSettings}>{showSettings ? T("إخفاء", "Hide") : T("تعديل", "Edit")}</button>
        </header>
        {showSettings && <SettingsForm ar={ar} s={settings} />}
      </section>

      {loanNew && <LoanModal ar={ar} people={people} onClose={() => setLoanNew(false)} />}
    </div>
  );
}

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<Res>, after?: () => void) => start(async () => {
    setErr(null);
    const r = await fn();
    if (!r.ok) return setErr(r.error ?? "Error");
    after?.();
    router.refresh();
  });
  return { pending, err, run };
}

function LoanDecision({ ar, l }: { ar: boolean; l: Loan }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const [note, setNote] = useState("");
  const [startM, setStartM] = useState(l.start_month);
  const { pending, err, run } = useAct();
  return (
    <div className="py-req">
      <div className="py-req__main">
        <b>{l.employee}</b> · {pl(ar, PAY.kind, l.kind)} {l.number}
        <div className="text-sec py-small">{sar(ar, l.amount, 0)} · {T(`${l.installments} قسط × ${sar(ar, l.monthly_amount, 0)}`, `${l.installments} × ${sar(ar, l.monthly_amount, 0)}`)}{l.reason ? ` · ${l.reason}` : ""}</div>
      </div>
      <label className="field py-req__m"><span>{T("بدء الخصم", "Deduct from")}</span><input className="input" type="month" value={startM} onChange={(e) => setStartM(e.target.value)} /></label>
      <input className="input py-req__note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={T("ملاحظة (مطلوبة عند الرفض)", "Note (required to decline)")} />
      <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => payDecideLoan(l.id, { approve: true, note: note || null, start_month: startM }))}>{T("اعتماد", "Approve")}</button>
      <button className="btn btn-secondary btn-sm" disabled={pending || note.trim().length < 2} onClick={() => run(() => payDecideLoan(l.id, { approve: false, note }))}>{T("رفض", "Decline")}</button>
      {err && <span className="mx-err">{err}</span>}
    </div>
  );
}

function CancelLoan({ ar, id }: { ar: boolean; id: number }) {
  const { pending, err, run } = useAct();
  return <>{<button className="btn btn-ghost btn-sm mx-danger" disabled={pending} onClick={() => run(() => payCancelLoan(id))}>{ar ? "إيقاف" : "Stop"}</button>}{err && <span className="mx-err">{err}</span>}</>;
}

function LoanModal({ ar, people, onClose }: { ar: boolean; people: { id: number; name: string }[]; onClose: () => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const [f, setF] = useState({ user_id: "", kind: "advance", amount: "", installments: "1", start_month: new Date().toISOString().slice(0, 7), reason: "", consent: true });
  const { pending, err, run } = useAct();
  const monthly = Number(f.amount) && Number(f.installments) ? Number(f.amount) / Number(f.installments) : 0;
  return (
    <Modal open onClose={onClose} title={T("تسجيل سلفة أو قرض", "Record an advance or loan")} subtitle={T("يُعتمد مباشرة ويُخصم القسط من الرواتب تلقائيًا.", "Approved immediately; instalments are deducted in payroll automatically.")}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" disabled={pending || !f.user_id || !Number(f.amount)} onClick={() => run(() => payCreateLoan({ ...f, user_id: Number(f.user_id), amount: Number(f.amount), installments: Number(f.installments), reason: f.reason || null }), onClose)}>{T("حفظ", "Save")}</button></>}>
      <div className="mx-grid2">
        <label className="field"><span>{T("الموظف", "Employee")}</span><select className="select" value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="field"><span>{T("النوع", "Type")}</span><select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, installments: e.target.value === "advance" ? "1" : f.installments })}><option value="advance">{T("سلفة على الراتب (حتى 3 أشهر)", "Salary advance (up to 3 months)")}</option><option value="loan">{T("قرض (حتى 60 شهرًا)", "Loan (up to 60 months)")}</option></select></label>
        <label className="field"><span>{T("المبلغ (ر.س)", "Amount (SAR)")}</span><input className="input" type="number" min={1} dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
        <label className="field"><span>{T("عدد الأقساط", "Instalments")}</span><input className="input" type="number" min={1} max={f.kind === "advance" ? 3 : 60} dir="ltr" value={f.installments} onChange={(e) => setF({ ...f, installments: e.target.value })} /><small className="text-sec">{monthly ? T(`القسط ${monthly.toFixed(2)} ر.س`, `SAR ${monthly.toFixed(2)} a month`) : ""}</small></label>
        <label className="field"><span>{T("بدء الخصم من شهر", "Start deducting in")}</span><input className="input" type="month" value={f.start_month} onChange={(e) => setF({ ...f, start_month: e.target.value })} /></label>
        <label className="field"><span>{T("السبب", "Reason")}</span><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
      </div>
      <label className="ct-check" style={{ marginTop: 10 }}><input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />{T("لدينا موافقة الموظف الكتابية على القسط (وإلا يُحدّ القسط بـ10% من الأجر وفق المادة 92)", "We have the employee's written consent to this instalment (otherwise it's capped at 10% of the wage, art. 92)")}</label>
      {err && <p className="mx-err">{err}</p>}
    </Modal>
  );
}

function SettingsForm({ ar, s }: { ar: boolean; s: PaySettings }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const [f, setF] = useState(s);
  const { pending, err, run } = useAct();
  const [ok, setOk] = useState(false);
  const n = (k: keyof PaySettings, label: string, step = 1) => (
    <label className="field"><span>{label}</span><input className="input" type="number" step={step} dir="ltr" value={String(f[k] ?? "")} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} /></label>
  );
  const b = (k: keyof PaySettings, label: string) => <label className="ct-check"><input type="checkbox" checked={Boolean(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{label}</label>;
  return (
    <div className="mx-form">
      <div className="ct-toggles">
        {b("deduct_absence", T("خصم أيام الغياب بلا عذر (أجر يومي = الشهري ÷ 30)", "Deduct unexcused absent days (daily wage = monthly ÷ 30)"))}
        {b("deduct_unpaid_leave", T("خصم الإجازة بدون راتب", "Deduct unpaid leave"))}
        {b("deduct_late", T("خصم التأخير بعد الحد المسموح شهريًا", "Deduct lateness above the monthly allowance"))}
      </div>
      <div className="ef-g3">
        {n("late_free_minutes", T("دقائق تأخير مسموحة شهريًا", "Lateness allowed per month (minutes)"))}
        {n("days_per_month", T("أيام الشهر للاحتساب", "Days per month for daily wage"))}
        {n("hours_per_day", T("ساعات العمل اليومية", "Working hours per day"))}
        {n("overtime_premium", T("علاوة العمل الإضافي (×الأجر الأساسي للساعة)", "Overtime premium (× hourly basic)"), 0.05)}
        {n("payment_day", T("يوم صرف الرواتب", "Pay day"))}
        {n("gosi_cap", T("سقف أجر التأمينات", "GOSI wage cap"))}
        {n("gosi_old_employee", T("تأمينات السعودي — حصة الموظف %", "Saudi GOSI — employee %"), 0.05)}
        {n("gosi_old_employer", T("تأمينات السعودي — حصة صاحب العمل %", "Saudi GOSI — employer %"), 0.05)}
        {n("gosi_hazards", T("الأخطار المهنية % (صاحب العمل)", "Occupational hazards % (employer)"), 0.05)}
        {n("gosi_saned", T("ساند % (لكل طرف)", "SANED % (each side)"), 0.05)}
      </div>
      <p className="text-sec py-small">{T("النظام الجديد للتأمينات (من التحق لأول مرة بعد 3 يوليو 2024) يُحسب تلقائيًا: المعاشات 9% وتزيد 0.5 نقطة كل 1 يوليو حتى 11%. حدّد نظام كل موظف من ملفه إن لزم.", "The new GOSI law (first-time entrants after 3 July 2024) is applied automatically: annuities 9% rising 0.5 pt every 1 July up to 11%. Set an employee's scheme on their file if needed.")}</p>
      <div className="mx-row">
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => paySaveSettings(f as unknown as Record<string, unknown>), () => setOk(true))}>{T("حفظ القواعد", "Save rules")}</button>
        {ok && <span className="col-ok">{T("حُفظت. تُطبّق عند إعادة حساب المسودات.", "Saved. Applies when drafts are recalculated.")}</span>}
        {err && <span className="mx-err">{err}</span>}
      </div>
    </div>
  );
}
