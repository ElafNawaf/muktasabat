"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import { FilterBar, FilterSearch, FilterSelect } from "@/components/EntityFilterBar";
import { Modal } from "@/components/Modal";

import { ContractPaper } from "./ContractPaper";
import { hrBulkIssue, hrDeleteTemplate, hrDuplicateTemplate, hrPreviewTemplate, hrSaveTemplate } from "@/lib/hr-people-actions";
import type { PreviewCompany } from "@/lib/hr-people-actions";
import { HP, lb, type Company, type Contract, type ContractsDesk as Desk, type ContractTemplate, type Placeholder } from "@/lib/hr-people";
import { ClickRow } from "@/components/ClickRow";

type Person = { id: number; name: string; company_id?: number | null };
type Res = { ok: boolean; error?: string };

/** HR › Contracts: every employment contract in the group, the templates they come from, and bulk issuing. */
export function ContractsDesk({ locale, desk, templates, placeholders, companies, people, canApprove }: {
  locale: string; desk: Desk; templates: ContractTemplate[]; placeholders: Placeholder[]; companies: Company[]; people: Person[]; canApprove: boolean;
}) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [view, setView] = useState<"contracts" | "templates">("contracts");
  const [filter, setFilter] = useState("all");
  const [comp, setComp] = useState("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<ContractTemplate | "new" | null>(null);
  const [bulk, setBulk] = useState<number[] | null>(null);
  const k = desk.counts;

  const sigState = (c: Contract) => (c.signed_digitally ? "digital" : c.signed_status ? c.signed_status : c.needs_signed ? "missing" : null);
  const shown = useMemo(() => desk.contracts.filter((c) => {
    if (comp !== "all" && String(c.company_id) !== comp) return false;
    if (q.trim() && !`${c.number} ${c.employee ?? ""} ${c.job_title ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    switch (filter) {
      case "waiting": return c.status === "pending_acceptance";
      case "verify": return c.signed_status === "uploaded";
      case "missing": return !!c.needs_signed;
      case "drafts": return c.status === "draft";
      case "active": return c.state === "active" || c.state === "upcoming";
      case "ending": return c.state === "active" && c.days_left != null && c.days_left <= 60;
      default: return true;
    }
  }), [desk.contracts, filter, comp, q]);

  const chips: [string, string, number, string][] = [
    ["verify", T("نسخ موقعة للتحقق", "Signed copies to verify"), k.signed_to_verify, "verified"],
    ["missing", T("بانتظار النسخة الموقعة", "Signed copy missing"), k.missing_signed, "upload_file"],
    ["waiting", T("بانتظار موافقة الموظف", "Waiting for employee"), k.waiting_employee, "hourglass_top"],
    ["drafts", T("مسودات", "Drafts"), k.drafts, "edit_note"],
  ];

  return (
    <>
      <div className="ct-head">
        <div className="rn-tabs" role="tablist">
          <button role="tab" aria-selected={view === "contracts"} className={view === "contracts" ? "is-on" : ""} onClick={() => setView("contracts")}>{T("عقود الموظفين", "Employee contracts")}</button>
          <button role="tab" aria-selected={view === "templates"} className={view === "templates" ? "is-on" : ""} onClick={() => setView("templates")}>{T("قوالب العقود", "Contract templates")} <b>{templates.filter((t) => t.active).length}</b></button>
        </div>
        {canApprove && (
          <div className="mx-row">
            {view === "templates" && <button className="btn btn-secondary" onClick={() => setEdit("new")}><span className="ms ms-sm" aria-hidden>add</span>{T("قالب جديد", "New template")}</button>}
            <button className="btn btn-primary" onClick={() => setBulk([])}><span className="ms ms-sm" aria-hidden>send</span>{T("إصدار عقود للموظفين", "Issue contracts")}</button>
          </div>
        )}
      </div>

      {view === "contracts" && <>
        <div className="ct-chips">
          {chips.map(([key, label, n, icon]) => (
            <button key={key} className={`ct-chip ${filter === key ? "is-on" : ""} ${n ? "has-n" : ""}`} onClick={() => setFilter(filter === key ? "all" : key)} aria-pressed={filter === key}>
              <span className="ms ms-sm" aria-hidden>{icon}</span><span>{label}</span><b>{n}</b>
            </button>
          ))}
        </div>
        <FilterBar search={<FilterSearch value={q} onChange={setQ} placeholder={T("بحث برقم العقد أو اسم الموظف…", "Search contract number or employee…")} />}>
          <FilterSelect label={T("العرض", "Show")} value={filter} onChange={setFilter} options={[
            { value: "all", label: T("كل العقود", "All contracts") }, { value: "active", label: T("سارية وقادمة", "Active & upcoming") },
            { value: "ending", label: T("تنتهي خلال 60 يومًا", "Ending within 60 days") }, ...chips.map(([value, label]) => ({ value, label })),
          ]} />
          <FilterSelect label={T("الشركة", "Company")} value={comp} onChange={setComp} options={[{ value: "all", label: T("كل المجموعة", "Whole group") }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]} />
        </FilterBar>
        {shown.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><span className="ms">contract</span></div>
            <div className="empty-title">{desk.contracts.length ? T("لا عقود مطابقة", "No matching contracts") : T("لا توجد عقود بعد", "No contracts yet")}</div>
            <div className="empty-sub">{T("أصدر العقود من قالب لكل الموظفين أو لموظف واحد من ملفه.", "Issue contracts from a template to many employees at once, or to one from their file.")}</div></div>
        ) : (
          <div className="card card-tight"><div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{T("العقد", "Contract")}</th><th>{T("الموظف", "Employee")}</th><th>{T("المدة", "Term")}</th><th>{T("الحالة", "Status")}</th><th>{T("التوقيع", "Signature")}</th></tr></thead>
            <tbody>{shown.map((c) => {
              const s = sigState(c);
              return (
                <ClickRow key={c.id} href={`/${locale}/my-hr/contracts/${c.id}`}>
                  <td><Link href={`/${locale}/my-hr/contracts/${c.id}`}><strong>{c.number}</strong></Link><div className="text-sec ct-sub">{lb(ar, HP.ctype, c.contract_type)}{c.company ? ` · ${c.company}` : ""}</div></td>
                  <td><Link href={`/${locale}/hr/people/${c.user_id}?tab=contracts`}>{c.employee}</Link><div className="text-sec ct-sub">{c.job_title || "—"}</div></td>
                  <td dir="ltr" className="ct-term">{c.start_date}{c.end_date ? ` → ${c.end_date}` : ""}{c.state === "active" && c.days_left != null && c.days_left <= 60 && <div className="ct-warn">{T(`متبقٍ ${c.days_left} يوم`, `${c.days_left} days left`)}</div>}</td>
                  <td><span className={`mx-status ${c.state === "active" ? "mx-status--completed" : c.state === "pending_acceptance" || c.state === "upcoming" ? "mx-status--awaiting_approval" : c.state === "draft" ? "" : "mx-status--cancelled"}`}>{lb(ar, HP.cstate, c.state)}</span></td>
                  <td>{s ? <Link href={`/${locale}/my-hr/contracts/${c.id}`} className={`ct-sig is-${s}`}>{lb(ar, HP.signed, s)}</Link> : <span className="text-sec">—</span>}</td>
                </ClickRow>
              );
            })}</tbody>
          </table></div></div>
        )}
        {desk.no_contract.length > 0 && (
          <section className="card hr-sec ct-none">
            <header className="hr-sec__head"><h3>{T(`موظفون بلا عقد ساري (${desk.no_contract.length})`, `Employees without an active contract (${desk.no_contract.length})`)}</h3>
              {canApprove && <button className="btn btn-secondary btn-sm" onClick={() => setBulk(desk.no_contract.map((x) => x.user_id))}>{T("إصدار عقود لهم", "Issue contracts to them")}</button>}</header>
            <ul className="ct-people">{desk.no_contract.map((x) => <li key={x.user_id}><Link href={`/${locale}/hr/people/${x.user_id}?tab=contracts`}>{x.name}</Link></li>)}</ul>
          </section>
        )}
      </>}

      {view === "templates" && (
        <div className="ct-tpls">
          {templates.map((t) => <TemplateCard key={t.id} ar={ar} t={t} canApprove={canApprove} onEdit={() => setEdit(t)} />)}
          <p className="text-sec ct-legal">{T("القالب نقطة بداية؛ راجع صياغته مع مستشار قانوني قبل اعتماده. تعديل القالب يحدّث المسودات والعقود التي لم يوافق عليها الموظف بعد، ولا يغيّر عقدًا وافق عليه الموظف.", "A template is a starting point; have the wording reviewed by a legal advisor. Editing a template updates drafts and contracts not yet accepted; it never changes a contract an employee already accepted.")}</p>
        </div>
      )}

      {edit && <TemplateEditor ar={ar} t={edit === "new" ? null : edit} companies={companies} placeholders={placeholders} people={people} onClose={() => setEdit(null)} />}
      {bulk && <BulkIssue ar={ar} locale={locale} preset={bulk} templates={templates.filter((t) => t.active)} companies={companies} people={people} onClose={() => setBulk(null)} />}
    </>
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

function TemplateCard({ ar, t, canApprove, onEdit }: { ar: boolean; t: ContractTemplate; canApprove: boolean; onEdit: () => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const { pending, err, run } = useAct();
  return (
    <article className={`card ct-tpl ${t.active ? "" : "is-off"}`}>
      <header>
        <span className="ms ct-tpl__ico" aria-hidden>description</span>
        <div>
          <h4>{t.name}</h4>
          <p className="text-sec">{t.company ?? T("كل شركات المجموعة", "All group companies")} · {lb(ar, HP.ctype, t.contract_type)}</p>
        </div>
        {t.is_default && <span className="mx-status mx-status--completed">{T("افتراضي", "Default")}</span>}
        {!t.active && <span className="mx-status mx-status--cancelled">{T("مؤرشف", "Archived")}</span>}
      </header>
      <p className="ct-tpl__excerpt" dir="auto">{t.body_ar.slice(0, 220)}…</p>
      <dl className="ct-tpl__facts">
        <div><dt>{T("التجربة", "Probation")}</dt><dd>{t.probation_days} {T("يوم", "d")}</dd></div>
        <div><dt>{T("الإجازة", "Leave")}</dt><dd>{t.annual_leave_days} {T("يوم", "d")}</dd></div>
        <div><dt>{T("الإشعار", "Notice")}</dt><dd>{t.notice_days} {T("يوم", "d")}</dd></div>
        <div><dt>{T("مستخدم في", "Used in")}</dt><dd>{t.used} {T("عقد", "contracts")}</dd></div>
      </dl>
      {t.unknown.length > 0 && <p className="mx-err">{T("متغيرات غير معروفة: ", "Unknown placeholders: ")}{t.unknown.join(", ")}</p>}
      <footer>
        <span className="text-sec ct-sub">{t.updated_by ? T(`آخر تعديل: ${t.updated_by}`, `Last edited by ${t.updated_by}`) : ""}{t.updated_at ? ` · ${t.updated_at.slice(0, 10)}` : ""}</span>
        {canApprove && <div className="mx-row">
          <button className="btn btn-ghost btn-sm" onClick={onEdit}>{T("تعديل", "Edit")}</button>
          <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => hrDuplicateTemplate(t.id))}>{T("نسخ", "Duplicate")}</button>
          {t.active && <button className="btn btn-ghost btn-sm mx-danger" disabled={pending} onClick={() => run(() => hrDeleteTemplate(t.id))}>{t.used ? T("أرشفة", "Archive") : T("حذف", "Delete")}</button>}
        </div>}
      </footer>
      {err && <p className="mx-err">{err}</p>}
    </article>
  );
}

function TemplateEditor({ ar, t, companies, placeholders, people, onClose }: { ar: boolean; t: ContractTemplate | null; companies: Company[]; placeholders: Placeholder[]; people: Person[]; onClose: () => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const [f, setF] = useState({
    name: t?.name ?? "", company_id: t?.company_id ? String(t.company_id) : "", contract_type: t?.contract_type ?? "fixed",
    body_ar: t?.body_ar ?? "", body_en: t?.body_en ?? "", probation_days: String(t?.probation_days ?? 90), duration_months: String(t?.duration_months ?? 12),
    working_hours_week: String(t?.working_hours_week ?? 48), annual_leave_days: String(t?.annual_leave_days ?? 21), notice_days: String(t?.notice_days ?? 60),
    requires_signed_copy: t?.requires_signed_copy ?? true, is_default: t?.is_default ?? false, active: t?.active ?? true,
  });
  const set = (k: keyof typeof f, v: string | boolean) => setF((o) => ({ ...o, [k]: v }));
  const [lang, setLang] = useState<"body_ar" | "body_en">("body_ar");
  const [prev, setPrev] = useState<{ text: string; company: PreviewCompany | null } | string | null>(null);
  const [who, setWho] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const { pending, err, run } = useAct();
  const [pPending, startP] = useTransition();

  const insert = (key: string) => {
    const el = area.current; const tok = `{{${key}}}`;
    const v = f[lang] as string;
    const s = el?.selectionStart ?? v.length, e = el?.selectionEnd ?? v.length;
    set(lang, v.slice(0, s) + tok + v.slice(e));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + tok.length, s + tok.length); });
  };
  const preview = () => startP(async () => {
    const r = await hrPreviewTemplate({ body_ar: f.body_ar, body_en: f.body_en || null, user_id: who ? Number(who) : null, company_id: f.company_id ? Number(f.company_id) : null });
    setPrev(r.ok ? (r.data as { text: string; company: PreviewCompany | null }) : r.error);
  });
  const body = () => ({
    name: f.name, company_id: f.company_id ? Number(f.company_id) : null, contract_type: f.contract_type, body_ar: f.body_ar, body_en: f.body_en.trim() || null,
    probation_days: Number(f.probation_days || 0), duration_months: f.duration_months ? Number(f.duration_months) : null, working_hours_week: Number(f.working_hours_week || 48),
    annual_leave_days: Number(f.annual_leave_days || 21), notice_days: Number(f.notice_days || 0), requires_signed_copy: f.requires_signed_copy, is_default: f.is_default, active: f.active,
  });
  const n = (k: keyof typeof f, l: string, min = 0, max?: number) => <label className="field"><span>{l}</span><input className="input" type="number" min={min} max={max} dir="ltr" value={f[k] as string} onChange={(e) => set(k, e.target.value)} /></label>;

  return (
    <Modal open onClose={onClose} size="lg" title={t ? T(`تعديل القالب: ${t.name}`, `Edit template: ${t.name}`) : T("قالب عقد جديد", "New contract template")}
      subtitle={T("استخدم المتغيرات بين {{ }} لتُملأ تلقائيًا من ملف الموظف وأرقام العقد.", "Placeholders in {{ }} are filled from the employee file and the contract figures.")}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" disabled={pending || f.name.trim().length < 2 || f.body_ar.trim().length < 20} onClick={() => run(() => hrSaveTemplate(t?.id ?? null, body()), onClose)}>{T("حفظ القالب", "Save template")}</button></>}>
      <div className="mx-form">
        <div className="ef-g3">
          <label className="field"><span>{T("اسم القالب", "Template name")}</span><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={T("مثال: عقد فنيي المصاعد", "e.g. Elevator technicians")} /></label>
          <label className="field"><span>{T("الشركة", "Company")}</span><select className="select" value={f.company_id} onChange={(e) => set("company_id", e.target.value)}><option value="">{T("كل شركات المجموعة", "All group companies")}</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="field"><span>{T("نوع العقد", "Contract type")}</span><select className="select" value={f.contract_type} onChange={(e) => set("contract_type", e.target.value)}>{Object.keys(HP.ctype).map((x) => <option key={x} value={x}>{lb(ar, HP.ctype, x)}</option>)}</select></label>
        </div>
        <div className="ef-g3">
          {n("probation_days", T("مدة التجربة (يوم، حتى 180)", "Probation days (max 180)"), 0, 180)}
          {n("duration_months", T("مدة العقد (شهر)", "Duration (months)"), 1, 120)}
          {n("working_hours_week", T("ساعات العمل الأسبوعية", "Hours per week"), 1, 80)}
          {n("annual_leave_days", T("الإجازة السنوية (21 يومًا على الأقل)", "Annual leave (min 21)"), 21, 60)}
          {n("notice_days", T("فترة الإشعار (يوم)", "Notice period (days)"), 0, 365)}
        </div>
        <div className="ct-toggles">
          <label className="ct-check"><input type="checkbox" checked={f.requires_signed_copy} onChange={(e) => set("requires_signed_copy", e.target.checked)} />{T("يتطلب توقيع الموظف (إلكترونيًا أو نسخة ورقية موقعة)", "Require the employee's signature (on screen, or a paper signed copy)")}</label>
          <label className="ct-check"><input type="checkbox" checked={f.is_default} onChange={(e) => set("is_default", e.target.checked)} />{T("القالب الافتراضي لهذه الشركة ونوع العقد", "Default for this company and contract type")}</label>
          {t && <label className="ct-check"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} />{T("فعّال", "Active")}</label>}
        </div>
        <div className="rn-tabs" role="tablist">
          <button role="tab" aria-selected={lang === "body_ar"} className={lang === "body_ar" ? "is-on" : ""} onClick={() => setLang("body_ar")}>{T("النص العربي (المعتمد)", "Arabic text (governing)")}</button>
          <button role="tab" aria-selected={lang === "body_en"} className={lang === "body_en" ? "is-on" : ""} onClick={() => setLang("body_en")}>{T("النص الإنجليزي (اختياري)", "English text (optional)")}</button>
        </div>
        <div className="ct-ph" aria-label={T("المتغيرات", "Placeholders")}>
          {placeholders.map((p) => <button key={p.key} type="button" className="ct-ph__chip" title={`${p.label} — ${p.sample}`} onClick={() => insert(p.key)}>{p.label}</button>)}
        </div>
        <textarea ref={area} className="textarea ct-body" rows={16} dir={lang === "body_ar" ? "rtl" : "ltr"} value={f[lang] as string} onChange={(e) => set(lang, e.target.value)} />
        <div className="ct-prev">
          <div className="mx-row">
            <select className="select" value={who} onChange={(e) => setWho(e.target.value)} aria-label={T("معاينة باسم", "Preview as")}>
              <option value="">{T("معاينة ببيانات تجريبية", "Preview with sample data")}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" disabled={pPending} onClick={preview}><span className="ms ms-sm" aria-hidden>visibility</span>{T("معاينة", "Preview")}</button>
          </div>
          {typeof prev === "string" && <p className="mx-err">{prev}</p>}
          {prev != null && typeof prev !== "string" && (
            <div className="ct-prev__paper">
              <ContractPaper ar={ar} head={prev.company} number={T("رقم العقد", "No.")} kind={lb(ar, HP.ctype, f.contract_type)} watermark={T("معاينة", "PREVIEW")} body={prev.text}
                sign={{
                  company: { label: T("الطرف الأول — صاحب العمل", "First party — employer"), name: prev.company?.signatory?.split(" — ")[0] ?? prev.company?.name_ar, role: prev.company?.signatory?.split(" — ")[1], signature: prev.company?.signature, pending: T("التوقيع والختم", "Signature & stamp") },
                  employee: { label: T("الطرف الثاني — الموظف", "Second party — employee"), name: who ? people.find((p) => String(p.id) === who)?.name : T("اسم الموظف", "Employee name"), pending: T("يوقّع الموظف هنا إلكترونيًا", "The employee signs here on screen") },
                }} />
            </div>
          )}
        </div>
        {err && <p className="mx-err">{err}</p>}
      </div>
    </Modal>
  );
}

function BulkIssue({ ar, locale, preset, templates, companies, people, onClose }: { ar: boolean; locale: string; preset: number[]; templates: ContractTemplate[]; companies: Company[]; people: Person[]; onClose: () => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const today = new Date().toISOString().slice(0, 10);
  const [tid, setTid] = useState(String(templates.find((t) => t.is_default)?.id ?? templates[0]?.id ?? ""));
  const [sel, setSel] = useState<Set<number>>(new Set(preset));
  const [comp, setComp] = useState("all");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [send, setSend] = useState(true);
  const [out, setOut] = useState<null | { created: { name: string; number: string; contract_id: number }[]; sent: { contract_id: number }[]; incomplete: { name: string; number: string }[]; skipped: { name?: string; reason: string }[] }>(null);
  const [pending, start_] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const tpl = templates.find((t) => String(t.id) === tid);
  const list = people.filter((p) => comp === "all" || String(p.company_id) === comp);
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const go = () => start_(async () => {
    setErr(null);
    const r = await hrBulkIssue({ template_id: Number(tid), user_ids: [...sel], start_date: start, end_date: end || null, send });
    if (!r.ok) return setErr(r.error);
    setOut(r.data as typeof out);
    router.refresh();
  });
  const reason = (r: string) => (r === "open_contract" ? T("لديه عقد مفتوح (مسودة أو بانتظار موافقته)", "already has an open contract (draft or waiting)") : T("ليس موظفًا", "not a staff account"));

  return (
    <Modal open onClose={onClose} size="lg" title={T("إصدار عقود من قالب", "Issue contracts from a template")}
      subtitle={T("يُنقل الراتب والمسمى من العقد الساري لكل موظف. من ليس له عقد ساري تُنشأ له مسودة لتكمل راتبه قبل الإرسال.", "Salary and job title carry over from each employee's active contract. Anyone without one gets a draft to complete before sending.")}
      footer={out ? <button className="btn btn-primary" onClick={onClose}>{T("تم", "Done")}</button> : <><button className="btn btn-secondary" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" disabled={pending || !tid || sel.size === 0 || !start} onClick={go}>{send ? T(`إصدار وإرسال (${sel.size})`, `Issue and send (${sel.size})`) : T(`إنشاء مسودات (${sel.size})`, `Create drafts (${sel.size})`)}</button></>}>
      {out ? (
        <div className="mx-form ct-result">
          <p><b>{out.created.length}</b> {T("عقد أُنشئ", "contracts created")} · <b>{out.sent.length}</b> {T("أُرسل للموظفين", "sent to employees")}</p>
          {out.incomplete.length > 0 && <div className="ct-res is-warn"><b>{T("تحتاج راتبًا قبل الإرسال:", "Need a salary before sending:")}</b><ul>{out.incomplete.map((x) => <li key={x.number}>{x.name} · {x.number}</li>)}</ul></div>}
          {out.skipped.length > 0 && <div className="ct-res"><b>{T("لم يُصدر لهم:", "Skipped:")}</b><ul>{out.skipped.map((x, i) => <li key={i}>{x.name ?? "—"} — {reason(x.reason)}</li>)}</ul></div>}
          <ul className="ct-people">{out.created.map((x) => <li key={x.contract_id}><Link href={`/${locale}/my-hr/contracts/${x.contract_id}`}>{x.number} · {x.name}</Link></li>)}</ul>
        </div>
      ) : (
        <div className="mx-form">
          <div className="ef-g3">
            <label className="field"><span>{T("القالب", "Template")}</span><select className="select" value={tid} onChange={(e) => setTid(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.company ? ` — ${t.company}` : ""}</option>)}</select></label>
            <label className="field"><span>{T("تاريخ البداية", "Start date")}</span><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="field"><span>{T("تاريخ النهاية", "End date")}</span><input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              <small className="text-sec">{tpl?.duration_months && tpl.contract_type !== "unlimited" ? T(`فارغ = ${tpl.duration_months} شهرًا من البداية`, `Empty = ${tpl.duration_months} months from start`) : ""}</small></label>
          </div>
          <label className="ct-check"><input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} />{T("أرسلها للموظفين فورًا ليوافقوا عليها (يُرسل بريد وإشعار)", "Send to employees right away to accept (email + notification)")}</label>
          <div className="ct-pick__bar">
            <select className="select" value={comp} onChange={(e) => setComp(e.target.value)} aria-label={T("الشركة", "Company")}><option value="all">{T("كل المجموعة", "Whole group")}</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set([...sel, ...list.map((p) => p.id)]))}>{T("تحديد الظاهرين", "Select shown")}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>{T("إلغاء التحديد", "Clear")}</button>
            <span className="text-sec">{T(`${sel.size} محدد`, `${sel.size} selected`)}</span>
          </div>
          <ul className="ct-pick">{list.map((p) => (
            <li key={p.id}><label className="ct-check"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />{p.name}<span className="text-sec">{companies.find((c) => c.id === p.company_id)?.short_code ?? ""}</span></label></li>
          ))}</ul>
          {err && <p className="mx-err">{err}</p>}
        </div>
      )}
    </Modal>
  );
}
