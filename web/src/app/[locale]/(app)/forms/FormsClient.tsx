"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { CustomFieldsGrid } from "@/components/forms/CustomFields";
import { Modal } from "@/components/Modal";
import { formApprove, formCancel, formGet, formReject, formRequest } from "@/lib/forms-actions";
import { FIELD_TYPES, type CustomField, type FieldType } from "@/lib/forms-types";

type FormSummary = { entity: string; ar: string; en: string; icon: string; version: number; custom: number; archived: number; system: number; pending: number; updated_at?: string | null; updated_by?: string | null };
type Req = {
  id: number; number: string; entity: string; base_version: number; fields: CustomField[]; changes: string[]; reason?: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled"; requested_by?: string | null; created_at: string; reviewed_by?: string | null;
  reviewed_at?: string | null; review_note?: string | null; mine: boolean;
};
type Detail = {
  entity: string; ar: string; en: string; icon: string; version: number; fields: CustomField[];
  system: { key: string; label_ar: string; label_en: string; kind: "core" | "relation"; required: boolean }[];
  value_counts: Record<string, number>; requests: Req[];
  versions: { version: number; at: string; approved_by?: string | null; request_id?: number | null; fields: number }[];
  is_super_admin: boolean;
};

const blank = (): CustomField => ({ key: "", label_ar: "", label_en: "", type: "text", required: false, options: [], help_ar: "", help_en: "", section_ar: "", section_en: "" });
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "f_$1").slice(0, 40);
const norm = (fs: CustomField[]) =>
  JSON.stringify(fs.map((f) => ({ ...f, order: undefined, label_en: f.label_en || null, help_ar: f.help_ar || null, help_en: f.help_en || null, section_ar: f.section_ar || null, section_en: f.section_en || null, options: (f.options || []).map((o) => ({ value: o.value, ar: o.ar, en: o.en || null })), archived: !!f.archived })));

export function FormsClient({ forms, isSuper, locale }: { forms: FormSummary[]; isSuper: boolean; locale: string }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const sp = useSearchParams();
  const [entity, setEntity] = useState(sp.get("entity") || forms[0]?.entity || "tenant");
  const [tab, setTab] = useState<"design" | "requests" | "history">(sp.get("request") ? "requests" : "design");
  const [d, setD] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<CustomField[]>([]);
  const [editing, setEditing] = useState<{ i: number | null; f: CustomField } | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [dragI, setDragI] = useState<number | null>(null);
  const [showSys, setShowSys] = useState(false);
  const DKEY = `mk-form-draft-${entity}`;

  const load = useCallback(async () => {
    const r = await formGet(entity);
    if (!r.ok) return setErr(r.error);
    const det = r.data as unknown as Detail;
    setD(det);
    let saved: CustomField[] | null = null;
    try {
      const raw = localStorage.getItem(`mk-form-draft-${entity}`);
      if (raw) {
        const p = JSON.parse(raw) as { base: number; fields: CustomField[] };
        if (p.base === det.version) saved = p.fields;
      }
    } catch {
      /* ignore */
    }
    setDraft(saved ?? det.fields.map((f) => ({ ...f })));
  }, [entity]);
  useEffect(() => {
    setD(null);
    setErr(null);
    load();
  }, [load]);

  const dirty = d ? norm(draft) !== norm(d.fields) : false;
  useEffect(() => {
    if (!d) return;
    try {
      if (dirty) localStorage.setItem(DKEY, JSON.stringify({ base: d.version, fields: draft }));
      else localStorage.removeItem(DKEY);
    } catch {
      /* ignore */
    }
  }, [draft, dirty, d, DKEY]);

  const live = draft.filter((f) => !f.archived);
  const archived = draft.filter((f) => f.archived);
  const liveKeys = useMemo(() => new Set((d?.fields ?? []).map((f) => f.key)), [d]);
  const pendingReqs = (d?.requests ?? []).filter((r) => r.status === "pending");
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= live.length || from === to) return;
    const arr = [...live];
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    setDraft([...arr, ...archived]);
  };
  const saveField = (f: CustomField) => {
    if (!editing) return;
    if (editing.i === null) setDraft([...live, f, ...archived]);
    else setDraft(draft.map((x) => (x.key === live[editing.i!].key ? f : x)));
    setEditing(null);
  };
  const removeField = (key: string) => {
    if (liveKeys.has(key)) setDraft(draft.map((x) => (x.key === key ? { ...x, archived: true } : x)));
    else setDraft(draft.filter((x) => x.key !== key));
  };
  const restore = (key: string) => setDraft(draft.map((x) => (x.key === key ? { ...x, archived: false } : x)));

  const submit = () =>
    start(async () => {
      setErr(null);
      const r = await formRequest(entity, draft.map(({ order: _o, ...f }) => f as CustomField), reason.trim(), locale);
      if (!r.ok) return setErr(r.error);
      try {
        localStorage.removeItem(DKEY);
      } catch {
        /* ignore */
      }
      setReason("");
      flash(isSuper ? T("أُرسل الطلب — راجعه ووافق عليه من تبويب الطلبات", "Sent — review and approve it in Requests") : T("أُرسل الطلب للمشرف العام للموافقة", "Sent to the super admin for approval"));
      await load();
      setTab("requests");
      router.refresh();
    });

  const decide = (r: Req, kind: "approve" | "reject" | "cancel", note: string) =>
    start(async () => {
      setErr(null);
      const res = kind === "approve" ? await formApprove(r.id, note, locale) : kind === "reject" ? await formReject(r.id, note) : await formCancel(r.id);
      if (!res.ok) return setErr(res.error);
      flash(kind === "approve" ? T("اعتُمد — النموذج محدّث الآن", "Approved — the form is live") : kind === "reject" ? T("رُفض الطلب", "Rejected") : T("سُحب الطلب", "Withdrawn"));
      await load();
      router.refresh();
    });

  const fsum = forms.find((f) => f.entity === entity);

  return (
    <div className="page screen-enter fb">
      <div className="page-header">
        <div>
          <h2 className="page-title">{T("تصميم النماذج", "Form designer")}</h2>
          <div className="page-subtitle">{T("أضف حقولاً لنماذج الكيانات أو عدّلها. لا يتغير أي نموذج إلا بعد موافقة المشرف العام، والحقول الأساسية والعلاقات محمية.", "Add or change fields on entity forms. Nothing changes until a super admin approves it; built-in fields and relations are protected.")}</div>
        </div>
        <span className={`fb-role${isSuper ? " is-super" : ""}`}><span className="ms ms-sm">{isSuper ? "verified_user" : "edit_note"}</span>{isSuper ? T("مشرف عام — يمكنك الاعتماد", "Super admin — you can approve") : T("يمكنك طلب التعديل", "You can request changes")}</span>
      </div>

      <div className="fb-flow" aria-label={T("مراحل التعديل", "How changes work")}>
        {[["edit", T("صمّم التعديل", "Design the change")], ["send", T("أرسل للاعتماد", "Send for approval")], ["verified_user", T("يعتمده المشرف العام", "Super admin approves")], ["bolt", T("يظهر في النموذج", "It goes live")]].map(([i, l], n) => (
          <span key={i} className="fb-flow__s" style={{ ["--i" as string]: n }}><span className="ms ms-sm">{i}</span>{l}</span>
        ))}
      </div>

      <div className="fb-ents">
        {forms.map((f, n) => (
          <button key={f.entity} type="button" className={"fb-ent" + (f.entity === entity ? " is-on" : "")} onClick={() => { setEntity(f.entity); setTab("design"); router.replace(`?entity=${f.entity}`); }} style={{ ["--i" as string]: n }}>
            <span className="fb-ent__ico"><span className="ms">{f.icon}</span></span>
            <span className="fb-ent__t"><b>{ar ? f.ar : f.en}</b><small>{T(`الإصدار ${f.version} · ${f.custom} حقل مخصّص`, `v${f.version} · ${f.custom} custom`)}</small></span>
            {f.pending > 0 && <span className="fb-ent__p" title={T("طلبات بانتظار الاعتماد", "Waiting for approval")}>{f.pending}</span>}
          </button>
        ))}
      </div>

      <nav className="bd-tabs" role="tablist">
        {([["design", "design_services", T("التصميم", "Design"), null], ["requests", "pending_actions", T("الطلبات", "Requests"), pendingReqs.length], ["history", "history", T("سجل الإصدارات", "Versions"), d?.versions.length ?? 0]] as [typeof tab, string, string, number | null][]).map(([id, icon, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : undefined} onClick={() => setTab(id)}>
            <span className="ms ms-sm">{icon}</span>{label}{n ? <span className="bd-tabs__n">{n}</span> : null}
          </button>
        ))}
      </nav>

      {err && <p className="mx-err fb-err"><span className="ms ms-sm">error</span>{err}</p>}
      {!d && <div className="pv-skel"><span /><span /></div>}

      {d && tab === "design" && (
        <div className="fb-grid">
          <section className="card fb-card">
            {pendingReqs.length > 0 && (
              <button type="button" className="fb-note" onClick={() => setTab("requests")}>
                <span className="ms">hourglass_top</span>
                {T(`يوجد ${pendingReqs.length} طلب بانتظار الاعتماد لهذا النموذج — اضغط للمراجعة`, `${pendingReqs.length} request(s) waiting for approval on this form — open`)}
              </button>
            )}

            <button type="button" className={"fb-sys" + (showSys ? " is-open" : "")} onClick={() => setShowSys((v) => !v)} aria-expanded={showSys}>
              <span className="ms">lock</span>
              <span><b>{T(`${d.system.length} حقل أساسي محمي`, `${d.system.length} protected built-in fields`)}</b><small>{T("الأسماء والهويات والعلاقات والمبالغ وبيانات إيجار — لا يمكن حذفها أو تغييرها من هنا", "Names, IDs, relations, amounts and Ejar data — can't be removed or changed here")}</small></span>
              <span className="ms ms-sm fb-sys__chev">expand_more</span>
            </button>
            {showSys && (
              <div className="fb-syslist">
                {d.system.map((s) => (
                  <span key={s.key} className={`fb-syschip fb-syschip--${s.kind}`} title={s.key}>
                    <span className="ms ms-sm">{s.kind === "relation" ? "link" : "lock"}</span>{ar ? s.label_ar : s.label_en}
                  </span>
                ))}
              </div>
            )}

            <header className="fb-h">
              <h3>{T("الحقول المخصّصة", "Custom fields")} <small>{live.length}</small></h3>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({ i: null, f: blank() })}><span className="ms ms-sm">add</span>{T("إضافة حقل", "Add field")}</button>
            </header>

            {live.length === 0 ? (
              <button type="button" className="fb-empty" onClick={() => setEditing({ i: null, f: blank() })}>
                <span className="ms">dynamic_form</span>
                <b>{T("لا توجد حقول مخصّصة بعد", "No custom fields yet")}</b>
                <small>{T("أضف أول حقل — مثل «جهة اتصال للطوارئ» أو «جهة العمل»", "Add the first one — e.g. “Emergency contact” or “Employer”")}</small>
              </button>
            ) : (
              <ol className="fb-list">
                {live.map((f, i) => {
                  const isNew = !liveKeys.has(f.key);
                  const old = d.fields.find((x) => x.key === f.key);
                  const changed = !isNew && old && norm([f]) !== norm([{ ...old, archived: false }]);
                  return (
                    <li key={f.key} className={"fb-row" + (isNew ? " is-new" : changed ? " is-changed" : "") + (dragI === i ? " is-drag" : "")} style={{ ["--i" as string]: i }}
                      draggable onDragStart={() => setDragI(i)} onDragEnd={() => setDragI(null)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragI !== null) move(dragI, i); setDragI(null); }}>
                      <span className="fb-row__grip ms" aria-hidden>drag_indicator</span>
                      <span className="fb-row__ico"><span className="ms ms-sm">{FIELD_TYPES[f.type].icon}</span></span>
                      <span className="fb-row__t">
                        <b>{ar ? f.label_ar : f.label_en || f.label_ar}{f.required && <em className="cf-req"> *</em>}</b>
                        <small>
                          {T(FIELD_TYPES[f.type].ar, FIELD_TYPES[f.type].en)}
                          {f.options.length ? ` · ${f.options.length} ${T("خيار", "choices")}` : ""}
                          {(f.section_ar || f.section_en) ? ` · ${ar ? f.section_ar : f.section_en || f.section_ar}` : ""}
                          {d.value_counts[f.key] ? ` · ${T(`${d.value_counts[f.key]} قيمة محفوظة`, `${d.value_counts[f.key]} saved`)}` : ""}
                          <code dir="ltr">{f.key}</code>
                        </small>
                      </span>
                      {isNew && <span className="fb-tag fb-tag--new">{T("جديد", "New")}</span>}
                      {changed && <span className="fb-tag fb-tag--chg">{T("معدّل", "Edited")}</span>}
                      <span className="fb-row__act">
                        <button type="button" className="icon-btn" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={T("لأعلى", "Move up")}><span className="ms ms-sm">arrow_upward</span></button>
                        <button type="button" className="icon-btn" onClick={() => move(i, i + 1)} disabled={i === live.length - 1} aria-label={T("لأسفل", "Move down")}><span className="ms ms-sm">arrow_downward</span></button>
                        <button type="button" className="icon-btn" onClick={() => setEditing({ i, f: { ...f, options: [...f.options] } })} aria-label={T("تعديل", "Edit")}><span className="ms ms-sm">edit</span></button>
                        <button type="button" className="icon-btn fb-del" onClick={() => removeField(f.key)} aria-label={T("حذف", "Remove")} title={liveKeys.has(f.key) ? T("يُؤرشف الحقل وتبقى قيمه محفوظة", "Archives the field; saved values are kept") : T("حذف", "Remove")}><span className="ms ms-sm">delete</span></button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}

            {archived.length > 0 && (
              <div className="fb-arch">
                <h4><span className="ms ms-sm">inventory_2</span>{T("حقول مؤرشفة — قيمها محفوظة", "Archived — values kept")}</h4>
                {archived.map((f) => (
                  <div key={f.key} className="fb-arch__r">
                    <span>{ar ? f.label_ar : f.label_en || f.label_ar} <code dir="ltr">{f.key}</code>{d.value_counts[f.key] ? ` · ${d.value_counts[f.key]} ${T("قيمة", "values")}` : ""}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => restore(f.key)}><span className="ms ms-sm">unarchive</span>{T("استعادة", "Restore")}</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="fb-side">
            <section className="card fb-card fb-preview">
              <header className="fb-h"><h3><span className="ms ms-sm">visibility</span>{T("معاينة حيّة", "Live preview")}</h3><small className="text-sec">{ar ? fsum?.ar : fsum?.en}</small></header>
              {live.length ? <CustomFieldsGrid fields={live} values={{}} setValue={() => {}} locale={locale} /> : <p className="text-sec">{T("ستظهر الحقول هنا كما سيراها الموظفون في قسم «بيانات إضافية».", "Fields appear here as staff will see them under “Additional details”.")}</p>}
            </section>
          </aside>

          <div className={"fb-bar" + (dirty ? " is-on" : "")}>
            <span className="fb-bar__info"><span className="ms">edit_note</span>{dirty ? T("لديك تعديلات غير مرسلة (محفوظة كمسودة على هذا الجهاز)", "Unsent changes (kept as a draft on this device)") : T("لا توجد تعديلات", "No changes")}</span>
            {dirty && (
              <>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={T("سبب التعديل (يراه المشرف العام)", "Why? (the super admin sees this)")} maxLength={2000} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(d.fields.map((f) => ({ ...f })))}>{T("تجاهل", "Discard")}</button>
                <button type="button" className="btn btn-primary" disabled={pending || reason.trim().length < 3} onClick={submit}><span className="ms ms-sm">send</span>{T("إرسال للاعتماد", "Send for approval")}</button>
              </>
            )}
          </div>
        </div>
      )}

      {d && tab === "requests" && <Requests reqs={d.requests} highlight={Number(sp.get("request")) || null} isSuper={d.is_super_admin} current={d.fields} locale={locale} pending={pending} onDecide={decide} />}

      {d && tab === "history" && (
        <section className="card fb-card">
          {d.versions.length === 0 ? <p className="text-sec">{T("لم يُعتمد أي إصدار بعد — النموذج بحقوله الأساسية فقط.", "No version approved yet — the form has its built-in fields only.")}</p> : (
            <ol className="fb-hist">
              {d.versions.map((v) => (
                <li key={v.version}>
                  <span className="fb-hist__v">v{v.version}</span>
                  <div><b>{T(`${v.fields} حقل مخصّص`, `${v.fields} custom field(s)`)}</b><small>{T("اعتمده", "Approved by")} {v.approved_by} · {new Date(v.at + "Z").toLocaleString(ar ? "ar-SA-u-nu-latn" : "en-GB")}</small></div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {editing && <FieldEditor init={editing.f} isExisting={liveKeys.has(editing.f.key)} usedKeys={new Set(draft.map((x) => x.key).filter((k) => k !== editing.f.key))} systemKeys={new Set(d?.system.map((s) => s.key))} valueCount={d?.value_counts[editing.f.key] ?? 0} locale={locale} onClose={() => setEditing(null)} onSave={saveField} />}
      {toast && <div className="fb-toast" role="status"><span className="ms">check_circle</span>{toast}</div>}
    </div>
  );
}

function changeText(c: string, ar: boolean): [string, string] {
  const [kind, , label, extra] = c.split(":");
  const L = (a: string, e: string) => (ar ? a : e);
  switch (kind) {
    case "add": return ["add_circle", L(`إضافة حقل «${label}» (${FIELD_TYPES[extra as FieldType]?.ar ?? extra})`, `Add field “${label}” (${FIELD_TYPES[extra as FieldType]?.en ?? extra})`)];
    case "archive": return ["inventory_2", L(`أرشفة «${label}» — تبقى قيمه محفوظة`, `Archive “${label}” — values kept`)];
    case "restore": return ["unarchive", L(`استعادة «${label}»`, `Restore “${label}”`)];
    case "type": return ["swap_horiz", L(`تغيير نوع «${label}»: ${extra}`, `Change type of “${label}”: ${extra}`)];
    case "options": return ["checklist", L(`تعديل خيارات «${label}»`, `Edit choices of “${label}”`)];
    case "edit": return ["edit", L(`تعديل «${label}» (${({ label_ar: "الاسم", label_en: "الاسم الإنجليزي", required: "الإلزام", help_ar: "التلميح", help_en: "التلميح", section_ar: "القسم", section_en: "القسم" } as Record<string, string>)[extra] ?? extra})`, `Edit “${label}” (${extra})`)];
    case "order": return ["swap_vert", L("تغيير ترتيب الحقول", "Reorder fields")];
    default: return ["change_circle", c];
  }
}

function Requests({ reqs, highlight, isSuper, current, locale, pending, onDecide }: { reqs: Req[]; highlight: number | null; isSuper: boolean; current: CustomField[]; locale: string; pending: boolean; onDecide: (r: Req, k: "approve" | "reject" | "cancel", note: string) => void }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<number | null>(highlight ?? reqs.find((r) => r.status === "pending")?.id ?? null);
  const ST: Record<Req["status"], [string, string, string]> = { pending: ["بانتظار الاعتماد", "Waiting for approval", "soon"], approved: ["معتمد", "Approved", "ok"], rejected: ["مرفوض", "Rejected", "bad"], cancelled: ["مسحوب", "Withdrawn", "idle"] };
  if (!reqs.length) return <section className="card fb-card"><p className="text-sec">{T("لا توجد طلبات لهذا النموذج.", "No requests for this form.")}</p></section>;
  return (
    <div className="fb-reqs">
      {reqs.map((r) => {
        const st = ST[r.status];
        const isOpen = open === r.id;
        const live = r.fields.filter((f) => !f.archived);
        return (
          <article key={r.id} className={`card fb-req fb-req--${st[2]}${isOpen ? " is-open" : ""}${highlight === r.id ? " is-hl" : ""}`}>
            <button type="button" className="fb-req__h" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
              <span className="fb-req__n" dir="ltr">{r.number}</span>
              <span className="fb-req__t"><b>{T(`${r.changes.length} تغيير`, `${r.changes.length} change(s)`)} · {r.requested_by}</b><small>{new Date(r.created_at + "Z").toLocaleString(ar ? "ar-SA-u-nu-latn" : "en-GB")} · {T(`على الإصدار ${r.base_version}`, `on v${r.base_version}`)}</small></span>
              <span className={`bd-pill bd-pill--${st[2]}`}>{T(st[0], st[1])}</span>
              <span className="ms ms-sm tp2-lease__chev">expand_more</span>
            </button>
            {isOpen && (
              <div className="fb-req__b">
                {r.reason && <p className="fb-req__why"><span className="ms ms-sm">format_quote</span>{r.reason}</p>}
                <ul className="fb-chg">
                  {r.changes.map((c, i) => { const [ic, tx] = changeText(c, ar); return <li key={i} className={`fb-chg--${c.split(":")[0]}`}><span className="ms ms-sm">{ic}</span>{tx}</li>; })}
                </ul>
                <details className="fb-req__pv">
                  <summary>{T("معاينة النموذج بعد الاعتماد", "Preview the form after approval")}</summary>
                  <CustomFieldsGrid fields={live} values={{}} setValue={() => {}} locale={locale} disabled />
                </details>
                {r.review_note && <p className="fb-req__rv"><b>{r.reviewed_by}:</b> {r.review_note}</p>}
                {r.status === "pending" && (
                  <div className="fb-req__act">
                    {isSuper && (
                      <>
                        <input className="input" placeholder={T("ملاحظة (إلزامية عند الرفض)", "Note (required to reject)")} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                        <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => onDecide(r, "approve", notes[r.id] ?? "")}><span className="ms ms-sm">verified</span>{T("اعتماد وتطبيق", "Approve & apply")}</button>
                        <button className="btn btn-secondary btn-sm" disabled={pending || !(notes[r.id] ?? "").trim()} onClick={() => onDecide(r, "reject", notes[r.id] ?? "")}>{T("رفض", "Reject")}</button>
                      </>
                    )}
                    {r.mine && <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => onDecide(r, "cancel", "")}>{T("سحب الطلب", "Withdraw")}</button>}
                    {!isSuper && <p className="text-sec fb-req__wait"><span className="ms ms-sm">hourglass_top</span>{T("بانتظار اعتماد المشرف العام — لن يتغير النموذج قبل ذلك.", "Waiting for a super admin — the form won't change until then.")}</p>}
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function FieldEditor({ init, isExisting, usedKeys, systemKeys, valueCount, locale, onClose, onSave }: { init: CustomField; isExisting: boolean; usedKeys: Set<string>; systemKeys: Set<string>; valueCount: number; locale: string; onClose: () => void; onSave: (f: CustomField) => void }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [f, setF] = useState<CustomField>({ ...init, options: init.options.map((o) => ({ ...o })) });
  const [keyTouched, setKeyTouched] = useState(isExisting || !!init.key);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof CustomField>(k: K, v: CustomField[K]) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    if (!keyTouched) set("key", slug(f.label_en || "") || (f.label_ar ? `field_${Math.random().toString(36).slice(2, 7)}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.label_en, f.label_ar]);
  const choice = f.type === "select" || f.type === "multiselect";
  const typeLocked = isExisting && valueCount > 0;
  const family = (t: FieldType) => ({ text: "s", textarea: "s", phone: "s", email: "s", url: "s", select: "c", multiselect: "m", number: "n", date: "d", checkbox: "b" })[t];

  const save = () => {
    if (!f.label_ar.trim()) return setErr(T("اكتب اسم الحقل بالعربية.", "Enter the Arabic label."));
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(f.key)) return setErr(T("المعرّف التقني: حروف إنجليزية صغيرة وأرقام و _ ويبدأ بحرف.", "Key: lowercase letters, digits and _, starting with a letter."));
    if (usedKeys.has(f.key)) return setErr(T("هذا المعرّف مستخدم لحقل آخر.", "That key is already used."));
    if (systemKeys.has(f.key)) return setErr(T("هذا المعرّف محجوز لحقل أساسي.", "That key belongs to a built-in field."));
    if (choice && !f.options.filter((o) => o.ar.trim()).length) return setErr(T("أضف خياراً واحداً على الأقل.", "Add at least one choice."));
    onSave({ ...f, label_ar: f.label_ar.trim(), options: choice ? f.options.filter((o) => o.ar.trim()).map((o, i) => ({ ...o, value: o.value || slug(o.en || "") || `opt_${i + 1}` })) : [] });
  };

  return (
    <Modal open onClose={onClose} size="md" icon="dynamic_form" title={isExisting ? T("تعديل حقل", "Edit field") : T("حقل جديد", "New field")} subtitle={T("يظهر في النموذج بعد اعتماد المشرف العام", "Goes live after a super admin approves")}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" onClick={save}>{T("حفظ في المسودة", "Save to draft")}</button></>}>
      <div className="fe">
        <div className="fe-types">
          {(Object.keys(FIELD_TYPES) as FieldType[]).map((t) => {
            const disabled = typeLocked && family(t) !== family(init.type);
            return (
              <button key={t} type="button" className={"fe-type" + (f.type === t ? " is-on" : "")} disabled={disabled} onClick={() => set("type", t)} title={disabled ? T("للحقل قيم محفوظة — يمكن التغيير لنوع متوافق فقط", "Has saved values — only compatible types") : undefined}>
                <span className="ms">{FIELD_TYPES[t].icon}</span><b>{T(FIELD_TYPES[t].ar, FIELD_TYPES[t].en)}</b><small>{T(FIELD_TYPES[t].hint_ar, FIELD_TYPES[t].hint_en)}</small>
              </button>
            );
          })}
        </div>
        <div className="field-row">
          <div className="field"><label>{T("الاسم بالعربية", "Label (Arabic)")} *</label><input className="input" value={f.label_ar} onChange={(e) => set("label_ar", e.target.value)} maxLength={120} autoFocus /></div>
          <div className="field"><label>{T("الاسم بالإنجليزية", "Label (English)")}</label><input className="input" dir="ltr" value={f.label_en ?? ""} onChange={(e) => set("label_en", e.target.value)} maxLength={120} /></div>
        </div>
        <div className="field-row">
          <div className="field"><label>{T("المعرّف التقني", "Field key")}</label><input className="input mono" dir="ltr" value={f.key} disabled={isExisting} onChange={(e) => { setKeyTouched(true); set("key", e.target.value.toLowerCase()); }} maxLength={40} /><small className="cf-help">{isExisting ? T("لا يتغير بعد الإنشاء — القيم المحفوظة مرتبطة به", "Can't change once created — saved values use it") : T("يُستخدم داخلياً وفي التصدير", "Used internally and in exports")}</small></div>
          <div className="field"><label>{T("القسم (اختياري)", "Section (optional)")}</label><input className="input" value={f.section_ar ?? ""} onChange={(e) => set("section_ar", e.target.value)} placeholder={T("مثال: بيانات الطوارئ", "e.g. Emergency")} maxLength={80} /></div>
        </div>
        {choice && (
          <div className="fe-opts">
            <label>{T("الخيارات", "Choices")}</label>
            {f.options.map((o, i) => (
              <div key={i} className="fe-opt">
                <input className="input" value={o.ar} placeholder={T("بالعربية", "Arabic")} onChange={(e) => set("options", f.options.map((x, j) => (j === i ? { ...x, ar: e.target.value } : x)))} />
                <input className="input" dir="ltr" value={o.en ?? ""} placeholder="English" onChange={(e) => set("options", f.options.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)))} />
                <button type="button" className="icon-btn" onClick={() => set("options", f.options.filter((_, j) => j !== i))} aria-label={T("حذف", "Remove")}><span className="ms ms-sm">close</span></button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("options", [...f.options, { value: "", ar: "", en: "" }])}><span className="ms ms-sm">add</span>{T("إضافة خيار", "Add choice")}</button>
          </div>
        )}
        <div className="field"><label>{T("تلميح يظهر تحت الحقل (اختياري)", "Hint under the field (optional)")}</label><input className="input" value={f.help_ar ?? ""} onChange={(e) => set("help_ar", e.target.value)} maxLength={300} /></div>
        <label className="cf-toggle fe-req">
          <input type="checkbox" checked={f.required} onChange={(e) => set("required", e.target.checked)} />
          <span className="cf-toggle__track"><i /></span>
          <span><b>{T("حقل إلزامي", "Required")}</b> — {T("لا يُحفظ السجل بدونه", "the record can't be saved without it")}</span>
        </label>
        {typeLocked && <p className="fe-warn"><span className="ms ms-sm">info</span>{T(`لهذا الحقل ${valueCount} قيمة محفوظة، لذلك يمكن تغيير نوعه إلى نوع متوافق فقط.`, `This field has ${valueCount} saved value(s), so it can only change to a compatible type.`)}</p>}
        <div className="fe-pv"><small>{T("المعاينة", "Preview")}</small><CustomFieldsGrid fields={[{ ...f, label_ar: f.label_ar || T("اسم الحقل", "Field name") }]} values={{}} setValue={() => {}} locale={locale} /></div>
        {err && <p className="mx-err">{err}</p>}
      </div>
    </Modal>
  );
}
