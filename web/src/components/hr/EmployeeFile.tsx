"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import {
  hrAddFamily, hrBankDecision, hrCreateContract, hrDeleteContract, hrDeleteFamily, hrEditContract, hrEditFamily, hrSavePersonal, hrSendContract,
  hrSetBank, hrTerminateContract, meAckAsset, meAddFamily, meCancelBank, meDeleteFamily, meEditFamily, meRequestBank, meRespondContract, meSavePersonal,
} from "@/lib/hr-people-actions";
import { BANKS, HP, lb, type Company, type Contract, type EmpFile, type Family } from "@/lib/hr-people";

type Tab = "overview" | "personal" | "family" | "bank" | "contracts" | "assets";
type Res = { ok: boolean; error?: string };

export function EmployeeFile({ locale, data, mode, companies = [] }: { locale: string; data: EmpFile; mode: "self" | "hr"; companies?: Company[] }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const self = mode === "self";
  const canEdit = self || !!data.can?.edit;
  const canApprove = !!data.can?.approve;
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("tab") as Tab | null; if (t) setTab(t); }, []);
  const pendingContract = data.contracts.find((c) => c.status === "pending_acceptance");
  const unacked = data.assets.filter((a) => !a.acknowledged_at).length;
  const tabs: [Tab, string, string, number?][] = [
    ["overview", T("نظرة عامة", "Overview"), "badge"],
    ["personal", T("البيانات الشخصية", "Personal"), "person"],
    ["family", T("العائلة", "Family"), "family_restroom", data.family.length || undefined],
    ["bank", T("الحساب البنكي", "Bank"), "account_balance", data.bank.pending ? 1 : undefined],
    ["contracts", T("الراتب والعقود", "Salary & contracts"), "contract", pendingContract ? 1 : undefined],
    ["assets", T("العُهد", "Assets"), "inventory_2", data.assets.length || undefined],
  ];

  return (
    <div className="page screen-enter ef">
      <header className="ef-head" style={{ ["--cc" as string]: data.job.company_color || "var(--color-primary)" }}>
        <span className="ef-avatar" aria-hidden>{data.user.name.slice(0, 1)}</span>
        <div className="ef-id">
          <h2 className="page-title">{data.user.name}</h2>
          <p>{[data.job.job_title, data.job.department].filter(Boolean).join(" · ") || "—"}</p>
          <div className="ef-tags">
            {data.job.company && <span className="ef-company">{data.job.company}</span>}
            {data.job.employee_no && <span className="mx-chip">#{data.job.employee_no}</span>}
            {data.job.manager && <span className="mx-chip">{T("المدير المباشر", "Reports to")}: {data.job.manager}</span>}
          </div>
        </div>
        {!self && <Link className="btn btn-secondary" href={`/${locale}/hr`}><span className="ms">arrow_back</span>{T("الموارد البشرية", "HR")}</Link>}
      </header>

      {self && pendingContract && (
        <button className="ef-banner" onClick={() => setTab("contracts")}><span className="ms">contract_edit</span>{T(`عقد العمل ${pendingContract.number} بانتظار مراجعتك وموافقتك`, `Employment contract ${pendingContract.number} is waiting for your review`)}</button>
      )}
      {self && unacked > 0 && (
        <button className="ef-banner" onClick={() => setTab("assets")}><span className="ms">inventory_2</span>{T(`${unacked} عهدة بانتظار تأكيد الاستلام`, `${unacked} asset(s) waiting for you to confirm receipt`)}</button>
      )}

      <nav className="hr-tabs" role="tablist">
        {tabs.map(([k, l, i, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>
            <span className="ms ms-sm" aria-hidden>{i}</span>{l}{n ? <b>{n}</b> : null}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview data={data} ar={ar} onTab={setTab} />}
      {tab === "personal" && <Personal data={data} ar={ar} canEdit={canEdit} self={self} />}
      {tab === "family" && <FamilyTab data={data} ar={ar} canEdit={canEdit} self={self} />}
      {tab === "bank" && <BankTab data={data} ar={ar} self={self} canApprove={canApprove} />}
      {tab === "contracts" && <Contracts data={data} ar={ar} self={self} canApprove={canApprove} companies={companies} />}
      {tab === "assets" && <Assets data={data} ar={ar} self={self} locale={locale} />}
    </div>
  );
}

const money = (ar: boolean, n?: number | null) => (n == null ? "—" : `${new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 }).format(n)} ${ar ? "ر.س" : "SAR"}`);
const inDays = (d?: string | null) => (d ? Math.round((new Date(d + "T00:00:00").getTime() - Date.now()) / 86_400_000) : null);

function Fact({ label, value, warn }: { label: string; value?: React.ReactNode; warn?: boolean }) {
  return <div className={warn ? "ef-warn" : ""}><dt>{label}</dt><dd>{value || "—"}</dd></div>;
}

function useRun() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (p: () => Promise<Res>, ok?: string, after?: () => void) => start(async () => {
    setErr(null); setMsg(null);
    const r = await p();
    if (!r.ok) return setErr(r.error ?? "Error");
    if (ok) setMsg(ok);
    after?.();
    router.refresh();
  });
  return { err, msg, pending, run, setErr };
}

/* ───────── overview ───────── */
function Overview({ data, ar, onTab }: { data: EmpFile; ar: boolean; onTab: (t: Tab) => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const p = data.personal;
  const s = data.salary;
  const idDays = inDays(p.id_expiry);
  const ppDays = inDays(p.passport_expiry);
  return (
    <div className="ef-grid">
      <section className="card hr-sec">
        <header className="hr-sec__head"><h3>{T("الوظيفة", "Job")}</h3></header>
        <dl className="mx-facts">
          <Fact label={T("الشركة", "Company")} value={data.job.company} />
          <Fact label={T("القسم", "Department")} value={data.job.department} />
          <Fact label={T("المسمى الوظيفي", "Job title")} value={data.job.job_title} />
          <Fact label={T("المدير المباشر", "Reports to")} value={data.job.manager} />
          <Fact label={T("تاريخ التعيين", "Hire date")} value={data.job.hire_date} />
          <Fact label={T("البريد / الجوال", "Email / phone")} value={<span dir="ltr">{[data.user.email, data.user.phone].filter(Boolean).join(" · ")}</span>} />
        </dl>
      </section>
      <section className="card hr-sec">
        <header className="hr-sec__head"><h3>{T("الراتب الحالي", "Current salary")}</h3><button className="btn btn-ghost btn-sm" onClick={() => onTab("contracts")}>{T("العقود", "Contracts")}</button></header>
        {!data.salary_visible ? <p className="text-sec">{T("بيانات الراتب متاحة للموظف ومدير الموارد البشرية فقط.", "Salary is visible to the employee and the HR manager only.")}</p>
          : !s ? <p className="text-sec">{T("لا يوجد عقد ساري حاليًا.", "No active contract right now.")}</p> : (
          <div className="ef-salary">
            <strong>{money(ar, s.total_salary)}</strong><span>{T("إجمالي شهري", "monthly total")}</span>
            <ul>
              <li><span>{T("الراتب الأساسي", "Basic salary")}</span><b>{money(ar, s.basic_salary)}</b></li>
              <li><span>{T("بدل السكن", "Housing")}</span><b>{money(ar, s.housing_allowance)}</b></li>
              <li><span>{T("بدل النقل", "Transport")}</span><b>{money(ar, s.transport_allowance)}</b></li>
              {!!s.other_allowance && <li><span>{s.other_allowance_label || T("بدلات أخرى", "Other")}</span><b>{money(ar, s.other_allowance)}</b></li>}
            </ul>
            <p className="text-sec">{T(`العقد ${s.number} ساري من ${s.start_date}${s.end_date ? ` حتى ${s.end_date}` : ""}`, `Contract ${s.number}, ${s.start_date}${s.end_date ? ` → ${s.end_date}` : " onwards"}`)}</p>
          </div>
        )}
      </section>
      <section className="card hr-sec">
        <header className="hr-sec__head"><h3>{T("الوثائق", "Documents")}</h3><button className="btn btn-ghost btn-sm" onClick={() => onTab("personal")}>{T("تعديل", "Edit")}</button></header>
        <dl className="mx-facts">
          <Fact label={lb(ar, HP.idType, p.id_type || "national_id")} value={p.id_number && <span dir="ltr">{p.id_number}</span>} />
          <Fact label={T("انتهاء الهوية", "ID expiry")} value={p.id_expiry && `${p.id_expiry}${idDays != null && idDays < 60 ? T(` (بعد ${idDays} يوم)`, ` (in ${idDays} days)`) : ""}`} warn={idDays != null && idDays < 60} />
          <Fact label={T("رقم الجواز", "Passport no.")} value={p.passport_number && <span dir="ltr">{p.passport_number}</span>} />
          <Fact label={T("انتهاء الجواز", "Passport expiry")} value={p.passport_expiry && `${p.passport_expiry}${ppDays != null && ppDays < 90 ? T(` (بعد ${ppDays} يوم)`, ` (in ${ppDays} days)`) : ""}`} warn={ppDays != null && ppDays < 90} />
        </dl>
      </section>
      <section className="card hr-sec">
        <header className="hr-sec__head"><h3>{T("ملخص", "Summary")}</h3></header>
        <ul className="ef-counts">
          <li><button onClick={() => onTab("family")}><b>{data.family.length}</b>{T("أفراد العائلة", "Family members")}</button></li>
          <li><button onClick={() => onTab("assets")}><b>{data.assets.length}</b>{T("عُهد مسلّمة", "Assets held")}</button></li>
          <li><button onClick={() => onTab("contracts")}><b>{data.contracts.length}</b>{T("عقود", "Contracts")}</button></li>
          <li><button onClick={() => onTab("bank")}><b>{data.bank.iban ? "✓" : "—"}</b>{T("حساب الراتب", "Salary account")}</button></li>
        </ul>
      </section>
    </div>
  );
}

/* ───────── personal ───────── */
function Personal({ data, ar, canEdit, self }: { data: EmpFile; ar: boolean; canEdit: boolean; self: boolean }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(data.personal).map(([k, v]) => [k, v ?? ""])));
  const { err, msg, pending, run } = useRun();
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));
  const inp = (k: string, label: string, type = "text", dir?: "ltr") => (
    <label className="field"><span>{label}</span><input className="input" type={type} dir={dir} disabled={!canEdit} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></label>
  );
  const sel = (k: string, label: string, map: Record<string, readonly [string, string]>) => (
    <label className="field"><span>{label}</span><select className="select" disabled={!canEdit} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)}><option value="">—</option>{Object.keys(map).map((x) => <option key={x} value={x}>{lb(ar, map, x)}</option>)}</select></label>
  );
  const save = () => {
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === "" ? null : v]));
    run(() => (self ? meSavePersonal(body) : hrSavePersonal(data.user.id, body)), T("حُفظت البيانات.", "Saved."));
  };
  return (
    <section className="card hr-sec ef-form">
      <h3>{T("الاسم", "Name")}</h3>
      <div className="ef-g3">
        {inp("first_name_ar", T("الاسم الأول (عربي)", "First name (Arabic)"))}
        {inp("father_name_ar", T("اسم الأب (عربي)", "Father's name (Arabic)"))}
        {inp("family_name_ar", T("اسم العائلة (عربي)", "Family name (Arabic)"))}
        {inp("first_name_en", T("الاسم الأول (إنجليزي)", "First name (English)"), "text", "ltr")}
        {inp("family_name_en", T("اسم العائلة (إنجليزي)", "Family name (English)"), "text", "ltr")}
      </div>
      <h3>{T("البيانات الشخصية", "Personal details")}</h3>
      <div className="ef-g3">
        {inp("date_of_birth", T("تاريخ الميلاد", "Date of birth"), "date")}
        {sel("gender", T("الجنس", "Gender"), HP.gender)}
        {sel("marital_status", T("الحالة الاجتماعية", "Marital status"), HP.marital)}
        {inp("personal_phone", T("الجوال الشخصي", "Personal phone"), "tel", "ltr")}
        {inp("personal_email", T("البريد الشخصي", "Personal email"), "email", "ltr")}
        {inp("city", T("المدينة", "City"))}
      </div>
      {inp("address", T("العنوان الوطني / السكن", "National address / home"))}
      <h3>{T("الهوية والجواز", "ID & passport")}</h3>
      <div className="ef-g3">
        {sel("id_type", T("نوع الهوية", "ID type"), HP.idType)}
        {inp("id_number", T("رقم الهوية / الإقامة", "ID / Iqama number"), "text", "ltr")}
        {inp("id_expiry", T("تاريخ انتهاء الهوية", "ID expiry"), "date")}
        {inp("passport_number", T("رقم الجواز", "Passport number"), "text", "ltr")}
        {inp("passport_country", T("جهة إصدار الجواز", "Issuing country"))}
        {inp("passport_issue", T("تاريخ الإصدار", "Issue date"), "date")}
        {inp("passport_expiry", T("تاريخ الانتهاء", "Expiry date"), "date")}
        {inp("gosi_number", T("رقم التأمينات (GOSI)", "GOSI number"), "text", "ltr")}
      </div>
      <h3>{T("جهة اتصال للطوارئ", "Emergency contact")}</h3>
      <div className="ef-g3">
        {inp("emergency_name", T("الاسم", "Name"))}
        {inp("emergency_relation", T("صلة القرابة", "Relationship"))}
        {inp("emergency_phone", T("الجوال", "Phone"), "tel", "ltr")}
      </div>
      {canEdit && <div className="ef-actions"><button className="btn btn-primary" disabled={pending} onClick={save}>{T("حفظ البيانات", "Save details")}</button>{data.updated_by && <span className="text-sec">{T(`آخر تحديث: ${data.updated_by} · ${data.updated_at?.slice(0, 10)}`, `Last updated by ${data.updated_by} · ${data.updated_at?.slice(0, 10)}`)}</span>}</div>}
      {msg && <p className="col-ok">{msg}</p>}{err && <p className="mx-err">{err}</p>}
    </section>
  );
}

/* ───────── family ───────── */
function FamilyTab({ data, ar, canEdit, self }: { data: EmpFile; ar: boolean; canEdit: boolean; self: boolean }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const [edit, setEdit] = useState<Family | "new" | null>(null);
  const { err, pending, run } = useRun();
  return (
    <section className="card hr-sec">
      <header className="hr-sec__head"><h3>{T("أفراد العائلة والمعالون", "Family & dependants")}</h3>{canEdit && <button className="btn btn-primary btn-sm" onClick={() => setEdit("new")}><span className="ms ms-sm">add</span>{T("إضافة", "Add")}</button>}</header>
      {data.family.length === 0 ? <p className="text-sec">{T("لم تُضف أي بيانات عائلية بعد. أضف الزوج/الزوجة والأبناء لاستحقاقات التأمين الطبي والتذاكر.", "No family members yet. Add your spouse and children for medical insurance and ticket entitlements.")}</p> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>{T("الاسم", "Name")}</th><th>{T("الصلة", "Relation")}</th><th>{T("تاريخ الميلاد", "Born")}</th><th>{T("رقم الهوية", "ID")}</th><th>{T("معال", "Dependant")}</th>{canEdit && <th />}</tr></thead>
          <tbody>{data.family.map((m) => (
            <tr key={m.id}>
              <td><strong>{m.name}</strong>{m.phone && <div className="text-sec" style={{ fontSize: 12 }} dir="ltr">{m.phone}</div>}</td>
              <td>{lb(ar, HP.relation, m.relation)}</td><td>{m.date_of_birth ?? "—"}</td><td dir="ltr">{m.id_number ?? "—"}</td>
              <td>{m.dependent ? T("نعم", "Yes") : T("لا", "No")}</td>
              {canEdit && <td className="ef-rowact"><button className="btn btn-ghost btn-sm" onClick={() => setEdit(m)}>{T("تعديل", "Edit")}</button>
                <button className="btn btn-ghost btn-sm mx-danger" disabled={pending} onClick={() => run(() => (self ? meDeleteFamily(m.id) : hrDeleteFamily(data.user.id, m.id)))}>{T("حذف", "Remove")}</button></td>}
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {err && <p className="mx-err">{err}</p>}
      {edit && <FamilyModal ar={ar} m={edit === "new" ? null : edit} onClose={() => setEdit(null)} save={(b) => edit === "new" ? (self ? meAddFamily(b) : hrAddFamily(data.user.id, b)) : (self ? meEditFamily(edit.id, b) : hrEditFamily(data.user.id, edit.id, b))} />}
    </section>
  );
}

function FamilyModal({ ar, m, onClose, save }: { ar: boolean; m: Family | null; onClose: () => void; save: (b: Record<string, unknown>) => Promise<Res> }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const [f, setF] = useState({ name: m?.name ?? "", relation: m?.relation ?? "son", date_of_birth: m?.date_of_birth ?? "", id_number: m?.id_number ?? "", passport_number: m?.passport_number ?? "", phone: m?.phone ?? "", dependent: m?.dependent ?? true, notes: m?.notes ?? "" });
  const { err, pending, run } = useRun();
  return (
    <Modal open onClose={onClose} title={m ? T("تعديل فرد من العائلة", "Edit family member") : T("إضافة فرد من العائلة", "Add family member")}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" disabled={pending || f.name.trim().length < 2} onClick={() => run(() => save({ ...f, date_of_birth: f.date_of_birth || null, id_number: f.id_number || null, passport_number: f.passport_number || null, phone: f.phone || null, notes: f.notes || null }), undefined, onClose)}>{T("حفظ", "Save")}</button></>}>
      <div className="mx-grid2">
        <label className="field"><span>{T("الاسم الكامل", "Full name")}</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field"><span>{T("صلة القرابة", "Relation")}</span><select className="select" value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>{Object.keys(HP.relation).map((k) => <option key={k} value={k}>{lb(ar, HP.relation, k)}</option>)}</select></label>
        <label className="field"><span>{T("تاريخ الميلاد", "Date of birth")}</span><input className="input" type="date" value={f.date_of_birth} onChange={(e) => setF({ ...f, date_of_birth: e.target.value })} /></label>
        <label className="field"><span>{T("رقم الهوية / الإقامة", "ID / Iqama number")}</span><input className="input" dir="ltr" value={f.id_number} onChange={(e) => setF({ ...f, id_number: e.target.value })} /></label>
        <label className="field"><span>{T("رقم الجواز", "Passport number")}</span><input className="input" dir="ltr" value={f.passport_number} onChange={(e) => setF({ ...f, passport_number: e.target.value })} /></label>
        <label className="field"><span>{T("الجوال", "Phone")}</span><input className="input" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
      </div>
      <label className="checkbox" style={{ marginTop: 12 }}><input type="checkbox" checked={f.dependent} onChange={(e) => setF({ ...f, dependent: e.target.checked })} />{T("معال (مشمول بالتأمين الطبي / التذاكر)", "Dependant (covered by medical insurance / tickets)")}</label>
      {err && <p className="mx-err">{err}</p>}
    </Modal>
  );
}

/* ───────── bank ───────── */
function BankTab({ data, ar, self, canApprove }: { data: EmpFile; ar: boolean; self: boolean; canApprove: boolean }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const b = data.bank;
  const [f, setF] = useState({ bank_name: b.pending?.bank_name ?? b.bank_name ?? BANKS[0], iban: "", account_holder: b.pending?.account_holder ?? b.account_holder ?? data.user.name_en ?? data.user.name });
  const { err, msg, pending, run } = useRun();
  const canChange = self || canApprove;
  return (
    <div className="ef-grid">
      <section className="card hr-sec">
        <header className="hr-sec__head"><h3>{T("حساب الراتب الحالي", "Current salary account")}</h3>{b.verified_at && <span className="mx-status mx-status--completed">{T("موثّق", "Verified")}</span>}</header>
        <dl className="mx-facts">
          <Fact label={T("البنك", "Bank")} value={b.bank_name} />
          <Fact label="IBAN" value={b.iban && <span dir="ltr" className="ef-mono">{b.iban.replace(/(.{4})/g, "$1 ").trim()}</span>} />
          <Fact label={T("اسم صاحب الحساب", "Account holder")} value={b.account_holder} />
          <Fact label={T("تاريخ التوثيق", "Verified on")} value={b.verified_at?.slice(0, 10)} />
        </dl>
      </section>
      <section className="card hr-sec">
        {b.pending ? (
          <>
            <header className="hr-sec__head"><h3>{T("طلب تغيير بانتظار الاعتماد", "Change waiting for approval")}</h3><span className="mx-status mx-status--awaiting_approval">{T("قيد المراجعة", "Under review")}</span></header>
            <dl className="mx-facts">
              <Fact label={T("البنك", "Bank")} value={b.pending.bank_name} />
              <Fact label="IBAN" value={<span dir="ltr" className="ef-mono">{b.pending.iban?.replace(/(.{4})/g, "$1 ").trim()}</span>} />
              <Fact label={T("صاحب الحساب", "Holder")} value={b.pending.account_holder} />
              <Fact label={T("تاريخ الطلب", "Requested")} value={b.pending.at?.slice(0, 10)} />
            </dl>
            <div className="ef-actions">
              {!self && canApprove && <>
                <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => hrBankDecision(data.user.id, true), T("اعتُمد الحساب الجديد.", "New account approved."))}>{T("اعتماد", "Approve")}</button>
                <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => hrBankDecision(data.user.id, false), T("رُفض الطلب.", "Request declined."))}>{T("رفض", "Decline")}</button>
              </>}
              {self && <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => meCancelBank())}>{T("إلغاء الطلب", "Cancel request")}</button>}
            </div>
            {!self && <p className="text-sec mx-hint">{T("تحقّق من شهادة الآيبان الصادرة من البنك وأن اسم صاحب الحساب يطابق اسم الموظف قبل الاعتماد.", "Check the bank-issued IBAN certificate and that the account holder matches the employee before approving.")}</p>}
          </>
        ) : canChange ? (
          <>
            <header className="hr-sec__head"><h3>{self ? T("طلب تغيير حساب الراتب", "Change salary account") : T("تعيين حساب الراتب", "Set salary account")}</h3></header>
            <div className="mx-form">
              <label className="field"><span>{T("البنك", "Bank")}</span><input className="input" list="ef-banks" value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /><datalist id="ef-banks">{BANKS.map((x) => <option key={x} value={x} />)}</datalist></label>
              <label className="field"><span>{T("رقم الآيبان (IBAN)", "IBAN")}</span><input className="input ef-mono" dir="ltr" placeholder="SA00 0000 0000 0000 0000 0000" value={f.iban} onChange={(e) => setF({ ...f, iban: e.target.value.toUpperCase() })} /></label>
              <label className="field"><span>{T("اسم صاحب الحساب (كما في البنك)", "Account holder (as at the bank)")}</span><input className="input" value={f.account_holder} onChange={(e) => setF({ ...f, account_holder: e.target.value })} /></label>
              <button className="btn btn-primary" disabled={pending || f.iban.replace(/\s/g, "").length < 24} onClick={() => run(() => (self ? meRequestBank(f) : hrSetBank(data.user.id, f)), self ? T("أُرسل الطلب لمدير الموارد البشرية.", "Sent to the HR manager for approval.") : T("حُفظ الحساب.", "Account saved."))}>
                {self ? T("إرسال للاعتماد", "Send for approval") : T("حفظ وتوثيق", "Save as verified")}
              </button>
              {self && <p className="text-sec mx-hint">{T("لحماية راتبك، لا يُطبَّق الحساب الجديد إلا بعد اعتماد الموارد البشرية.", "To protect your salary, a new account only applies after HR approves it.")}</p>}
            </div>
          </>
        ) : <p className="text-sec">{T("تعديل الحساب البنكي لمدير الموارد البشرية فقط.", "Only the HR manager can change bank details.")}</p>}
        {msg && <p className="col-ok">{msg}</p>}{err && <p className="mx-err">{err}</p>}
      </section>
    </div>
  );
}

/* ───────── contracts & salary ───────── */
function Contracts({ data, ar, self, canApprove, companies }: { data: EmpFile; ar: boolean; self: boolean; canApprove: boolean; companies: Company[] }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const [edit, setEdit] = useState<Contract | "new" | null>(null);
  const [view, setView] = useState<Contract | null>(null);
  const stCls = (s: string) => (s === "active" ? "mx-status--completed" : s === "pending_acceptance" || s === "upcoming" ? "mx-status--awaiting_approval" : s === "terminated" || s === "expired" ? "mx-status--cancelled" : "");
  return (
    <section className="card hr-sec">
      <header className="hr-sec__head"><h3>{T("عقود العمل", "Employment contracts")}</h3>{!self && canApprove && <button className="btn btn-primary btn-sm" onClick={() => setEdit("new")}><span className="ms ms-sm">add</span>{T("عقد جديد", "New contract")}</button>}</header>
      {data.contracts.length === 0 ? <p className="text-sec">{T("لا توجد عقود مسجلة.", "No contracts on file.")}</p> : (
        <div className="ef-contracts">
          {data.contracts.map((c) => (
            <article key={c.id} className={`ef-contract is-${c.state}`}>
              <div className="ef-contract__top">
                <div><strong>{c.number}</strong><span className="text-sec"> · {lb(ar, HP.ctype, c.contract_type)}{c.company ? ` · ${c.company}` : ""}</span></div>
                <span className={`mx-status ${stCls(c.state)}`}>{lb(ar, HP.cstate, c.state)}</span>
              </div>
              <div className="ef-contract__body">
                <div><span>{T("المدة", "Term")}</span><b>{c.start_date} {c.end_date ? `→ ${c.end_date}` : T("(غير محدد)", "(open-ended)")}</b>{c.state === "active" && c.days_left != null && <small>{T(`متبقٍ ${c.days_left} يوم`, `${c.days_left} days left`)}</small>}</div>
                <div><span>{T("المسمى", "Title")}</span><b>{c.job_title || "—"}</b></div>
                {c.total_salary != null && <div><span>{T("الراتب الإجمالي", "Total salary")}</span><b>{money(ar, c.total_salary)}</b><small>{T(`أساسي ${money(ar, c.basic_salary)}`, `basic ${money(ar, c.basic_salary)}`)}</small></div>}
                <div><span>{T("الموافقة", "Accepted")}</span><b>{c.accepted_at ? `${c.accepted_at.slice(0, 10)}` : "—"}</b>{c.accepted_name && <small>{c.accepted_name}</small>}</div>
              </div>
              {c.declined_note && c.status === "draft" && <p className="ef-note">{T("ملاحظة الموظف: ", "Employee note: ")}{c.declined_note}</p>}
              <div className="ef-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setView(c)}>{c.status === "pending_acceptance" && self ? T("مراجعة والموافقة", "Review & respond") : T("عرض البنود", "View terms")}</button>
                {!self && canApprove && c.status === "draft" && <>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEdit(c)}>{T("تعديل", "Edit")}</button>
                  <ContractAction label={T("إرسال للموظف", "Send to employee")} run={() => hrSendContract(c.id)} ar={ar} primary />
                  <ContractAction label={T("حذف", "Delete")} run={() => hrDeleteContract(c.id)} ar={ar} danger />
                </>}
                {!self && canApprove && c.status === "pending_acceptance" && <button className="btn btn-ghost btn-sm" onClick={() => setEdit(c)}>{T("تعديل", "Edit")}</button>}
              </div>
            </article>
          ))}
        </div>
      )}
      {edit && <ContractModal ar={ar} c={edit === "new" ? null : edit} userId={data.user.id} companyId={data.job.company_id} companies={companies} onClose={() => setEdit(null)} />}
      {view && <ContractView ar={ar} c={view} self={self} canApprove={canApprove} name={data.user.name} onClose={() => setView(null)} />}
    </section>
  );
}

function ContractAction({ label, run: fn, ar, primary, danger }: { label: string; run: () => Promise<Res>; ar: boolean; primary?: boolean; danger?: boolean }) {
  const { err, pending, run } = useRun();
  return <>{<button className={`btn ${primary ? "btn-primary" : "btn-ghost"} btn-sm ${danger ? "mx-danger" : ""}`} disabled={pending} onClick={() => run(fn)}>{label}</button>}{err && <span className="mx-err">{err}</span>}</>;
}

function ContractView({ ar, c, self, canApprove, name, onClose }: { ar: boolean; c: Contract; self: boolean; canApprove: boolean; name: string; onClose: () => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [term, setTerm] = useState({ on: new Date().toISOString().slice(0, 10), reason: "" });
  const { err, msg, pending, run } = useRun();
  return (
    <Modal open onClose={onClose} size="lg" title={`${c.number} — ${lb(ar, HP.ctype, c.contract_type)}`} subtitle={c.company ?? undefined}>
      <div className="mx-detail">
        <dl className="mx-facts">
          <Fact label={T("المسمى الوظيفي", "Job title")} value={c.job_title} />
          <Fact label={T("بداية العقد", "Start")} value={c.start_date} />
          <Fact label={T("نهاية العقد", "End")} value={c.end_date || T("غير محدد المدة", "Open-ended")} />
          <Fact label={T("نهاية فترة التجربة", "Probation ends")} value={c.probation_end} />
          {c.total_salary != null && <>
            <Fact label={T("الراتب الأساسي", "Basic salary")} value={money(ar, c.basic_salary)} />
            <Fact label={T("بدل السكن", "Housing allowance")} value={money(ar, c.housing_allowance)} />
            <Fact label={T("بدل النقل", "Transport allowance")} value={money(ar, c.transport_allowance)} />
            {!!c.other_allowance && <Fact label={c.other_allowance_label || T("بدلات أخرى", "Other allowance")} value={money(ar, c.other_allowance)} />}
            <Fact label={T("الإجمالي الشهري", "Monthly total")} value={<strong>{money(ar, c.total_salary)}</strong>} />
          </>}
          <Fact label={T("ساعات العمل الأسبوعية", "Hours per week")} value={c.working_hours_week} />
          <Fact label={T("الإجازة السنوية", "Annual leave")} value={c.annual_leave_days != null ? T(`${c.annual_leave_days} يوم`, `${c.annual_leave_days} days`) : null} />
          <Fact label={T("فترة الإشعار", "Notice period")} value={c.notice_days != null ? T(`${c.notice_days} يوم`, `${c.notice_days} days`) : null} />
          {c.accepted_at && <Fact label={T("وافق عليه", "Accepted by")} value={`${c.accepted_name} · ${c.accepted_at.slice(0, 16).replace("T", " ")}`} />}
          {c.terminated_at && <Fact label={T("انتهى في", "Ended on")} value={`${c.terminated_at} — ${c.termination_reason}`} />}
        </dl>
        {c.terms && <div className="ef-terms"><h4>{T("بنود العقد", "Terms")}</h4><div>{c.terms}</div></div>}
        {self && c.status === "pending_acceptance" && (
          <div className="mx-panel ef-sign">
            <p className="mx-hint">{T("بكتابة اسمك الكامل والموافقة، تُقر بأنك قرأت بنود العقد والراتب ووافقت عليها. يُسجَّل التاريخ والوقت.", "By typing your full name and accepting, you confirm you've read and agree to these terms and salary. The date and time are recorded.")}</p>
            <label className="field"><span>{T("اسمك الكامل", "Your full name")}</span><input className="input" value={typed} placeholder={name} onChange={(e) => setTyped(e.target.value)} /></label>
            <label className="field"><span>{T("ملاحظة (إن طلبت تعديلًا)", "Note (if asking for changes)")}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="mx-row">
              <button className="btn btn-primary btn-sm" disabled={pending || typed.trim().length < 3} onClick={() => run(() => meRespondContract(c.id, { accept: true, full_name: typed }), T("تمت الموافقة على العقد.", "Contract accepted."), onClose)}>{T("أوافق على العقد", "I accept this contract")}</button>
              <button className="btn btn-secondary btn-sm" disabled={pending || typed.trim().length < 3 || !note.trim()} onClick={() => run(() => meRespondContract(c.id, { accept: false, full_name: typed, note }), T("أُرسل طلب التعديل.", "Change request sent."), onClose)}>{T("طلب تعديل", "Ask for changes")}</button>
            </div>
          </div>
        )}
        {!self && canApprove && c.status === "accepted" && (
          <div className="mx-panel">
            <label className="field"><span>{T("تاريخ إنهاء العقد", "End date")}</span><input className="input" type="date" value={term.on} onChange={(e) => setTerm({ ...term, on: e.target.value })} /></label>
            <label className="field"><span>{T("السبب", "Reason")}</span><input className="input" value={term.reason} onChange={(e) => setTerm({ ...term, reason: e.target.value })} /></label>
            <button className="btn btn-danger btn-sm" disabled={pending || term.reason.trim().length < 2} onClick={() => run(() => hrTerminateContract(c.id, { end_on: term.on, reason: term.reason }), T("أُنهي العقد.", "Contract ended."), onClose)}>{T("إنهاء العقد", "End contract")}</button>
          </div>
        )}
        {msg && <p className="col-ok">{msg}</p>}{err && <p className="mx-err">{err}</p>}
      </div>
    </Modal>
  );
}

function ContractModal({ ar, c, userId, companyId, companies, onClose }: { ar: boolean; c: Contract | null; userId: number; companyId?: number | null; companies: Company[]; onClose: () => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<Record<string, string>>({
    company_id: String(c?.company_id ?? companyId ?? ""), contract_type: c?.contract_type ?? "fixed", job_title: c?.job_title ?? "", start_date: c?.start_date ?? today,
    end_date: c?.end_date ?? "", probation_end: c?.probation_end ?? "", basic_salary: String(c?.basic_salary ?? ""), housing_allowance: String(c?.housing_allowance ?? 0),
    transport_allowance: String(c?.transport_allowance ?? 0), other_allowance: String(c?.other_allowance ?? 0), other_allowance_label: c?.other_allowance_label ?? "",
    working_hours_week: String(c?.working_hours_week ?? 48), annual_leave_days: String(c?.annual_leave_days ?? 21), notice_days: String(c?.notice_days ?? 60), terms: c?.terms ?? "",
  });
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));
  const { err, pending, run } = useRun();
  const total = ["basic_salary", "housing_allowance", "transport_allowance", "other_allowance"].reduce((a, k) => a + (Number(f[k]) || 0), 0);
  const body = () => ({
    user_id: userId, company_id: f.company_id ? Number(f.company_id) : null, contract_type: f.contract_type, job_title: f.job_title || null, start_date: f.start_date,
    end_date: f.end_date || null, probation_end: f.probation_end || null, basic_salary: Number(f.basic_salary || 0), housing_allowance: Number(f.housing_allowance || 0),
    transport_allowance: Number(f.transport_allowance || 0), other_allowance: Number(f.other_allowance || 0), other_allowance_label: f.other_allowance_label || null,
    working_hours_week: Number(f.working_hours_week || 48), annual_leave_days: Number(f.annual_leave_days || 21), notice_days: Number(f.notice_days || 60), terms: f.terms || null,
  });
  const n = (k: string, l: string) => <label className="field"><span>{l}</span><input className="input" type="number" min={0} dir="ltr" value={f[k]} onChange={(e) => set(k, e.target.value)} /></label>;
  return (
    <Modal open onClose={onClose} size="lg" title={c ? T(`تعديل العقد ${c.number}`, `Edit contract ${c.number}`) : T("عقد عمل جديد", "New employment contract")}
      subtitle={T("يُحفظ كمسودة؛ أرسله للموظف ليوافق عليه من ملفه.", "Saved as a draft; send it to the employee to accept in their file.")}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" disabled={pending || !f.basic_salary} onClick={() => run(() => (c ? hrEditContract(c.id, body()) : hrCreateContract(body())), undefined, onClose)}>{T("حفظ المسودة", "Save draft")}</button></>}>
      <div className="mx-form">
        <div className="ef-g3">
          <label className="field"><span>{T("الشركة", "Company")}</span><select className="select" value={f.company_id} onChange={(e) => set("company_id", e.target.value)}>{companies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="field"><span>{T("نوع العقد", "Contract type")}</span><select className="select" value={f.contract_type} onChange={(e) => set("contract_type", e.target.value)}>{Object.keys(HP.ctype).map((k) => <option key={k} value={k}>{lb(ar, HP.ctype, k)}</option>)}</select></label>
          <label className="field"><span>{T("المسمى الوظيفي", "Job title")}</span><input className="input" value={f.job_title} onChange={(e) => set("job_title", e.target.value)} /></label>
          <label className="field"><span>{T("تاريخ البداية", "Start date")}</span><input className="input" type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} /></label>
          <label className="field"><span>{T("تاريخ النهاية", "End date")}</span><input className="input" type="date" value={f.end_date} onChange={(e) => set("end_date", e.target.value)} /></label>
          <label className="field"><span>{T("نهاية التجربة (حتى 180 يومًا)", "Probation end (max 180 days)")}</span><input className="input" type="date" value={f.probation_end} onChange={(e) => set("probation_end", e.target.value)} /></label>
        </div>
        <h4 className="mx-h">{T("الراتب الشهري", "Monthly salary")}</h4>
        <div className="ef-g3">
          {n("basic_salary", T("الراتب الأساسي", "Basic salary"))}
          {n("housing_allowance", T("بدل السكن", "Housing allowance"))}
          {n("transport_allowance", T("بدل النقل", "Transport allowance"))}
          {n("other_allowance", T("بدلات أخرى", "Other allowance"))}
          <label className="field"><span>{T("وصف البدلات الأخرى", "Other allowance label")}</span><input className="input" value={f.other_allowance_label} onChange={(e) => set("other_allowance_label", e.target.value)} /></label>
          <div className="field"><span>{T("الإجمالي", "Total")}</span><strong className="ef-total">{money(ar, total)}</strong></div>
        </div>
        <div className="ef-g3">
          {n("working_hours_week", T("ساعات العمل الأسبوعية", "Hours per week"))}
          {n("annual_leave_days", T("أيام الإجازة السنوية", "Annual leave days"))}
          {n("notice_days", T("فترة الإشعار (يوم)", "Notice period (days)"))}
        </div>
        <label className="field"><span>{T("بنود العقد", "Contract terms")}</span><textarea className="textarea" rows={8} value={f.terms} onChange={(e) => set("terms", e.target.value)} placeholder={T("المهام، مكان العمل، المزايا، السرية، عدم المنافسة…", "Duties, place of work, benefits, confidentiality, non-compete…")} /></label>
        {err && <p className="mx-err">{err}</p>}
      </div>
    </Modal>
  );
}

/* ───────── assets ───────── */
function Assets({ data, ar, self, locale }: { data: EmpFile; ar: boolean; self: boolean; locale: string }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const { err, pending, run } = useRun();
  return (
    <section className="card hr-sec">
      <header className="hr-sec__head"><h3>{T("العُهد المسلّمة", "Assets in custody")}</h3>{!self && <Link className="btn btn-ghost btn-sm" href={`/${locale}/hr?tab=assets`}>{T("سجل العُهد", "Asset register")}</Link>}</header>
      {data.assets.length === 0 ? <p className="text-sec">{T("لا توجد عُهد مسلّمة.", "No assets assigned.")}</p> : (
        <ul className="ef-assets">
          {data.assets.map((a) => (
            <li key={a.id}>
              <span className="ef-aico ms" aria-hidden>{HP.aicon[a.kind] ?? "inventory_2"}</span>
              <div>
                <strong>{a.name}</strong>
                <span className="text-sec">{[lb(ar, HP.akind, a.kind), a.brand_model, a.serial && `#${a.serial}`, a.tag].filter(Boolean).join(" · ")}</span>
                <span className="text-sec">{T(`منذ ${a.assigned_at}`, `since ${a.assigned_at}`)}{a.value != null ? ` · ${money(ar, a.value)}` : ""}</span>
              </div>
              {a.acknowledged_at ? <span className="mx-status mx-status--completed">{T("تم تأكيد الاستلام", "Receipt confirmed")}</span>
                : self ? <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => meAckAsset(a.id))}>{T("تأكيد الاستلام", "Confirm receipt")}</button>
                : <span className="mx-status mx-status--awaiting_approval">{T("لم يؤكد الاستلام", "Not confirmed")}</span>}
            </li>
          ))}
        </ul>
      )}
      {err && <p className="mx-err">{err}</p>}
      {data.returned_assets.length > 0 && <>
        <h4 className="mx-h">{T("عُهد سابقة (أُعيدت)", "Returned assets")}</h4>
        <ul className="ef-returned">{data.returned_assets.map((r, i) => <li key={i}>{r.name} <span className="text-sec">· {r.tag} · {r.returned_at.slice(0, 10)}{r.note ? ` · ${r.note.split(" — ").map((x, j) => (j === 0 && HP.cond[x] ? lb(ar, HP.cond, x) : x)).join(" — ")}` : ""}</span></li>)}</ul>
      </>}
      {self && <p className="text-sec mx-hint">{T("العهدة مسؤوليتك حتى تُسلَّم للموارد البشرية ويُسجَّل إرجاعها.", "Assets are your responsibility until HR records their return.")}</p>}
    </section>
  );
}
