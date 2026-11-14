"use client";

import Link from "next/link";

import { CompanyMark } from "@/components/hr/ContractPaper";
import { PAY, monthLabel, pl, sar, type Payslip } from "@/lib/payroll";

export function PayslipDoc({ locale, p, back }: { locale: string; p: Payslip; back: string }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const head = p.company ?? { name_ar: "مكتسبات" };
  const earn: [string, number, string?][] = [
    [T("الراتب الأساسي", "Basic salary"), p.basic], [T("بدل السكن", "Housing allowance"), p.housing], [T("بدل النقل", "Transport allowance"), p.transport],
    [p.other_allowance_label || T("بدلات أخرى", "Other allowances"), p.other_allowance],
    [T("العمل الإضافي", "Overtime"), p.overtime_amount, p.overtime_hours ? T(`${p.overtime_hours} ساعة`, `${p.overtime_hours} h`) : undefined],
    ...p.adjustments.filter((a) => a.kind === "addition").map((a) => [a.label, a.amount] as [string, number]),
  ];
  const ded: [string, number, string?][] = [
    [T("أيام خارج فترة العمل", "Days outside employment"), p.proration_deduction, T(`${p.payable_days} يوم مستحق`, `${p.payable_days} days payable`)],
    [T("غياب", "Absence"), p.absence_deduction, p.absent_days ? T(`${p.absent_days} يوم`, `${p.absent_days} d`) : undefined],
    [T("إجازة بدون راتب", "Unpaid leave"), p.unpaid_deduction, p.unpaid_days ? T(`${p.unpaid_days} يوم`, `${p.unpaid_days} d`) : undefined],
    [T("تأخير", "Lateness"), p.late_deduction, p.late_minutes ? T(`${p.late_minutes} دقيقة`, `${p.late_minutes} min`) : undefined],
    [T("التأمينات الاجتماعية", "GOSI (social insurance)"), p.gosi_employee],
    ...p.loans.map((l) => [T(`قسط ${l.number}`, `Instalment ${l.number}`), l.amount, T(`متبقٍ ${sar(ar, l.remaining, 0)}`, `left ${sar(ar, l.remaining, 0)}`)] as [string, number, string]),
    ...p.adjustments.filter((a) => a.kind === "deduction").map((a) => [a.label, a.amount] as [string, number]),
  ];
  const rows = (xs: [string, number, string?][]) => xs.filter(([, v]) => v).map(([k, v, h], i) => <tr key={i}><td>{k}{h && <small> · {h}</small>}</td><td className="num">{sar(ar, v)}</td></tr>);

  return (
    <div className="page screen-enter">
      <div className="cdoc-bar no-print">
        <Link className="btn btn-ghost btn-sm" href={back}><span className="ms ms-sm" aria-hidden>{ar ? "arrow_forward" : "arrow_back"}</span>{T("رجوع", "Back")}</Link>
        <div className="cdoc-bar__end"><button className="btn btn-primary btn-sm" onClick={() => window.print()}><span className="ms ms-sm" aria-hidden>print</span>{T("طباعة / PDF", "Print / PDF")}</button></div>
      </div>
      <article className="slip" dir={ar ? "rtl" : "ltr"} style={{ ["--c" as string]: head.color || "#7B1A1A" }}>
        <header className="slip__head">
          <CompanyMark head={head} size={54} />
          <div><b>{ar ? head.name_ar : head.name_en || head.name_ar}</b>{head.cr && <small>{T("س.ت", "CR")} {head.cr}</small>}</div>
          <div className="slip__title"><h2>{T("قسيمة راتب", "Payslip")}</h2><span>{monthLabel(ar, p.month)}</span></div>
        </header>
        <dl className="slip__facts">
          <div><dt>{T("الموظف", "Employee")}</dt><dd>{p.name}</dd></div>
          <div><dt>{T("الرقم الوظيفي", "Employee no.")}</dt><dd dir="ltr">{p.employee_no || "—"}</dd></div>
          <div><dt>{T("المسمى", "Job title")}</dt><dd>{p.job_title || "—"}</dd></div>
          <div><dt>{T("رقم الهوية/الإقامة", "ID / Iqama")}</dt><dd dir="ltr">{p.id_number || "—"}</dd></div>
          <div><dt>{T("الحساب", "Account")}</dt><dd dir="ltr">{p.iban ? `${p.bank_code ?? ""} ···${p.iban.slice(-4)}` : "—"}</dd></div>
          <div><dt>{T("تاريخ الصرف", "Paid on")}</dt><dd dir="ltr">{p.payment_date || pl(ar, PAY.status, p.status)}</dd></div>
        </dl>
        <div className="slip__cols">
          <table className="slip__tbl"><thead><tr><th>{T("الاستحقاقات", "Earnings")}</th><th className="num">{T("المبلغ", "Amount")}</th></tr></thead>
            <tbody>{rows(earn)}</tbody><tfoot><tr><td>{T("الإجمالي", "Gross")}</td><td className="num">{sar(ar, p.gross)}</td></tr></tfoot></table>
          <table className="slip__tbl"><thead><tr><th>{T("الاستقطاعات", "Deductions")}</th><th className="num">{T("المبلغ", "Amount")}</th></tr></thead>
            <tbody>{rows(ded)}</tbody><tfoot><tr><td>{T("الإجمالي", "Total")}</td><td className="num">{sar(ar, p.total_deductions)}</td></tr></tfoot></table>
        </div>
        <div className="slip__net"><span>{T("صافي الراتب المحوَّل", "Net pay transferred")}</span><b>{sar(ar, p.net)}</b></div>
        <p className="slip__foot">{T(`تأمينات صاحب العمل ${sar(ar, p.gosi_employer)} محسوبة على أجر ${sar(ar, p.gosi_base, 0)} (${pl(ar, PAY.scheme, p.gosi_scheme)}). وثيقة صادرة إلكترونيًا من نظام مكتسبات.`, `Employer GOSI of ${sar(ar, p.gosi_employer)} on a wage of ${sar(ar, p.gosi_base, 0)} (${pl(ar, PAY.scheme, p.gosi_scheme)}). Issued electronically by the Muktasabat system.`)}</p>
      </article>
    </div>
  );
}
