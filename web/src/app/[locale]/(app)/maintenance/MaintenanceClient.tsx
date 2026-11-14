"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { FilterBar, FilterSearch, FilterSelect, FilterStatusPills } from "@/components/EntityFilterBar";
import { Modal } from "@/components/Modal";
import {
  woAssign, woCancel, woClose, woComplete, woCreate, woDecision, woEstimate, woGet, woNote, woStart,
} from "@/lib/maintenance-actions";

export type WorkOrder = {
  id: number; number: string; title: string; description?: string | null; category: string; priority: string; status: string;
  building_id: number; building: string; unit_id?: number | null; unit?: string | null; owner?: string | null;
  reported_by: string; reporter_name?: string | null; reporter_phone?: string | null;
  assignee_id?: number | null; assignee?: string | null; vendor_name?: string | null; vendor_phone?: string | null;
  estimate_amount?: number | null; actual_cost?: number | null; charge_to: string; approval_limit?: number | null; approval_required: boolean;
  approved_by?: string | null; approved_at?: string | null; decision_note?: string | null;
  due_at?: string | null; started_at?: string | null; completed_at?: string | null; created_at: string; resolution?: string | null;
  rating?: number | null; expense_id?: number | null; sla: "on_track" | "at_risk" | "breached" | "done" | "none";
  events?: { at: string; actor?: string | null; action: string; note?: string | null }[];
};
export type WOStats = { open: number; emergency_open: number; awaiting_approval: number; breached: number; completed_month: number; cost_month: number; avg_resolution_hours: number | null; sla_met_pct: number | null };

type Opt = { id: number; name: string };
type Props = {
  locale: string; orders: WorkOrder[]; stats: WOStats;
  buildings: (Opt & { assignee_id: number | null })[]; units: { id: number; building_id: number; label: string }[]; users: Opt[];
  can: { create: boolean; edit: boolean; approve: boolean; delete: boolean };
};

const L = {
  status: { new: ["جديد", "New"], assigned: ["مُسند", "Assigned"], awaiting_approval: ["بانتظار الموافقة", "Awaiting approval"], approved: ["معتمد", "Approved"], rejected: ["مرفوض", "Rejected"], in_progress: ["قيد التنفيذ", "In progress"], completed: ["منجز", "Completed"], closed: ["مغلق", "Closed"], cancelled: ["ملغى", "Cancelled"] },
  priority: { emergency: ["طارئ", "Emergency"], high: ["عالية", "High"], normal: ["عادية", "Normal"], low: ["منخفضة", "Low"] },
  category: { plumbing: ["سباكة", "Plumbing"], electrical: ["كهرباء", "Electrical"], ac: ["تكييف", "A/C"], carpentry: ["نجارة", "Carpentry"], painting: ["دهانات", "Painting"], cleaning: ["نظافة", "Cleaning"], pest: ["مكافحة حشرات", "Pest control"], appliances: ["أجهزة", "Appliances"], structural: ["إنشائي", "Structural"], elevator: ["مصاعد", "Elevator"], fire_safety: ["سلامة وحريق", "Fire safety"], other: ["أخرى", "Other"] },
  sla: { on_track: ["ضمن الوقت", "On track"], at_risk: ["يقترب من المهلة", "At risk"], breached: ["تجاوز المهلة", "Overdue"], done: ["", ""], none: ["", ""] },
  charge: { owner: ["على المالك", "Owner"], tenant: ["على المستأجر", "Tenant"], company: ["على الشركة", "Company"] },
  action: { created: ["أُنشئ", "Created"], assigned: ["أُسند", "Assigned"], updated: ["عُدّل", "Updated"], estimated: ["تقدير التكلفة", "Estimated"], approval_requested: ["طُلبت الموافقة", "Approval requested"], auto_approved: ["اعتماد تلقائي", "Auto-approved"], approved: ["تمت الموافقة", "Approved"], rejected: ["رُفض", "Rejected"], started: ["بدأ التنفيذ", "Started"], completed: ["أُنجز", "Completed"], expense_posted: ["سُجّل كمصروف", "Expense posted"], closed: ["أُغلق", "Closed"], cancelled: ["أُلغي", "Cancelled"], note: ["ملاحظة", "Note"] },
} as const;

export function MaintenanceClient({ locale, orders, stats, buildings, units, users, can }: Props) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const lbl = <K extends keyof typeof L>(k: K, v: string) => ((L[k] as Record<string, readonly [string, string]>)[v]?.[ar ? 0 : 1] ?? v);
  const router = useRouter();
  const nf = new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 });
  const df = new Intl.DateTimeFormat(ar ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium" });
  const dtf = new Intl.DateTimeFormat(ar ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  const [tab, setTab] = useState<"open" | "awaiting_approval" | "in_progress" | "completed" | "all">("open");
  const [q, setQ] = useState("");
  const [prio, setPrio] = useState("all");
  const [bld, setBld] = useState("all");
  const [mine, setMine] = useState("all");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("open"));
    if (id) setOpenId(id);
  }, []);

  const OPEN = ["new", "assigned", "awaiting_approval", "approved", "in_progress"];
  const count = (f: (w: WorkOrder) => boolean) => orders.filter(f).length;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return orders.filter((w) =>
      (tab === "all" || (tab === "open" ? OPEN.includes(w.status) : tab === "completed" ? ["completed", "closed"].includes(w.status) : w.status === tab)) &&
      (prio === "all" || w.priority === prio) &&
      (bld === "all" || String(w.building_id) === bld) &&
      (mine === "all" || String(w.assignee_id ?? "") === mine) &&
      (!s || `${w.number} ${w.title} ${w.building} ${w.unit ?? ""} ${w.assignee ?? ""} ${w.vendor_name ?? ""}`.toLowerCase().includes(s)),
    );
  }, [orders, tab, q, prio, bld, mine]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page screen-enter mx">
      <div className="page-header">
        <div>
          <h2 className="page-title">{T("الصيانة وأوامر العمل", "Maintenance & work orders")}</h2>
          <div className="page-subtitle">{T("من استلام البلاغ حتى الإنجاز: إسناد، تقدير تكلفة، موافقة المالك عند تجاوز الحد المفوَّض، ثم تسجيل المصروف تلقائيًا.", "From report to resolution: assign, estimate, owner approval above the pre-authorised limit, and the expense posted automatically.")}</div>
        </div>
        {can.create && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <span className="ms">add</span> {T("طلب صيانة جديد", "New work order")}
          </button>
        )}
      </div>

      <div className="mx-kpis">
        <Kpi icon="build" label={T("طلبات مفتوحة", "Open jobs")} value={nf.format(stats.open)} sub={stats.emergency_open ? T(`${nf.format(stats.emergency_open)} طارئة`, `${nf.format(stats.emergency_open)} emergency`) : undefined} tone={stats.emergency_open ? "bad" : "neutral"} />
        <Kpi icon="gavel" label={T("بانتظار الموافقة", "Awaiting approval")} value={nf.format(stats.awaiting_approval)} tone={stats.awaiting_approval ? "warn" : "neutral"} onClick={() => setTab("awaiting_approval")} />
        <Kpi icon="timer_off" label={T("تجاوزت المهلة", "Past response time")} value={nf.format(stats.breached)} tone={stats.breached ? "bad" : "good"} />
        <Kpi icon="verified" label={T("الالتزام بالمهلة", "Response time met")} value={stats.sla_met_pct == null ? "—" : `${nf.format(stats.sla_met_pct)}%`} tone={(stats.sla_met_pct ?? 100) >= 90 ? "good" : "warn"} />
        <Kpi icon="schedule" label={T("متوسط مدة الإنجاز", "Avg. time to complete")} value={stats.avg_resolution_hours == null ? "—" : stats.avg_resolution_hours < 48 ? T(`${nf.format(stats.avg_resolution_hours)} ساعة`, `${nf.format(stats.avg_resolution_hours)} h`) : T(`${nf.format(stats.avg_resolution_hours / 24)} يوم`, `${nf.format(stats.avg_resolution_hours / 24)} days`)} tone="neutral" />
        <Kpi icon="payments" label={T("تكلفة الصيانة هذا الشهر", "Maintenance cost this month")} value={`${nf.format(stats.cost_month)} ${T("ر.س", "SAR")}`} sub={T(`${nf.format(stats.completed_month)} طلب منجز`, `${nf.format(stats.completed_month)} completed`)} tone="neutral" />
      </div>

      <FilterBar
        statusRow={
          <FilterStatusPills
            value={tab}
            onChange={setTab}
            options={[
              { value: "open", label: T("المفتوحة", "Open"), count: count((w) => OPEN.includes(w.status)) },
              { value: "awaiting_approval", label: T("بانتظار الموافقة", "Awaiting approval"), count: count((w) => w.status === "awaiting_approval") },
              { value: "in_progress", label: T("قيد التنفيذ", "In progress"), count: count((w) => w.status === "in_progress") },
              { value: "completed", label: T("المنجزة", "Completed"), count: count((w) => ["completed", "closed"].includes(w.status)) },
              { value: "all", label: T("الكل", "All"), count: orders.length },
            ]}
          />
        }
        search={<FilterSearch value={q} onChange={setQ} placeholder={T("بحث برقم الطلب أو العنوان أو المبنى…", "Search number, title or building…")} />}
      >
        <FilterSelect label={T("الأولوية", "Priority")} value={prio} onChange={setPrio} options={[{ value: "all", label: T("الكل", "All") }, ...Object.keys(L.priority).map((p) => ({ value: p, label: lbl("priority", p) }))]} />
        <FilterSelect label={T("المبنى", "Building")} value={bld} onChange={setBld} options={[{ value: "all", label: T("كل المباني", "All buildings") }, ...buildings.map((b) => ({ value: String(b.id), label: b.name }))]} />
        <FilterSelect label={T("المسؤول", "Assignee")} value={mine} onChange={setMine} options={[{ value: "all", label: T("الجميع", "Everyone") }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]} />
      </FilterBar>

      {shown.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><span className="ms">handyman</span></div>
          <div className="empty-title">{orders.length ? T("لا توجد طلبات مطابقة", "No matching work orders") : T("لا توجد طلبات صيانة بعد", "No work orders yet")}</div>
          <div className="empty-sub">{T("سجّل كل بلاغ صيانة هنا ليُتابَع حتى الإنجاز، وتظهر تكلفته في كشف حساب المالك.", "Log every maintenance report here so it is tracked to completion and its cost reaches the owner's statement.")}</div>
        </div>
      ) : (
        <div className="card card-tight">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{T("الطلب", "Work order")}</th>
                  <th>{T("الموقع", "Location")}</th>
                  <th>{T("الأولوية", "Priority")}</th>
                  <th>{T("الحالة", "Status")}</th>
                  <th>{T("المهلة", "Response time")}</th>
                  <th>{T("المسؤول", "Assignee")}</th>
                  <th>{T("التكلفة", "Cost")}</th>
                  <th>{T("التاريخ", "Opened")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((w) => (
                  <tr key={w.id} className="mx-row" onClick={() => setOpenId(w.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenId(w.id)}>
                    <td>
                      <strong>{w.title}</strong>
                      <div className="text-sec" style={{ fontSize: 12 }}>{w.number} · {lbl("category", w.category)}</div>
                    </td>
                    <td>{w.building}{w.unit ? <div className="text-sec" style={{ fontSize: 12 }}>{T("وحدة", "Unit")} {w.unit}</div> : null}</td>
                    <td><span className={`mx-prio mx-prio--${w.priority}`}>{lbl("priority", w.priority)}</span></td>
                    <td><span className={`mx-status mx-status--${w.status}`}>{lbl("status", w.status)}</span></td>
                    <td>{w.sla === "done" || w.sla === "none" ? <span className="text-sec">—</span> : <span className={`mx-sla mx-sla--${w.sla}`}>{lbl("sla", w.sla)}</span>}</td>
                    <td>{w.assignee || w.vendor_name || <span className="text-sec">{T("غير مُسند", "Unassigned")}</span>}</td>
                    <td>{w.actual_cost != null ? `${nf.format(w.actual_cost)} ${T("ر.س", "SAR")}` : w.estimate_amount != null ? <span className="text-sec">≈ {nf.format(w.estimate_amount)}</span> : "—"}</td>
                    <td className="text-sec">{df.format(new Date(w.created_at + "Z"))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && (
        <CreateModal
          locale={locale}
          buildings={buildings}
          units={units}
          users={users}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.refresh();
            setOpenId(id);
          }}
        />
      )}
      {openId != null && <DetailDrawer id={openId} locale={locale} users={users} can={can} onClose={() => { setOpenId(null); router.refresh(); }} lbl={lbl} dtf={dtf} nf={nf} />}
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone, onClick }: { icon: string; label: string; value: string; sub?: string; tone: "good" | "warn" | "bad" | "neutral"; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`mx-kpi is-${tone}`} onClick={onClick}>
      <span className="ms mx-kpi__ico" aria-hidden>{icon}</span>
      <span className="mx-kpi__label">{label}</span>
      <strong className="mx-kpi__value">{value}</strong>
      {sub && <span className="mx-kpi__sub">{sub}</span>}
    </Tag>
  );
}

function CreateModal({ locale, buildings, units, users, onClose, onCreated }: { locale: string; buildings: (Opt & { assignee_id: number | null })[]; units: { id: number; building_id: number; label: string }[]; users: Opt[]; onClose: () => void; onCreated: (id: number) => void }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [f, setF] = useState({ building_id: buildings[0]?.id ?? 0, unit_id: "", title: "", category: "other", priority: "normal", description: "", reported_by: "tenant", reporter_name: "", reporter_phone: "", assignee_id: "", vendor_name: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f, v: string | number) => setF((x) => ({ ...x, [k]: v }));
  const b = buildings.find((x) => x.id === Number(f.building_id));
  const responsible = b?.assignee_id ? users.find((u) => u.id === b.assignee_id)?.name : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    start(async () => {
      const r = await woCreate({
        building_id: Number(f.building_id), unit_id: f.unit_id ? Number(f.unit_id) : null, title: f.title, category: f.category, priority: f.priority,
        description: f.description || null, reported_by: f.reported_by, reporter_name: f.reporter_name || null, reporter_phone: f.reporter_phone || null,
        assignee_id: f.assignee_id ? Number(f.assignee_id) : null, vendor_name: f.vendor_name || null,
      });
      if (!r.ok) return setErr(r.error);
      onCreated((r.data as { id: number }).id);
    });
  }

  return (
    <Modal open onClose={onClose} title={T("طلب صيانة جديد", "New work order")} subtitle={T("يُحسب موعد الاستجابة تلقائيًا من الأولوية.", "The response deadline is set from the priority.")}
      footer={<><button className="btn btn-secondary" onClick={onClose} type="button">{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" form="wo-new" disabled={pending}>{pending ? "…" : T("إنشاء الطلب", "Create work order")}</button></>}>
      <form id="wo-new" className="mx-form" onSubmit={submit}>
        <label className="field"><span>{T("وصف مختصر للمشكلة", "Short description")}</span><input className="input" required minLength={2} maxLength={200} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder={T("مثال: تسريب مياه أسفل مغسلة المطبخ", "e.g. Leak under the kitchen sink")} /></label>
        <div className="mx-grid2">
          <label className="field"><span>{T("المبنى", "Building")}</span>
            <select className="select" value={f.building_id} onChange={(e) => { set("building_id", Number(e.target.value)); set("unit_id", ""); }}>{buildings.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
          <label className="field"><span>{T("الوحدة (اختياري)", "Unit (optional)")}</span>
            <select className="select" value={f.unit_id} onChange={(e) => set("unit_id", e.target.value)}><option value="">{T("المناطق المشتركة / المبنى", "Common areas / building")}</option>{units.filter((u) => u.building_id === Number(f.building_id)).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
          </label>
          <label className="field"><span>{T("التصنيف", "Category")}</span>
            <select className="select" value={f.category} onChange={(e) => set("category", e.target.value)}>{Object.entries(L.category).map(([k, v]) => <option key={k} value={k}>{v[ar ? 0 : 1]}</option>)}</select>
          </label>
          <label className="field"><span>{T("الأولوية", "Priority")}</span>
            <select className="select" value={f.priority} onChange={(e) => set("priority", e.target.value)}>
              <option value="emergency">{T("طارئ — خلال 4 ساعات", "Emergency — 4 hours")}</option>
              <option value="high">{T("عالية — خلال 24 ساعة", "High — 24 hours")}</option>
              <option value="normal">{T("عادية — خلال 3 أيام", "Normal — 3 days")}</option>
              <option value="low">{T("منخفضة — خلال 7 أيام", "Low — 7 days")}</option>
            </select>
          </label>
        </div>
        <label className="field"><span>{T("التفاصيل", "Details")}</span><textarea className="textarea" rows={3} maxLength={5000} value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
        <div className="mx-grid2">
          <label className="field"><span>{T("مصدر البلاغ", "Reported by")}</span>
            <select className="select" value={f.reported_by} onChange={(e) => set("reported_by", e.target.value)}>
              <option value="tenant">{T("المستأجر", "Tenant")}</option><option value="owner">{T("المالك", "Owner")}</option><option value="staff">{T("الموظف", "Staff")}</option><option value="inspection">{T("جولة تفقدية", "Inspection")}</option>
            </select>
          </label>
          <label className="field"><span>{T("اسم المبلّغ", "Reporter name")}</span><input className="input" maxLength={120} value={f.reporter_name} onChange={(e) => set("reporter_name", e.target.value)} /></label>
          <label className="field"><span>{T("جوال المبلّغ", "Reporter phone")}</span><input className="input" dir="ltr" maxLength={30} value={f.reporter_phone} onChange={(e) => set("reporter_phone", e.target.value)} /></label>
          <label className="field"><span>{T("الموظف المسؤول", "Assign to")}</span>
            <select className="select" value={f.assignee_id} onChange={(e) => set("assignee_id", e.target.value)}>
              <option value="">{responsible ? T(`المسؤول عن المبنى (${responsible})`, `Building's employee (${responsible})`) : T("بدون إسناد الآن", "Leave unassigned")}</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="field"><span>{T("المقاول / الفني (اختياري)", "Vendor / technician (optional)")}</span><input className="input" maxLength={160} value={f.vendor_name} onChange={(e) => set("vendor_name", e.target.value)} /></label>
        </div>
        {err && <p className="mx-err">{err}</p>}
      </form>
    </Modal>
  );
}

function DetailDrawer({ id, locale, users, can, onClose, lbl, dtf, nf }: {
  id: number; locale: string; users: Opt[]; can: Props["can"]; onClose: () => void;
  lbl: <K extends keyof typeof L>(k: K, v: string) => string; dtf: Intl.DateTimeFormat; nf: Intl.NumberFormat;
}) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [w, setW] = useState<WorkOrder | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [panel, setPanel] = useState<null | "assign" | "estimate" | "decide" | "complete" | "cancel">(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  useEffect(() => {
    woGet(id, locale).then((r) => (r.ok ? setW(r.data as WorkOrder) : setErr(r.error)));
  }, [id, locale]);

  function run(p: Promise<{ ok: boolean; data?: unknown; error?: string }>) {
    setErr(null);
    start(async () => {
      const r = await p;
      if (!r.ok) return setErr(r.error ?? "Error");
      setW(r.data as WorkOrder);
      setPanel(null);
      setForm({});
    });
  }
  const v = (k: string) => form[k] ?? "";
  const setV = (k: string, val: string) => setForm((x) => ({ ...x, [k]: val }));

  if (!w) return <Modal open onClose={onClose} title="…">{err ? <p className="mx-err">{err}</p> : <p className="text-sec">{T("جارٍ التحميل…", "Loading…")}</p>}</Modal>;
  const st = w.status;

  return (
    <Modal open onClose={onClose} size="lg" title={`${w.number} — ${w.title}`} subtitle={`${w.building}${w.unit ? ` · ${T("وحدة", "Unit")} ${w.unit}` : ""}${w.owner ? ` · ${T("المالك", "Owner")}: ${w.owner}` : ""}`}>
      <div className="mx-detail">
        <div className="mx-chips">
          <span className={`mx-status mx-status--${st}`}>{lbl("status", st)}</span>
          <span className={`mx-prio mx-prio--${w.priority}`}>{lbl("priority", w.priority)}</span>
          <span className="mx-chip">{lbl("category", w.category)}</span>
          {w.sla !== "done" && w.sla !== "none" && <span className={`mx-sla mx-sla--${w.sla}`}>{lbl("sla", w.sla)}{w.due_at ? ` · ${dtf.format(new Date(w.due_at + "Z"))}` : ""}</span>}
        </div>

        {/* Workflow steps */}
        <ol className="mx-steps" aria-label={T("مراحل الطلب", "Workflow")}>
          {(["new", "assigned", "awaiting_approval", "in_progress", "completed", "closed"] as const).map((s) => {
            const order = ["new", "assigned", "awaiting_approval", "approved", "in_progress", "completed", "closed"];
            const cur = order.indexOf(st === "rejected" ? "awaiting_approval" : st);
            const idx = order.indexOf(s);
            const doneStep = cur > idx || (s === "awaiting_approval" && ["approved", "in_progress", "completed", "closed"].includes(st));
            return <li key={s} className={doneStep ? "is-done" : cur === idx || (s === "awaiting_approval" && st === "approved") ? "is-current" : ""}>{lbl("status", s)}</li>;
          })}
        </ol>

        <dl className="mx-facts">
          <div><dt>{T("المسؤول", "Assignee")}</dt><dd>{w.assignee || "—"}</dd></div>
          <div><dt>{T("المقاول", "Vendor")}</dt><dd>{w.vendor_name ? `${w.vendor_name}${w.vendor_phone ? ` · ${w.vendor_phone}` : ""}` : "—"}</dd></div>
          <div><dt>{T("التكلفة التقديرية", "Estimate")}</dt><dd>{w.estimate_amount != null ? `${nf.format(w.estimate_amount)} ${T("ر.س", "SAR")} · ${lbl("charge", w.charge_to)}` : "—"}</dd></div>
          <div><dt>{T("الحد المفوَّض", "Pre-authorised limit")}</dt><dd>{w.approval_limit != null ? `${nf.format(w.approval_limit)} ${T("ر.س", "SAR")}` : "—"}</dd></div>
          <div><dt>{T("التكلفة الفعلية", "Actual cost")}</dt><dd>{w.actual_cost != null ? `${nf.format(w.actual_cost)} ${T("ر.س", "SAR")}${w.expense_id ? ` · ${T("مسجّلة كمصروف", "posted as expense")}` : ""}` : "—"}</dd></div>
          <div><dt>{T("المبلّغ", "Reported by")}</dt><dd>{[w.reporter_name, w.reporter_phone].filter(Boolean).join(" · ") || "—"}</dd></div>
          {w.approved_by && <div><dt>{T("القرار", "Decision")}</dt><dd>{w.approved_by === "auto" ? T("اعتماد تلقائي ضمن الحد", "Auto-approved within limit") : `${w.approved_by}${w.decision_note ? ` — ${w.decision_note}` : ""}`}</dd></div>}
        </dl>
        {w.description && <p className="mx-desc">{w.description}</p>}
        {w.resolution && <p className="mx-desc"><strong>{T("ما تم إنجازه:", "Resolution:")}</strong> {w.resolution}</p>}

        {/* Actions */}
        {can.edit && !["closed", "cancelled"].includes(st) && (
          <div className="mx-actions">
            {["new", "assigned", "approved", "awaiting_approval"].includes(st) && <button className="btn btn-secondary btn-sm" onClick={() => setPanel("assign")}><span className="ms ms-sm">person_add</span>{T("إسناد", "Assign")}</button>}
            {["new", "assigned", "approved", "rejected", "awaiting_approval"].includes(st) && <button className="btn btn-secondary btn-sm" onClick={() => setPanel("estimate")}><span className="ms ms-sm">request_quote</span>{T("تقدير التكلفة", "Add estimate")}</button>}
            {st === "awaiting_approval" && can.approve && <button className="btn btn-primary btn-sm" onClick={() => setPanel("decide")}><span className="ms ms-sm">gavel</span>{T("اعتماد / رفض", "Approve / reject")}</button>}
            {["new", "assigned", "approved"].includes(st) && <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(woStart(w.id))}><span className="ms ms-sm">play_arrow</span>{T("بدء التنفيذ", "Start work")}</button>}
            {["in_progress", "approved", "assigned"].includes(st) && <button className="btn btn-primary btn-sm" onClick={() => setPanel("complete")}><span className="ms ms-sm">task_alt</span>{T("تسجيل الإنجاز", "Mark completed")}</button>}
            {st === "completed" && <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(woClose(w.id, Number(v("rating")) || undefined))}><span className="ms ms-sm">lock</span>{T("إغلاق الطلب", "Close")}</button>}
            {can.delete && <button className="btn btn-ghost btn-sm mx-danger" onClick={() => setPanel("cancel")}>{T("إلغاء الطلب", "Cancel job")}</button>}
          </div>
        )}

        {panel === "assign" && (
          <div className="mx-panel">
            <label className="field"><span>{T("الموظف", "Employee")}</span><select className="select" value={v("assignee_id") || String(w.assignee_id ?? "")} onChange={(e) => setV("assignee_id", e.target.value)}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
            <label className="field"><span>{T("المقاول", "Vendor")}</span><input className="input" value={v("vendor_name") || w.vendor_name || ""} onChange={(e) => setV("vendor_name", e.target.value)} /></label>
            <label className="field"><span>{T("جوال المقاول", "Vendor phone")}</span><input className="input" dir="ltr" value={v("vendor_phone") || w.vendor_phone || ""} onChange={(e) => setV("vendor_phone", e.target.value)} /></label>
            <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(woAssign(w.id, { assignee_id: Number(v("assignee_id") || w.assignee_id) || null, vendor_name: (v("vendor_name") || w.vendor_name) || null, vendor_phone: (v("vendor_phone") || w.vendor_phone) || null }))}>{T("حفظ الإسناد", "Save")}</button>
          </div>
        )}
        {panel === "estimate" && (
          <div className="mx-panel">
            <label className="field"><span>{T("التكلفة التقديرية (ر.س)", "Estimated cost (SAR)")}</span><input className="input" type="number" min={0} dir="ltr" value={v("amount")} onChange={(e) => setV("amount", e.target.value)} /></label>
            <label className="field"><span>{T("على حساب", "Charged to")}</span><select className="select" value={v("charge_to") || "owner"} onChange={(e) => setV("charge_to", e.target.value)}><option value="owner">{T("المالك", "Owner")}</option><option value="tenant">{T("المستأجر", "Tenant")}</option><option value="company">{T("الشركة", "Company")}</option></select></label>
            <label className="field"><span>{T("ملاحظة", "Note")}</span><input className="input" value={v("note")} onChange={(e) => setV("note", e.target.value)} /></label>
            <p className="text-sec mx-hint">{T("إذا تجاوزت التكلفة الحد المفوَّض في عقد إدارة المالك، يُرسل الطلب للمالك للموافقة قبل البدء.", "If the cost is above the owner's pre-authorised limit, the job goes to the owner for approval before work starts.")}</p>
            <button className="btn btn-primary btn-sm" disabled={pending || !v("amount")} onClick={() => run(woEstimate(w.id, Number(v("amount")), v("charge_to") || "owner", v("note") || undefined))}>{T("حفظ التقدير", "Save estimate")}</button>
          </div>
        )}
        {panel === "decide" && (
          <div className="mx-panel">
            <label className="field"><span>{T("ملاحظة القرار", "Decision note")}</span><input className="input" value={v("note")} onChange={(e) => setV("note", e.target.value)} /></label>
            <div className="mx-row"><button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(woDecision(w.id, true, v("note") || undefined))}>{T("اعتماد", "Approve")}</button><button className="btn btn-danger btn-sm" disabled={pending} onClick={() => run(woDecision(w.id, false, v("note") || undefined))}>{T("رفض", "Reject")}</button></div>
          </div>
        )}
        {panel === "complete" && (
          <div className="mx-panel">
            <label className="field"><span>{T("التكلفة الفعلية (ر.س)", "Actual cost (SAR)")}</span><input className="input" type="number" min={0} dir="ltr" value={v("cost")} onChange={(e) => setV("cost", e.target.value)} /></label>
            <label className="field"><span>{T("ما تم إنجازه", "What was done")}</span><textarea className="textarea" rows={2} value={v("resolution")} onChange={(e) => setV("resolution", e.target.value)} /></label>
            <label className="checkbox"><input type="checkbox" checked={v("post") !== "0"} onChange={(e) => setV("post", e.target.checked ? "1" : "0")} /> {T("تسجيل التكلفة كمصروف على المبنى (تظهر في كشف المالك)", "Post the cost as a building expense (appears on the owner's statement)")}</label>
            <button className="btn btn-primary btn-sm" disabled={pending || v("cost") === ""} onClick={() => run(woComplete(w.id, Number(v("cost")), v("resolution"), v("post") !== "0"))}>{T("تأكيد الإنجاز", "Confirm completion")}</button>
          </div>
        )}
        {panel === "cancel" && (
          <div className="mx-panel">
            <label className="field"><span>{T("سبب الإلغاء", "Reason")}</span><input className="input" value={v("reason")} onChange={(e) => setV("reason", e.target.value)} /></label>
            <button className="btn btn-danger btn-sm" disabled={pending || !v("reason")} onClick={() => run(woCancel(w.id, v("reason")))}>{T("إلغاء الطلب", "Cancel job")}</button>
          </div>
        )}
        {err && <p className="mx-err">{err}</p>}

        {/* Timeline */}
        <h4 className="mx-h">{T("سجل الطلب", "Activity")}</h4>
        <ol className="mx-timeline">
          {(w.events ?? []).slice().reverse().map((e, i) => (
            <li key={i}>
              <span className="mx-dot" aria-hidden />
              <div>
                <strong>{lbl("action", e.action)}</strong>
                {e.note && <span> — {e.note}</span>}
                <div className="text-sec" style={{ fontSize: 12 }}>{e.actor === "system" ? T("النظام", "System") : e.actor} · {dtf.format(new Date(e.at + "Z"))}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mx-row">
          <input className="input" placeholder={T("أضف ملاحظة للسجل…", "Add a note…")} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-secondary btn-sm" disabled={pending || !note.trim()} onClick={() => { run(woNote(w.id, note.trim())); setNote(""); }}>{T("إضافة", "Add")}</button>
        </div>
      </div>
    </Modal>
  );
}
