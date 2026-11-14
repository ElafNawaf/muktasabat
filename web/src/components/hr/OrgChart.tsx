"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { hrDeleteLogo, hrGetSignatory, hrSaveCompany, hrSaveDepartment, hrSetReporting, hrSetSignatory } from "@/lib/hr-people-actions";

import { CompanyMark } from "./ContractPaper";
import { SignaturePad } from "./SignaturePad";
import type { Company, OrgNode } from "@/lib/hr-people";

type Props = { locale: string; nodes: OrgNode[]; companies: Company[]; canEdit: boolean; canManageCompanies: boolean; canOpenFiles: boolean };

export function OrgChart({ locale, nodes, companies, canEdit, canManageCompanies, canOpenFiles }: Props) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [company, setCompany] = useState<number | "all">("all");
  const [edit, setEdit] = useState<OrgNode | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [compEdit, setCompEdit] = useState<Company | "new" | null>(null);
  const [deptEdit, setDeptEdit] = useState<{ company: Company; dept?: Company["departments"][number] } | null>(null);

  const scoped = useMemo(() => (company === "all" ? nodes : nodes.filter((n) => n.company_id === company)), [nodes, company]);
  const ids = new Set(scoped.map((n) => n.user_id));
  const children = useMemo(() => {
    const m = new Map<number | null, OrgNode[]>();
    for (const n of scoped) {
      const k = n.manager_user_id && ids.has(n.manager_user_id) ? n.manager_user_id : null;
      m.set(k, [...(m.get(k) ?? []), n]);
    }
    return m;
  }, [scoped]); // eslint-disable-line react-hooks/exhaustive-deps
  const roots = children.get(null) ?? [];
  const hit = q.trim().toLowerCase();
  const unassigned = nodes.filter((n) => !n.manager_user_id).length;

  function Tree({ n }: { n: OrgNode }) {
    const kids = children.get(n.user_id) ?? [];
    const closed = collapsed.has(n.user_id);
    const match = hit && `${n.name} ${n.job_title ?? ""} ${n.department ?? ""}`.toLowerCase().includes(hit);
    return (
      <li>
        <div className={`org-node${match ? " is-hit" : ""}`} style={{ ["--cc" as string]: n.company_color || "var(--color-primary)" }} dir={ar ? "rtl" : "ltr"}>
          <span className="org-av" aria-hidden>{n.name.slice(0, 1)}</span>
          <div className="org-txt">
            {canOpenFiles ? <Link href={`/${locale}/hr/people/${n.user_id}`}><strong>{n.name}</strong></Link> : <strong>{n.name}</strong>}
            <span>{n.job_title || "—"}</span>
            <small>{[n.department, company === "all" ? n.company : null].filter(Boolean).join(" · ")}</small>
          </div>
          <div className="org-btns">
            {canEdit && <button className="org-ib" onClick={() => setEdit(n)} aria-label={T("تعديل التبعية", "Edit reporting line")}><span className="ms ms-sm">edit</span></button>}
            {kids.length > 0 && <button className="org-ib" onClick={() => setCollapsed((s) => { const x = new Set(s); if (x.has(n.user_id)) x.delete(n.user_id); else x.add(n.user_id); return x; })} aria-expanded={!closed} aria-label={T("طي / توسيع", "Collapse / expand")}>
              <span className="org-count">{kids.length}</span><span className="ms ms-sm">{closed ? "expand_more" : "expand_less"}</span>
            </button>}
          </div>
        </div>
        {kids.length > 0 && !closed && <ul>{kids.map((k) => <Tree key={k.user_id} n={k} />)}</ul>}
      </li>
    );
  }

  return (
    <div className="page screen-enter org">
      <div className="page-header">
        <div>
          <h2 className="page-title">{T("الهيكل التنظيمي", "Organization chart")}</h2>
          <div className="page-subtitle">{T(`مجموعة مكتسبات · ${nodes.length} موظف في ${companies.length} شركات`, `Muktasabat group · ${nodes.length} employees in ${companies.length} companies`)}</div>
        </div>
        <input className="input org-search" placeholder={T("ابحث عن موظف…", "Find someone…")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="org-companies">
        <button className={company === "all" ? "is-on" : ""} onClick={() => setCompany("all")}>{T("كل المجموعة", "Whole group")}<b>{nodes.length}</b></button>
        {companies.map((c) => (
          <button key={c.id} className={company === c.id ? "is-on" : ""} style={{ ["--cc" as string]: c.color || "var(--color-primary)" }} onClick={() => setCompany(c.id)}>
            <i aria-hidden />{c.name}{c.is_holding && <em>{T("قابضة", "holding")}</em>}<b>{c.headcount}</b>
          </button>
        ))}
      </div>

      {canEdit && unassigned > 1 && <p className="ef-banner org-hint"><span className="ms">account_tree</span>{T("حدّد المدير المباشر لكل موظف (زر التعديل على البطاقة) ليظهر الهيكل بشكل صحيح.", "Set each person's direct manager (edit button on their card) to build the chart.")}</p>}

      <section className="card org-canvas">
        {roots.length === 0 ? <p className="text-sec">{T("لا يوجد موظفون في هذه الشركة.", "No employees in this company.")}</p> : (
          <div className="org-tree" dir="ltr"><ul>{roots.map((r) => <Tree key={r.user_id} n={r} />)}</ul></div>
        )}
      </section>

      <section className="org-structure">
        <header className="hr-sec__head"><h3>{T("الشركات والأقسام", "Companies & departments")}</h3>{canManageCompanies && <button className="btn btn-secondary btn-sm" onClick={() => setCompEdit("new")}><span className="ms ms-sm">add_business</span>{T("شركة جديدة", "New company")}</button>}</header>
        <div className="org-cards">
          {companies.map((c) => (
            <article key={c.id} className="card org-comp" style={{ ["--cc" as string]: c.color || "var(--color-primary)" }}>
              <header>
                <div><strong>{c.name}</strong><span className="text-sec">{[c.is_holding ? T("الشركة القابضة", "Holding company") : T("شركة تابعة", "Subsidiary"), c.short_code, c.cr_number && `${T("س.ت", "CR")} ${c.cr_number}`].filter(Boolean).join(" · ")}</span></div>
                {canManageCompanies && <button className="org-ib" onClick={() => setCompEdit(c)} aria-label={T("تعديل الشركة", "Edit company")}><span className="ms ms-sm">edit</span></button>}
              </header>
              <p className="text-sec org-office">{c.office_lat != null ? T(`مكتب الحضور: ${c.office_lat.toFixed(5)}, ${c.office_lng?.toFixed(5)} · ${c.geofence_radius_m ?? "—"} م`, `Attendance office: ${c.office_lat.toFixed(5)}, ${c.office_lng?.toFixed(5)} · ${c.geofence_radius_m ?? "—"} m`) : T("مكتب الحضور: المقر الرئيسي", "Attendance office: headquarters")}</p>
              <ul className="org-depts">
                {c.departments.map((d) => (
                  <li key={d.id}>
                    <span><strong>{d.name}</strong>{d.head && <small> · {T("الرئيس", "Head")}: {d.head}</small>}</span>
                    <b>{d.headcount}</b>
                    {canEdit && <button className="org-ib" onClick={() => setDeptEdit({ company: c, dept: d })} aria-label={T("تعديل القسم", "Edit department")}><span className="ms ms-sm">edit</span></button>}
                  </li>
                ))}
                {c.departments.length === 0 && <li className="text-sec">{T("لا أقسام بعد.", "No departments yet.")}</li>}
              </ul>
              {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setDeptEdit({ company: c })}><span className="ms ms-sm">add</span>{T("قسم جديد", "New department")}</button>}
            </article>
          ))}
        </div>
      </section>

      {edit && <ReportingModal ar={ar} n={edit} nodes={nodes} companies={companies} onClose={() => setEdit(null)} />}
      {compEdit && <CompanyModal ar={ar} c={compEdit === "new" ? null : compEdit} companies={companies} onClose={() => setCompEdit(null)} />}
      {deptEdit && <DeptModal ar={ar} company={deptEdit.company} d={deptEdit.dept} nodes={nodes} onClose={() => setDeptEdit(null)} />}
    </div>
  );
}

function useSave(onDone: () => void) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (p: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    setErr(null);
    const r = await p();
    if (!r.ok) return setErr(r.error ?? "Error");
    onDone();
    router.refresh();
  });
  return { err, pending, save };
}

function ReportingModal({ ar, n, nodes, companies, onClose }: { ar: boolean; n: OrgNode; nodes: OrgNode[]; companies: Company[]; onClose: () => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const [f, setF] = useState({ manager: String(n.manager_user_id ?? ""), company: String(n.company_id ?? ""), dept: String(n.department_id ?? ""), title: n.job_title ?? "" });
  const { err, pending, save } = useSave(onClose);
  const comp = companies.find((c) => String(c.id) === f.company);
  return (
    <Modal open onClose={onClose} title={T(`تبعية ${n.name}`, `${n.name}: reporting line`)}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" disabled={pending} onClick={() => save(() => hrSetReporting(n.user_id, { manager_user_id: f.manager ? Number(f.manager) : null, company_id: f.company ? Number(f.company) : null, department_id: f.dept ? Number(f.dept) : 0, job_title: f.title }))}>{T("حفظ", "Save")}</button></>}>
      <div className="mx-form">
        <label className="field"><span>{T("يتبع لـ (المدير المباشر)", "Reports to (direct manager)")}</span>
          <select className="select" value={f.manager} onChange={(e) => setF({ ...f, manager: e.target.value })}>
            <option value="">{T("— أعلى الهيكل (لا يتبع لأحد) —", "— Top of the chart (no manager) —")}</option>
            {nodes.filter((x) => x.user_id !== n.user_id).map((x) => <option key={x.user_id} value={x.user_id}>{x.name}{x.job_title ? ` — ${x.job_title}` : ""}{x.company ? ` (${x.company})` : ""}</option>)}
          </select>
        </label>
        <label className="field"><span>{T("الشركة", "Company")}</span><select className="select" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value, dept: "" })}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field"><span>{T("القسم", "Department")}</span><select className="select" value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}><option value="">—</option>{(comp?.departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label className="field"><span>{T("المسمى الوظيفي", "Job title")}</span><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <p className="text-sec mx-hint">{T("يمكن أن يتبع موظف لمدير في شركة أخرى داخل المجموعة.", "People can report to a manager in another group company.")}</p>
        {err && <p className="mx-err">{err}</p>}
      </div>
    </Modal>
  );
}

function CompanyModal({ ar, c, companies, onClose }: { ar: boolean; c: Company | null; companies: Company[]; onClose: () => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const [f, setF] = useState({ name_ar: c?.name_ar ?? "", name_en: c?.name_en ?? "", short_code: c?.short_code ?? "", parent_id: String(c?.parent_id ?? (c?.is_holding ? "" : companies.find((x) => x.is_holding)?.id ?? "")),
    cr_number: c?.cr_number ?? "", color: c?.color ?? "#1F4B99", lat: c?.office_lat != null ? String(c.office_lat) : "", lng: c?.office_lng != null ? String(c.office_lng) : "", radius: c?.geofence_radius_m != null ? String(c.geofence_radius_m) : "", active: c?.active ?? true });
  const { err, pending, save } = useSave(onClose);
  const set = (k: keyof typeof f, v: string | boolean) => setF((o) => ({ ...o, [k]: v }));
  return (
    <Modal open onClose={onClose} title={c ? T("تعديل الشركة", "Edit company") : T("شركة جديدة في المجموعة", "New group company")}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" disabled={pending || f.name_ar.trim().length < 2} onClick={() => save(() => hrSaveCompany(c?.id ?? null, {
        name_ar: f.name_ar, name_en: f.name_en || null, short_code: f.short_code || null, parent_id: f.parent_id ? Number(f.parent_id) : null, cr_number: f.cr_number || null,
        color: f.color || null, office_lat: f.lat ? Number(f.lat) : null, office_lng: f.lng ? Number(f.lng) : null, geofence_radius_m: f.radius ? Number(f.radius) : null, active: f.active,
      }))}>{T("حفظ", "Save")}</button></>}>
      <div className="mx-grid2">
        <label className="field"><span>{T("الاسم (عربي)", "Name (Arabic)")}</span><input className="input" value={f.name_ar} onChange={(e) => set("name_ar", e.target.value)} /></label>
        <label className="field"><span>{T("الاسم (إنجليزي)", "Name (English)")}</span><input className="input" dir="ltr" value={f.name_en} onChange={(e) => set("name_en", e.target.value)} /></label>
        <label className="field"><span>{T("رمز مختصر (للأرقام)", "Short code (for numbers)")}</span><input className="input" dir="ltr" maxLength={10} value={f.short_code} onChange={(e) => set("short_code", e.target.value.toUpperCase())} /></label>
        <label className="field"><span>{T("رقم السجل التجاري", "CR number")}</span><input className="input" dir="ltr" value={f.cr_number} onChange={(e) => set("cr_number", e.target.value)} /></label>
        {!c?.is_holding && <label className="field"><span>{T("الشركة الأم", "Parent company")}</span><select className="select" value={f.parent_id} onChange={(e) => set("parent_id", e.target.value)}><option value="">—</option>{companies.filter((x) => x.id !== c?.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        <label className="field"><span>{T("اللون", "Colour")}</span><input className="input" type="color" value={f.color} onChange={(e) => set("color", e.target.value)} /></label>
      </div>
      <h4 className="mx-h">{T("مكتب الحضور (اختياري)", "Attendance office (optional)")}</h4>
      <p className="text-sec mx-hint">{T("إن كان لموظفي هذه الشركة مكتب مختلف عن المقر الرئيسي، أدخل موقعه ليُسجَّل حضورهم منه.", "If this company's staff work from a different office than headquarters, enter it so they check in there.")}</p>
      <div className="mx-grid2">
        <label className="field"><span>{T("خط العرض", "Latitude")}</span><input className="input" dir="ltr" value={f.lat} onChange={(e) => set("lat", e.target.value)} /></label>
        <label className="field"><span>{T("خط الطول", "Longitude")}</span><input className="input" dir="ltr" value={f.lng} onChange={(e) => set("lng", e.target.value)} /></label>
        <label className="field"><span>{T("نصف القطر (م)", "Radius (m)")}</span><input className="input" type="number" min={5} value={f.radius} onChange={(e) => set("radius", e.target.value)} /></label>
      </div>
      {c && <label className="checkbox" style={{ marginTop: 10 }}><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} />{T("الشركة نشطة", "Company is active")}</label>}
      {err && <p className="mx-err">{err}</p>}
      {c ? <Letterhead ar={ar} c={c} /> : <p className="text-sec mx-hint">{T("بعد حفظ الشركة يمكنك إضافة شعارها وتوقيع المفوّض بالتوقيع على العقود.", "After saving, you can add the company logo and the signature used on contracts.")}</p>}
    </Modal>
  );
}

/** Logo and authorised signatory printed on this company's employment contracts. */
function Letterhead({ ar, c }: { ar: boolean; c: Company }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState(c.logo_url ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [who, setWho] = useState({ name: c.signatory_name ?? "", title: c.signatory_title ?? "" });
  const [current, setCurrent] = useState<string | null>(null);
  const [redraw, setRedraw] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { if (c.has_signature) hrGetSignatory(c.id).then((r) => r.ok && setCurrent((r.data as { signature?: string | null }).signature ?? null)); }, [c.id, c.has_signature]);

  const upload = async () => {
    const f = file.current?.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return setErr(T("الشعار أكبر من 2 ميغابايت.", "The logo is larger than 2 MB."));
    setBusy(true); setErr(null); setMsg(null);
    const fd = new FormData(); fd.append("file", f);
    const res = await fetch(`/api/hr/companies/${c.id}/logo`, { method: "POST", body: fd });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(typeof d.detail === "string" ? d.detail : T("تعذّر رفع الشعار.", "Couldn't upload the logo."));
    setLogo(d.logo_url); setMsg(T("حُفظ الشعار.", "Logo saved.")); router.refresh();
  };
  const saveSignatory = () => start(async () => {
    setErr(null); setMsg(null);
    const r = await hrSetSignatory(c.id, { signatory_name: who.name || null, signatory_title: who.title || null, keep_signature: !redraw, signature: redraw ? sig : null });
    if (!r.ok) return setErr(r.error ?? "Error");
    if (redraw) { setCurrent(sig); setRedraw(false); }
    setMsg(T("حُفظ المفوّض بالتوقيع. يُطبّق على العقود المرسلة من الآن.", "Signatory saved. Applies to contracts sent from now on.")); router.refresh();
  });

  return (
    <section className="lh">
      <h4 className="mx-h">{T("ترويسة العقود والتوقيع", "Contract letterhead & signature")}</h4>
      <div className="lh-logo">
        <div className="lh-logo__prev"><CompanyMark head={{ name_ar: c.name_ar, name_en: c.name_en, color: c.color, logo_url: logo, is_holding: c.is_holding, code: c.short_code }} size={56} /></div>
        <div>
          <p className="text-sec mx-hint">{T("PNG بخلفية شفافة يُطبع بأفضل شكل. حتى 2 ميغابايت.", "A transparent PNG prints best. Up to 2 MB.")}</p>
          <div className="mx-row">
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="input" aria-label={T("ملف الشعار", "Logo file")} onChange={upload} disabled={busy} />
            {logo && <button className="btn btn-ghost btn-sm mx-danger" disabled={busy} onClick={async () => { const r = await hrDeleteLogo(c.id); if (r.ok) { setLogo(null); router.refresh(); } }}>{T("إزالة", "Remove")}</button>}
          </div>
        </div>
      </div>
      <div className="mx-grid2">
        <label className="field"><span>{T("المفوّض بالتوقيع", "Authorised signatory")}</span><input className="input" value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} placeholder={T("مثال: نواف الحربي", "e.g. Nawaf Alharbi")} /></label>
        <label className="field"><span>{T("صفته", "Title")}</span><input className="input" value={who.title} onChange={(e) => setWho({ ...who, title: e.target.value })} placeholder={T("مثال: الرئيس التنفيذي", "e.g. Chief Executive Officer")} /></label>
      </div>
      {current && !redraw ? (
        <div className="lh-sig"><img src={current} alt={T("التوقيع الحالي", "Current signature")} /><button className="btn btn-ghost btn-sm" onClick={() => setRedraw(true)}>{T("توقيع جديد", "Replace signature")}</button></div>
      ) : (
        <>
          {!redraw && <button className="btn btn-secondary btn-sm" onClick={() => setRedraw(true)}><span className="ms ms-sm" aria-hidden>draw</span>{T("إضافة توقيع المفوّض", "Add the signatory's signature")}</button>}
          {redraw && <SignaturePad ar={ar} onChange={setSig} height={150} />}
        </>
      )}
      <p className="text-sec mx-hint">{T("يظهر التوقيع تلقائيًا في خانة صاحب العمل عند إرسال العقد للموظف.", "The signature is added to the employer's block automatically when a contract is sent.")}</p>
      <div className="mx-row">
        <button className="btn btn-primary btn-sm" disabled={pending || (redraw && !sig)} onClick={saveSignatory}>{T("حفظ المفوّض والتوقيع", "Save signatory")}</button>
        {redraw && <button className="btn btn-ghost btn-sm" onClick={() => { setRedraw(false); setSig(null); }}>{T("إلغاء", "Cancel")}</button>}
      </div>
      {msg && <p className="col-ok">{msg}</p>}{err && <p className="mx-err">{err}</p>}
    </section>
  );
}

function DeptModal({ ar, company, d, nodes, onClose }: { ar: boolean; company: Company; d?: Company["departments"][number]; nodes: OrgNode[]; onClose: () => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const [f, setF] = useState({ name_ar: d?.name_ar ?? "", name_en: d?.name_en ?? "", head: String(d?.head_user_id ?? ""), parent: String(d?.parent_id ?? ""), active: d?.active ?? true });
  const { err, pending, save } = useSave(onClose);
  return (
    <Modal open onClose={onClose} title={d ? T("تعديل القسم", "Edit department") : T(`قسم جديد — ${company.name}`, `New department — ${company.name}`)}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" disabled={pending || f.name_ar.trim().length < 2} onClick={() => save(() => hrSaveDepartment(d?.id ?? null, {
        company_id: company.id, name_ar: f.name_ar, name_en: f.name_en || null, head_user_id: f.head ? Number(f.head) : null, parent_id: f.parent ? Number(f.parent) : null, active: f.active,
      }))}>{T("حفظ", "Save")}</button></>}>
      <div className="mx-grid2">
        <label className="field"><span>{T("الاسم (عربي)", "Name (Arabic)")}</span><input className="input" value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} /></label>
        <label className="field"><span>{T("الاسم (إنجليزي)", "Name (English)")}</span><input className="input" dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} /></label>
        <label className="field"><span>{T("رئيس القسم", "Head of department")}</span><select className="select" value={f.head} onChange={(e) => setF({ ...f, head: e.target.value })}><option value="">—</option>{nodes.map((x) => <option key={x.user_id} value={x.user_id}>{x.name}</option>)}</select></label>
        <label className="field"><span>{T("يتبع قسم", "Parent department")}</span><select className="select" value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })}><option value="">—</option>{company.departments.filter((x) => x.id !== d?.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </div>
      {d && <label className="checkbox" style={{ marginTop: 10 }}><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />{T("القسم نشط", "Department is active")}</label>}
      {err && <p className="mx-err">{err}</p>}
    </Modal>
  );
}
