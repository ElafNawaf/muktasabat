"use client";

import { useEffect, useState, useTransition } from "react";

import {
  loadWorkflows,
  resetWorkflow,
  saveWorkflow,
  type ApproverSpec,
  type Workflow,
  type WorkflowCatalogue,
  type WorkflowStep,
} from "@/lib/workflow-actions";

const APPROVER: Record<string, [string, string, string]> = {
  owner: ["home", "مالك العقار", "Property owner"],
  role: ["shield_person", "كل من لديه دور", "Everyone with a role"],
  user: ["person", "شخص محدد", "A specific person"],
  permission: ["key", "من لديه صلاحية", "Anyone with a permission"],
  line_manager: ["supervisor_account", "المدير المباشر", "Line manager"],
  hr_approver: ["badge", "معتمد الموارد البشرية", "HR approver"],
};

const HR_KIND: Record<string, [string, string]> = {
  leave: ["إجازة", "Leave"], permission: ["استئذان", "Permission"], ticket: ["تذكرة سفر", "Travel ticket"], work_location: ["عمل عن بُعد / ميداني", "Remote / field"],
};
const CHARGE: Record<string, [string, string]> = { owner: ["المالك", "Owner"], company: ["الشركة", "Company"], tenant: ["المستأجر", "Tenant"] };
const CATS = ["maintenance", "utilities", "insurance", "legal", "marketing", "cleaning", "security", "government_fees", "other"];
const CAT: Record<string, [string, string]> = {
  maintenance: ["صيانة", "Maintenance"], utilities: ["خدمات", "Utilities"], insurance: ["تأمين", "Insurance"], legal: ["قانونية", "Legal"],
  marketing: ["تسويق", "Marketing"], cleaning: ["نظافة", "Cleaning"], security: ["حراسة", "Security"], government_fees: ["رسوم حكومية", "Government fees"], other: ["أخرى", "Other"],
};
const ACTIONS: Record<string, [string, string]> = { view: ["عرض", "View"], create: ["إضافة", "Create"], edit: ["تعديل", "Edit"], delete: ["حذف", "Delete"], approve: ["اعتماد", "Approve"] };

export function WorkflowsAdmin({ locale, moduleLabel }: { locale: string; moduleLabel: (m: string) => string }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [cat, setCat] = useState<WorkflowCatalogue | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflows(locale).then((r) => (r.ok ? setCat(r.data) : setErr(r.error)));
  }, [locale]);

  if (err) return <div className="card" style={{ padding: 20 }}><p className="mx-err">{err}</p></div>;
  if (!cat) return <div className="card" style={{ padding: 20 }}><div className="skeleton" style={{ height: 120 }} /></div>;

  const replace = (w: Workflow) => setCat((c) => (c ? { ...c, workflows: c.workflows.map((x) => (x.key === w.key ? w : x)) } : c));

  return (
    <div className="wfa">
      <div className="wfa-intro card">
        <span className="ms" aria-hidden>account_tree</span>
        <div>
          <strong>{T("مسارات الاعتماد", "Approval workflows")}</strong>
          <p className="text-sec">
            {T(
              "حدّد لكل عملية من يعتمدها وبأي ترتيب. تمرّ الطلبات على الخطوات بالتسلسل، والخطوة التي لا ينطبق شرطها تُتخطّى تلقائيًا. لا يعتمد أحد طلبه بنفسه، ويستطيع مدير النظام القرار في أي خطوة. التعديلات تسري على الطلبات الجديدة؛ الطلبات المفتوحة تكمل مسارها الحالي.",
              "Set who approves each process and in what order. Requests go through the steps in sequence; a step whose conditions don't match is skipped. Nobody approves their own request, and administrators can decide any step. Changes apply to new requests — open ones finish their current chain.",
            )}
          </p>
        </div>
      </div>

      <div className="wfa-list">
        {cat.workflows.map((w) => (
          <WorkflowCard key={w.key} w={w} cat={cat} locale={locale} open={open === w.key} onToggle={() => setOpen(open === w.key ? null : w.key)} onSaved={replace} moduleLabel={moduleLabel} />
        ))}
      </div>

      <h3 className="wfa-h">{T("مسارات ثابتة (تُدار بالصلاحيات)", "Fixed flows (controlled by permissions)")}</h3>
      <div className="wfa-fixed">
        {cat.fixed.map((f) => (
          <div key={f.key} className="wfa-fixed-item card">
            <span className="ms" aria-hidden>{f.icon}</span>
            <div><strong>{f.name}</strong><p className="text-sec">{f.who}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowCard({
  w, cat, locale, open, onToggle, onSaved, moduleLabel,
}: {
  w: Workflow; cat: WorkflowCatalogue; locale: string; open: boolean; onToggle: () => void; onSaved: (w: Workflow) => void; moduleLabel: (m: string) => string;
}) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [enabled, setEnabled] = useState(w.enabled);
  const [steps, setSteps] = useState<WorkflowStep[]>(w.steps);
  const [emails, setEmails] = useState(w.notify_emails ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = enabled !== w.enabled || emails !== (w.notify_emails ?? "") || JSON.stringify(steps) !== JSON.stringify(w.steps);

  useEffect(() => {
    setEnabled(w.enabled); setSteps(w.steps); setEmails(w.notify_emails ?? "");
  }, [w]);

  const nf = new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 });
  const label = (s: WorkflowStep) => (ar ? s.label_ar || s.label_en : s.label_en || s.label_ar) || s.approver_label || describe(s.approver);

  function describe(a?: ApproverSpec | null): string {
    if (!a) return "—";
    const base = APPROVER[a.type] ? T(APPROVER[a.type][1], APPROVER[a.type][2]) : a.type;
    if (a.type === "role") return cat.options.roles.find((r) => r.value === a.value)?.label ?? base;
    if (a.type === "user") return cat.options.users.find((u) => String(u.value) === String(a.value))?.label ?? base;
    if (a.type === "permission" && a.value) {
      const [m, act] = String(a.value).split(".");
      return `${moduleLabel(m)} → ${T(ACTIONS[act]?.[0] ?? act, ACTIONS[act]?.[1] ?? act)}`;
    }
    return base;
  }

  function cond(s: WorkflowStep): string[] {
    const out: string[] = [];
    const wh = s.when || {};
    if (wh.min_amount != null) out.push(T(`≥ ${nf.format(Number(wh.min_amount))} ر.س`, `≥ SAR ${nf.format(Number(wh.min_amount))}`));
    if (wh.max_amount != null) out.push(T(`≤ ${nf.format(Number(wh.max_amount))} ر.س`, `≤ SAR ${nf.format(Number(wh.max_amount))}`));
    if (wh.above_owner_limit) out.push(T("فوق حد المالك", "Above owner's limit"));
    if (Array.isArray(wh.charge_to)) out.push(T("على: ", "Billed to: ") + (wh.charge_to as string[]).map((c) => T(CHARGE[c]?.[0] ?? c, CHARGE[c]?.[1] ?? c)).join("، "));
    if (Array.isArray(wh.kinds)) out.push((wh.kinds as string[]).map((k) => T(HR_KIND[k]?.[0] ?? k, HR_KIND[k]?.[1] ?? k)).join(" / "));
    if (wh.min_days != null) out.push(T(`${wh.min_days} أيام فأكثر`, `${wh.min_days}+ days`));
    if (Array.isArray(wh.categories)) out.push((wh.categories as string[]).map((c) => T(CAT[c]?.[0] ?? c, CAT[c]?.[1] ?? c)).join("، "));
    if (Array.isArray(wh.paid_by)) out.push(T("يدفعها: ", "Paid by: ") + (wh.paid_by as string[]).map((c) => T(CHARGE[c]?.[0] ?? c, CHARGE[c]?.[1] ?? c)).join("، "));
    return out;
  }

  const upd = (i: number, patch: Partial<WorkflowStep>) => setSteps((ss) => ss.map((s, n) => (n === i ? { ...s, ...patch, approver_label: undefined } : s)));
  const updWhen = (i: number, k: string, v: unknown) =>
    setSteps((ss) => ss.map((s, n) => {
      if (n !== i) return s;
      const when = { ...(s.when || {}) };
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) || v === false) delete when[k];
      else when[k] = v;
      return { ...s, when };
    }));
  const move = (i: number, d: -1 | 1) => setSteps((ss) => {
    const j = i + d;
    if (j < 0 || j >= ss.length) return ss;
    const c = [...ss];
    [c[i], c[j]] = [c[j], c[i]];
    return c;
  });
  const add = () => setSteps((ss) => [...ss, { key: `s${Date.now() % 100000}`, approver: { type: w.approver_types.find((t) => t !== "owner") ?? w.approver_types[0] }, when: {}, sla_hours: 48 }]);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveWorkflow(w.key, { enabled, steps, notify_emails: emails || null }, locale);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      onSaved(r.data);
      setMsg({ ok: true, text: T("حُفظ — يسري على الطلبات الجديدة", "Saved — applies to new requests") });
    });
  }
  function reset() {
    if (!window.confirm(T("استعادة المسار الافتراضي؟", "Restore the default chain?"))) return;
    start(async () => {
      const r = await resetWorkflow(w.key, locale);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      onSaved(r.data);
      setMsg({ ok: true, text: T("استُعيد الافتراضي", "Default restored") });
    });
  }

  return (
    <section className={`wfa-card card${open ? " is-open" : ""}${!w.enabled ? " is-off" : ""}`}>
      <button type="button" className="wfa-head" onClick={onToggle} aria-expanded={open}>
        <span className="wfa-ico ms" aria-hidden>{w.icon}</span>
        <span className="wfa-title">
          <strong>{w.name}</strong>
          <span className="wfa-flow">
            {!w.enabled ? (
              <em>{T("متوقف — يُعتمد تلقائيًا", "Off — auto-approved")}</em>
            ) : (
              w.steps.map((s, n) => (
                <span key={n} className="wfa-pill">
                  <b>{n + 1}</b>{label(s)}
                  {cond(s).length > 0 && <i>{cond(s).join(" · ")}</i>}
                </span>
              ))
            )}
          </span>
        </span>
        <span className="wfa-stats">
          {w.pending > 0 && <span className="badge">{T(`${nf.format(w.pending)} بانتظار`, `${nf.format(w.pending)} waiting`)}</span>}
          {w.overdue > 0 && <span className="mx-sla mx-sla--breached">{T(`${nf.format(w.overdue)} متأخر`, `${nf.format(w.overdue)} overdue`)}</span>}
          <span className="ms" aria-hidden>{open ? "expand_less" : "expand_more"}</span>
        </span>
      </button>

      {open && (
        <div className="wfa-body">
          {w.description && <p className="text-sec wfa-desc">{w.description}</p>}
          <label className="wfa-switch">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>{enabled ? T("المسار مفعّل", "Workflow on") : T("المسار متوقف — كل الطلبات تُعتمد تلقائيًا", "Workflow off — every request is approved automatically")}</span>
          </label>

          {enabled && (
            <ol className="wfa-steps">
              {steps.map((s, i) => (
                <li key={s.key ?? i} className="wfa-step">
                  <div className="wfa-step-n">{i + 1}</div>
                  <div className="wfa-step-body">
                    <div className="wfa-row">
                      <label className="wfa-f">
                        <span>{T("من يعتمد", "Who approves")}</span>
                        <select className="input" value={s.approver.type} onChange={(e) => upd(i, { approver: { type: e.target.value } })}>
                          {w.approver_types.map((t) => <option key={t} value={t}>{T(APPROVER[t]?.[1] ?? t, APPROVER[t]?.[2] ?? t)}</option>)}
                        </select>
                      </label>
                      {s.approver.type === "role" && (
                        <label className="wfa-f">
                          <span>{T("الدور", "Role")}</span>
                          <select className="input" value={String(s.approver.value ?? "")} onChange={(e) => upd(i, { approver: { type: "role", value: e.target.value } })}>
                            <option value="">—</option>
                            {cat.options.roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </label>
                      )}
                      {s.approver.type === "user" && (
                        <label className="wfa-f">
                          <span>{T("الشخص", "Person")}</span>
                          <select className="input" value={String(s.approver.value ?? "")} onChange={(e) => upd(i, { approver: { type: "user", value: e.target.value ? Number(e.target.value) : null } })}>
                            <option value="">—</option>
                            {cat.options.users.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                          </select>
                        </label>
                      )}
                      {s.approver.type === "permission" && (
                        <PermissionPicker value={String(s.approver.value ?? "")} modules={cat.options.modules} moduleLabel={moduleLabel} ar={ar} onChange={(v) => upd(i, { approver: { type: "permission", value: v } })} />
                      )}
                      <label className="wfa-f">
                        <span>{T("اسم الخطوة (اختياري)", "Step name (optional)")}</span>
                        <input className="input" value={(ar ? s.label_ar : s.label_en) ?? ""} onChange={(e) => upd(i, ar ? { label_ar: e.target.value } : { label_en: e.target.value })} placeholder={describe(s.approver)} />
                      </label>
                    </div>

                    <div className="wfa-row">
                      {w.conditions.includes("min_amount") && (
                        <label className="wfa-f wfa-f--sm">
                          <span>{T("فقط إذا المبلغ ≥", "Only if amount ≥")}{w.amount_label ? <small> ({w.amount_label})</small> : null}</span>
                          <input className="input" inputMode="decimal" dir="ltr" value={(s.when?.min_amount as number | undefined) ?? ""} onChange={(e) => updWhen(i, "min_amount", e.target.value === "" ? undefined : Number(e.target.value))} placeholder="0" />
                        </label>
                      )}
                      {w.conditions.includes("max_amount") && (
                        <label className="wfa-f wfa-f--sm">
                          <span>{T("و ≤", "and ≤")}</span>
                          <input className="input" inputMode="decimal" dir="ltr" value={(s.when?.max_amount as number | undefined) ?? ""} onChange={(e) => updWhen(i, "max_amount", e.target.value === "" ? undefined : Number(e.target.value))} placeholder="∞" />
                        </label>
                      )}
                      {w.conditions.includes("min_days") && (
                        <label className="wfa-f wfa-f--sm">
                          <span>{T("مدة ≥ (أيام)", "Duration ≥ (days)")}</span>
                          <input className="input" inputMode="decimal" dir="ltr" value={(s.when?.min_days as number | undefined) ?? ""} onChange={(e) => updWhen(i, "min_days", e.target.value === "" ? undefined : Number(e.target.value))} placeholder="0" />
                        </label>
                      )}
                      {w.conditions.includes("above_owner_limit") && (
                        <label className="wfa-check">
                          <input type="checkbox" checked={!!s.when?.above_owner_limit} onChange={(e) => updWhen(i, "above_owner_limit", e.target.checked)} />
                          {T("فقط فوق الحد المفوَّض للمالك", "Only above the owner's pre-approved limit")}
                        </label>
                      )}
                    </div>
                    {w.conditions.includes("charge_to") && (
                      <Chips label={T("على حساب", "Billed to")} all={Object.keys(CHARGE)} names={CHARGE} ar={ar} value={s.when?.charge_to as string[] | undefined} onChange={(v) => updWhen(i, "charge_to", v)} />
                    )}
                    {w.conditions.includes("kinds") && (
                      <Chips label={T("نوع الطلب", "Request type")} all={cat.options.kinds} names={HR_KIND} ar={ar} value={s.when?.kinds as string[] | undefined} onChange={(v) => updWhen(i, "kinds", v)} />
                    )}
                    {w.conditions.includes("categories") && (
                      <Chips label={T("فئة المصروف", "Expense category")} all={CATS} names={CAT} ar={ar} value={s.when?.categories as string[] | undefined} onChange={(v) => updWhen(i, "categories", v)} />
                    )}
                    {w.conditions.includes("paid_by") && (
                      <Chips label={T("يدفعها", "Paid by")} all={Object.keys(CHARGE)} names={CHARGE} ar={ar} value={s.when?.paid_by as string[] | undefined} onChange={(v) => updWhen(i, "paid_by", v)} />
                    )}

                    <div className="wfa-row">
                      <label className="wfa-f wfa-f--sm">
                        <span>{T("وقت الاستجابة (ساعات)", "Response time (hours)")}</span>
                        <input className="input" inputMode="numeric" dir="ltr" value={s.sla_hours ?? ""} onChange={(e) => upd(i, { sla_hours: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value) || 0)) })} placeholder={T("بدون", "None")} />
                      </label>
                      <label className="wfa-f">
                        <span>{T("عند التأخر يُصعَّد إلى", "If late, escalate to")}</span>
                        <select
                          className="input"
                          value={s.escalate_to ? `${s.escalate_to.type}:${s.escalate_to.value ?? ""}` : ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) return upd(i, { escalate_to: null });
                            const [type, ...rest] = v.split(":");
                            const value = rest.join(":");
                            upd(i, { escalate_to: { type, value: type === "user" ? Number(value) : value } });
                          }}
                        >
                          <option value="">{T("لا أحد (تذكير فقط)", "Nobody (reminder only)")}</option>
                          <optgroup label={T("دور", "Role")}>
                            {cat.options.roles.map((r) => <option key={r.value} value={`role:${r.value}`}>{r.label}</option>)}
                          </optgroup>
                          <optgroup label={T("شخص", "Person")}>
                            {cat.options.users.map((u) => <option key={u.value} value={`user:${u.value}`}>{u.label}</option>)}
                          </optgroup>
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="wfa-step-act">
                    <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={T("أعلى", "Move up")}><span className="ms ms-sm">arrow_upward</span></button>
                    <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label={T("أسفل", "Move down")}><span className="ms ms-sm">arrow_downward</span></button>
                    <button type="button" className="icon-btn icon-btn--danger" onClick={() => setSteps((ss) => ss.filter((_, n) => n !== i))} aria-label={T("حذف الخطوة", "Remove step")}><span className="ms ms-sm">delete</span></button>
                  </div>
                </li>
              ))}
              {steps.length < 8 && (
                <li className="wfa-add">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={add}><span className="ms ms-sm">add</span> {T("إضافة خطوة", "Add a step")}</button>
                </li>
              )}
            </ol>
          )}

          <label className="wfa-f">
            <span>{T("إشعار بالقرار النهائي (بريد، يفصل بينها فاصلة)", "Copy the final decision to (e-mails, comma-separated)")}</span>
            <input className="input" dir="ltr" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="finance@company.sa" />
          </label>

          <div className="wfa-foot">
            {msg && <span className={msg.ok ? "wfa-ok" : "mx-err"}>{msg.text}</span>}
            {w.updated_by && <span className="text-sec">{T(`آخر تعديل: ${w.updated_by}`, `Last changed by ${w.updated_by}`)}</span>}
            <span style={{ flex: 1 }} />
            {w.customised && <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={reset}>{T("استعادة الافتراضي", "Restore default")}</button>}
            <button type="button" className="btn btn-primary btn-sm" disabled={pending || !dirty} onClick={save}>{pending ? T("جارٍ الحفظ…", "Saving…") : T("حفظ المسار", "Save workflow")}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Chips({ label, all, names, ar, value, onChange }: { label: string; all: string[]; names: Record<string, [string, string]>; ar: boolean; value?: string[]; onChange: (v: string[] | undefined) => void }) {
  const set = new Set(value ?? []);
  return (
    <div className="wfa-chips" role="group" aria-label={label}>
      <span>{label}:</span>
      <button type="button" className={!value?.length ? "is-on" : ""} onClick={() => onChange(undefined)}>{ar ? "الكل" : "Any"}</button>
      {all.map((k) => (
        <button
          type="button"
          key={k}
          className={set.has(k) ? "is-on" : ""}
          aria-pressed={set.has(k)}
          onClick={() => {
            const n = new Set(set);
            if (n.has(k)) n.delete(k); else n.add(k);
            onChange(n.size ? Array.from(n) : undefined);
          }}
        >
          {ar ? names[k]?.[0] ?? k : names[k]?.[1] ?? k}
        </button>
      ))}
    </div>
  );
}

function PermissionPicker({ value, modules, moduleLabel, ar, onChange }: { value: string; modules: string[]; moduleLabel: (m: string) => string; ar: boolean; onChange: (v: string) => void }) {
  const [m, a] = value.includes(".") ? value.split(".") : ["", "approve"];
  return (
    <>
      <label className="wfa-f">
        <span>{ar ? "الوحدة" : "Module"}</span>
        <select className="input" value={m} onChange={(e) => onChange(`${e.target.value}.${a || "approve"}`)}>
          <option value="">—</option>
          {modules.map((x) => <option key={x} value={x}>{moduleLabel(x)}</option>)}
        </select>
      </label>
      <label className="wfa-f wfa-f--sm">
        <span>{ar ? "الصلاحية" : "Permission"}</span>
        <select className="input" value={a || "approve"} onChange={(e) => onChange(`${m}.${e.target.value}`)}>
          {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{ar ? v[0] : v[1]}</option>)}
        </select>
      </label>
    </>
  );
}
