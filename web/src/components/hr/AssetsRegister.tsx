"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { FilterBar, FilterSearch, FilterSelect } from "@/components/EntityFilterBar";
import { Modal } from "@/components/Modal";
import { hrAssignAsset, hrCreateAsset, hrEditAsset, hrGetAsset, hrReturnAsset } from "@/lib/hr-people-actions";
import { HP, lb, type Asset, type Company } from "@/lib/hr-people";

export function AssetsRegister({ locale, assets, companies, people, canEdit }: { locale: string; assets: Asset[]; companies: Company[]; people: { id: number; name: string }[]; canEdit: boolean }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const nf = new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 });
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [st, setSt] = useState("all");
  const [comp, setComp] = useState("all");
  const [edit, setEdit] = useState<Asset | "new" | null>(null);
  const [open, setOpen] = useState<Asset | null>(null);
  const shown = useMemo(() => assets.filter((a) => (kind === "all" || a.kind === kind) && (st === "all" || a.status === st) && (comp === "all" || String(a.company_id) === comp) &&
    (!q.trim() || `${a.tag} ${a.name} ${a.brand_model ?? ""} ${a.serial ?? ""} ${a.assigned_to ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [assets, q, kind, st, comp]);
  const assigned = assets.filter((a) => a.status === "assigned");
  const cash = assigned.filter((a) => a.kind === "cash").reduce((s, a) => s + (a.value ?? 0), 0);
  const value = assigned.reduce((s, a) => s + (a.kind === "cash" ? 0 : a.value ?? 0), 0);
  const unacked = assigned.filter((a) => !a.acknowledged_at).length;

  return (
    <>
      <div className="mx-kpis">
        <Kpi icon="inventory_2" label={T("إجمالي العُهد", "Total assets")} value={nf.format(assets.length)} />
        <Kpi icon="assignment_ind" label={T("مسلّمة للموظفين", "With employees")} value={nf.format(assigned.length)} sub={T(`قيمتها ${nf.format(value)} ر.س`, `worth SAR ${nf.format(value)}`)} />
        <Kpi icon="payments" label={T("عُهد نقدية قائمة", "Cash custody outstanding")} value={`${nf.format(cash)} ${T("ر.س", "SAR")}`} />
        <Kpi icon="pending" label={T("لم يُؤكَّد استلامها", "Receipt not confirmed")} value={nf.format(unacked)} tone={unacked ? "warn" : "good"} />
      </div>
      <FilterBar search={<FilterSearch value={q} onChange={setQ} placeholder={T("بحث بالرقم أو الاسم أو الرقم التسلسلي أو الموظف…", "Search tag, name, serial or employee…")} />}>
        <FilterSelect label={T("النوع", "Type")} value={kind} onChange={setKind} options={[{ value: "all", label: T("الكل", "All") }, ...Object.keys(HP.akind).map((k) => ({ value: k, label: lb(ar, HP.akind, k) }))]} />
        <FilterSelect label={T("الحالة", "Status")} value={st} onChange={setSt} options={[{ value: "all", label: T("الكل", "All") }, ...Object.keys(HP.astatus).map((k) => ({ value: k, label: lb(ar, HP.astatus, k) }))]} />
        <FilterSelect label={T("الشركة", "Company")} value={comp} onChange={setComp} options={[{ value: "all", label: T("كل المجموعة", "Whole group") }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]} />
      </FilterBar>
      {canEdit && <div className="ef-actions" style={{ marginBottom: 12 }}><button className="btn btn-primary" onClick={() => setEdit("new")}><span className="ms">add</span>{T("إضافة عهدة", "Add asset")}</button></div>}
      {shown.length === 0 ? <div className="empty-state"><div className="empty-icon"><span className="ms">inventory_2</span></div><div className="empty-title">{assets.length ? T("لا عُهد مطابقة", "No matching assets") : T("لا توجد عُهد مسجلة بعد", "No assets yet")}</div><div className="empty-sub">{T("سجّل الأجهزة والسيارات والعُهد النقدية وسلّمها للموظفين ليؤكدوا استلامها.", "Register devices, cars and cash custody, then assign them so employees confirm receipt.")}</div></div> : (
        <div className="card card-tight"><div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>{T("العهدة", "Asset")}</th><th>{T("النوع", "Type")}</th><th>{T("الحالة", "Status")}</th><th>{T("لدى", "Held by")}</th><th>{T("القيمة", "Value")}</th><th>{T("الشركة", "Company")}</th></tr></thead>
          <tbody>{shown.map((a) => (
            <tr key={a.id} className="mx-row" tabIndex={0} onClick={() => setOpen(a)} onKeyDown={(e) => e.key === "Enter" && setOpen(a)}>
              <td><strong>{a.name}</strong><div className="text-sec" style={{ fontSize: 12 }}>{[a.tag, a.brand_model, a.serial && `#${a.serial}`].filter(Boolean).join(" · ")}</div></td>
              <td><span className="ms ms-sm" aria-hidden>{HP.aicon[a.kind]}</span> {lb(ar, HP.akind, a.kind)}</td>
              <td><span className={`mx-status ${a.status === "assigned" ? "mx-status--assigned" : a.status === "in_stock" ? "mx-status--completed" : a.status === "lost" ? "mx-status--rejected" : "mx-status--awaiting_approval"}`}>{lb(ar, HP.astatus, a.status)}</span></td>
              <td>{a.assigned_to ?? "—"}{a.assigned_to && <div className="text-sec" style={{ fontSize: 12 }}>{a.acknowledged_at ? T("أكّد الاستلام", "Receipt confirmed") : T("بانتظار التأكيد", "Not confirmed")}</div>}</td>
              <td>{a.value != null ? `${nf.format(a.value)} ${T("ر.س", "SAR")}` : "—"}</td>
              <td>{a.company ?? "—"}</td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}
      {edit && <AssetModal ar={ar} a={edit === "new" ? null : edit} companies={companies} onClose={() => setEdit(null)} />}
      {open && <AssetDrawer ar={ar} locale={locale} a={open} people={people} canEdit={canEdit} onEdit={() => { setEdit(open); setOpen(null); }} onClose={() => setOpen(null)} />}
    </>
  );
}

function Kpi({ icon, label, value, sub, tone = "neutral" }: { icon: string; label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  return <div className={`mx-kpi is-${tone}`}><span className="ms mx-kpi__ico" aria-hidden>{icon}</span><span className="mx-kpi__label">{label}</span><strong className="mx-kpi__value">{value}</strong>{sub && <span className="mx-kpi__sub">{sub}</span>}</div>;
}

function useSave() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (p: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, then?: (d: unknown) => void) => start(async () => {
    setErr(null);
    const r = await p();
    if (!r.ok) return setErr(r.error ?? "Error");
    then?.(r.data);
    router.refresh();
  });
  return { err, pending, save };
}

function AssetModal({ ar, a, companies, onClose }: { ar: boolean; a: Asset | null; companies: Company[]; onClose: () => void }) {
  const T = (x: string, e: string) => (ar ? x : e);
  const [f, setF] = useState({ kind: a?.kind ?? "laptop", name: a?.name ?? "", brand_model: a?.brand_model ?? "", serial: a?.serial ?? "", value: a?.value != null ? String(a.value) : "",
    purchase_date: a?.purchase_date ?? "", warranty_end: a?.warranty_end ?? "", condition: a?.condition ?? "good", notes: a?.notes ?? "",
    company_id: String(a?.company_id ?? companies.find((c) => c.is_holding)?.id ?? ""), status: a && a.status !== "assigned" ? a.status : "" });
  const { err, pending, save } = useSave();
  const set = (k: keyof typeof f, v: string) => setF((o) => ({ ...o, [k]: v }));
  const serialLabel = f.kind === "car" ? T("رقم اللوحة", "Plate number") : f.kind === "phone" || f.kind === "tablet" ? T("الرقم التسلسلي / IMEI", "Serial / IMEI") : f.kind === "card" ? T("آخر 4 أرقام", "Last 4 digits") : f.kind === "sim" ? T("رقم الشريحة", "SIM number") : T("الرقم التسلسلي", "Serial number");
  return (
    <Modal open onClose={onClose} title={a ? T(`تعديل ${a.tag}`, `Edit ${a.tag}`) : T("عهدة جديدة", "New asset")}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" disabled={pending || f.name.trim().length < 2} onClick={() => save(() => {
        const b = { kind: f.kind, name: f.name, brand_model: f.brand_model || null, serial: f.serial || null, value: f.value ? Number(f.value) : null, purchase_date: f.purchase_date || null,
          warranty_end: f.warranty_end || null, condition: f.condition, notes: f.notes || null, company_id: f.company_id ? Number(f.company_id) : null, status: f.status || null };
        return a ? hrEditAsset(a.id, b) : hrCreateAsset(b);
      }, onClose)}>{T("حفظ", "Save")}</button></>}>
      <div className="mx-grid2">
        <label className="field"><span>{T("النوع", "Type")}</span><select className="select" value={f.kind} onChange={(e) => set("kind", e.target.value)}>{Object.keys(HP.akind).map((k) => <option key={k} value={k}>{lb(ar, HP.akind, k)}</option>)}</select></label>
        <label className="field"><span>{T("الشركة المالكة", "Owning company")}</span><select className="select" value={f.company_id} onChange={(e) => set("company_id", e.target.value)}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field"><span>{f.kind === "cash" ? T("الغرض", "Purpose") : T("الاسم / الوصف", "Name / description")}</span><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={f.kind === "cash" ? T("مثال: عهدة مصروفات الصيانة", "e.g. Maintenance petty cash") : ""} /></label>
        {f.kind !== "cash" && <label className="field"><span>{T("الماركة / الموديل", "Brand / model")}</span><input className="input" value={f.brand_model} onChange={(e) => set("brand_model", e.target.value)} /></label>}
        {f.kind !== "cash" && <label className="field"><span>{serialLabel}</span><input className="input" dir="ltr" value={f.serial} onChange={(e) => set("serial", e.target.value)} /></label>}
        <label className="field"><span>{f.kind === "cash" ? T("المبلغ (ر.س)", "Amount (SAR)") : T("القيمة (ر.س)", "Value (SAR)")}</span><input className="input" type="number" min={0} dir="ltr" value={f.value} onChange={(e) => set("value", e.target.value)} /></label>
        {f.kind !== "cash" && <label className="field"><span>{T("تاريخ الشراء", "Purchase date")}</span><input className="input" type="date" value={f.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} /></label>}
        {f.kind !== "cash" && <label className="field"><span>{T("نهاية الضمان", "Warranty ends")}</span><input className="input" type="date" value={f.warranty_end} onChange={(e) => set("warranty_end", e.target.value)} /></label>}
        <label className="field"><span>{T("الحالة الفنية", "Condition")}</span><select className="select" value={f.condition} onChange={(e) => set("condition", e.target.value)}>{Object.keys(HP.cond).map((k) => <option key={k} value={k}>{lb(ar, HP.cond, k)}</option>)}</select></label>
        {a && a.status !== "assigned" && <label className="field"><span>{T("حالة العهدة", "Status")}</span><select className="select" value={f.status} onChange={(e) => set("status", e.target.value)}>{["in_stock", "maintenance", "lost", "retired"].map((k) => <option key={k} value={k}>{lb(ar, HP.astatus, k)}</option>)}</select></label>}
      </div>
      <label className="field" style={{ marginTop: 12 }}><span>{T("ملاحظات", "Notes")}</span><textarea className="textarea" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      {err && <p className="mx-err">{err}</p>}
    </Modal>
  );
}

function AssetDrawer({ ar, locale, a: initial, people, canEdit, onEdit, onClose }: { ar: boolean; locale: string; a: Asset; people: { id: number; name: string }[]; canEdit: boolean; onEdit: () => void; onClose: () => void }) {
  const T = (x: string, e: string) => (ar ? x : e);
  const [a, setA] = useState<Asset>(initial);
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");
  const [cond, setCond] = useState("good");
  const { err, pending, save } = useSave();
  useEffect(() => { hrGetAsset(initial.id, locale).then((r) => r.ok && setA(r.data as Asset)); }, [initial.id, locale]);
  const refresh = () => hrGetAsset(a.id, locale).then((r) => r.ok && setA(r.data as Asset));
  return (
    <Modal open onClose={onClose} size="lg" title={`${a.tag} — ${a.name}`} subtitle={[lb(ar, HP.akind, a.kind), a.brand_model, a.company].filter(Boolean).join(" · ")}>
      <div className="mx-detail">
        <dl className="mx-facts">
          <div><dt>{T("الحالة", "Status")}</dt><dd>{lb(ar, HP.astatus, a.status)}</dd></div>
          <div><dt>{T("لدى", "Held by")}</dt><dd>{a.assigned_to ? <Link href={`/${locale}/hr/people/${a.assigned_user_id}?tab=assets`}>{a.assigned_to}</Link> : "—"}{a.assigned_at ? ` · ${a.assigned_at}` : ""}</dd></div>
          <div><dt>{T("تأكيد الاستلام", "Receipt confirmed")}</dt><dd>{a.acknowledged_at ? a.acknowledged_at.slice(0, 16).replace("T", " ") : "—"}</dd></div>
          <div><dt>{T("الرقم التسلسلي", "Serial")}</dt><dd dir="ltr">{a.serial ?? "—"}</dd></div>
          <div><dt>{T("القيمة", "Value")}</dt><dd>{a.value ?? "—"}</dd></div>
          <div><dt>{T("الحالة الفنية", "Condition")}</dt><dd>{lb(ar, HP.cond, a.condition)}</dd></div>
          <div><dt>{T("الضمان حتى", "Warranty until")}</dt><dd>{a.warranty_end ?? "—"}</dd></div>
        </dl>
        {a.notes && <p className="mx-desc">{a.notes}</p>}
        {canEdit && (
          a.assigned_user_id ? (
            <div className="mx-panel">
              <label className="field"><span>{T("الحالة عند الإرجاع", "Condition on return")}</span><select className="select" value={cond} onChange={(e) => setCond(e.target.value)}>{Object.keys(HP.cond).map((k) => <option key={k} value={k}>{lb(ar, HP.cond, k)}</option>)}</select></label>
              <label className="field"><span>{T("ملاحظة", "Note")}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={a.kind === "cash" ? T("مثال: سُوّيت بفواتير بقيمة…", "e.g. Settled with receipts worth…") : ""} /></label>
              <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => save(() => hrReturnAsset(a.id, { condition: cond, note: note || null }), () => { setNote(""); refresh(); })}>{a.kind === "cash" ? T("تسوية العهدة", "Settle custody") : T("تسجيل الإرجاع", "Record return")}</button>
            </div>
          ) : !["lost", "retired"].includes(a.status) ? (
            <div className="mx-panel">
              <label className="field"><span>{T("تسليم إلى", "Assign to")}</span><select className="select" value={who} onChange={(e) => setWho(e.target.value)}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <label className="field"><span>{T("ملاحظة", "Note")}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <button className="btn btn-primary btn-sm" disabled={pending || !who} onClick={() => save(() => hrAssignAsset(a.id, { user_id: Number(who), note: note || null }), () => { setNote(""); refresh(); })}>{T("تسليم", "Assign")}</button>
            </div>
          ) : null
        )}
        {canEdit && <div><button className="btn btn-ghost btn-sm" onClick={onEdit}>{T("تعديل البيانات", "Edit details")}</button></div>}
        {err && <p className="mx-err">{err}</p>}
        <h4 className="mx-h">{T("السجل", "History")}</h4>
        <ol className="mx-timeline">
          {(a.events ?? []).map((e, i) => (
            <li key={i}><span className="mx-dot" aria-hidden /><div>
              <strong>{({ created: T("أُضيفت", "Added"), assigned: T("سُلّمت", "Assigned"), acknowledged: T("أُكّد الاستلام", "Receipt confirmed"), returned: T("أُرجعت", "Returned"), status: T("تغيّرت الحالة", "Status changed"), edited: T("عُدّلت", "Edited") } as Record<string, string>)[e.action] ?? e.action}</strong>
              {e.user && <span> — {e.user}</span>}{e.note && <span> — {e.note}</span>}
              <div className="text-sec" style={{ fontSize: 12 }}>{e.actor} · {e.at.slice(0, 16).replace("T", " ")}</div>
            </div></li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}
