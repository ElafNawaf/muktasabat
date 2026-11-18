"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { bulkDelete, type BulkEntity, type BulkResult } from "@/lib/actions";
import type { Selection } from "@/lib/use-selection";

const T = (ar: boolean, a: string, e: string) => (ar ? a : e);

/** Header checkbox: select / clear every row currently shown. */
export function SelHead({ sel, locale }: { sel: Selection; locale: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = sel.some; }, [sel.some]);
  return (
    <th className="sel-col" data-no-row>
      <input ref={ref} type="checkbox" className="sel-box" checked={sel.all} onChange={sel.toggleAll} disabled={sel.total === 0}
        aria-label={T(locale === "ar", "تحديد الكل", "Select all")} />
    </th>
  );
}

/** Row checkbox (clicking it never opens the row). */
export function SelCell({ sel, id, label, locale }: { sel: Selection; id: number; label?: string; locale: string }) {
  return (
    <td className="sel-col" data-no-row onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" className="sel-box" checked={sel.has(id)} onChange={() => sel.toggle(id)}
        aria-label={`${T(locale === "ar", "تحديد", "Select")} ${label ?? id}`} />
    </td>
  );
}

/** Appears when rows are selected: count, select all, export selected, delete selected. */
export function BulkBar({ sel, locale, entity, canDelete, onExport, nameOf, noun }: {
  sel: Selection; locale: string; entity: BulkEntity; canDelete: boolean;
  onExport?: (ids: number[]) => void; nameOf?: (id: number) => string; noun: [string, string];
}) {
  const ar = locale === "ar";
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (sel.count === 0 && !result) return null;
  const run = () => start(async () => {
    setErr(null);
    const r = await bulkDelete(entity, sel.ids, locale);
    if (!r.ok) return setErr(r.error);
    setResult(r.data);
    setConfirm(false);
    sel.clear();
  });
  return (
    <>
      {sel.count > 0 && (
        <div className="bulk-bar" role="region" aria-label={T(ar, "إجراءات على المحدد", "Actions on selected rows")}>
          <span className="bulk-bar__n"><b>{sel.count}</b> {T(ar, `${noun[0]} محدد`, `${noun[1]} selected`)}</span>
          {!sel.all && <button className="btn btn-ghost btn-sm" onClick={sel.toggleAll}>{T(ar, `تحديد الكل (${sel.total})`, `Select all ${sel.total}`)}</button>}
          <span className="bulk-bar__sp" />
          {onExport && <button className="btn btn-secondary btn-sm" onClick={() => onExport(sel.ids)}><span className="ms ms-sm">file_download</span>{T(ar, "تصدير المحدد", "Export selected")}</button>}
          {canDelete && <button className="btn btn-sm bulk-bar__del" onClick={() => { setErr(null); setConfirm(true); }}><span className="ms ms-sm">delete</span>{T(ar, "حذف المحدد", "Delete selected")}</button>}
          <button className="btn btn-ghost btn-sm" onClick={sel.clear}>{T(ar, "إلغاء التحديد", "Clear")}</button>
        </div>
      )}
      {result && (
        <div className={`bulk-result ${result.failed.length ? "is-warn" : "is-ok"}`} role="status">
          <span className="ms ms-sm" aria-hidden>{result.failed.length ? "info" : "task_alt"}</span>
          <div>
            <b>{T(ar, `حُذف ${result.deleted.length}`, `Deleted ${result.deleted.length}`)}{result.failed.length > 0 && T(ar, ` · تعذّر حذف ${result.failed.length}`, ` · ${result.failed.length} couldn't be deleted`)}</b>
            {result.failed.length > 0 && <ul>{result.failed.slice(0, 8).map((f) => <li key={f.id}><bdi>{nameOf?.(f.id) ?? `#${f.id}`}</bdi>: {f.error}</li>)}{result.failed.length > 8 && <li>…</li>}</ul>}
          </div>
          <button className="icon-btn" aria-label={T(ar, "إغلاق", "Dismiss")} onClick={() => setResult(null)}><span className="ms ms-sm">close</span></button>
        </div>
      )}
      {confirm && (
        <Modal open size="sm" onClose={() => setConfirm(false)} title={T(ar, `حذف ${sel.count} ${noun[0]}؟`, `Delete ${sel.count} ${noun[1]}?`)}
          footer={<><button className="btn btn-secondary" onClick={() => setConfirm(false)}>{T(ar, "إلغاء", "Cancel")}</button>
            <button className="btn btn-primary bulk-bar__del" disabled={pending} onClick={run}>{pending ? T(ar, "جارٍ الحذف…", "Deleting…") : T(ar, `حذف ${sel.count}`, `Delete ${sel.count}`)}</button></>}>
          <p>{T(ar, "لا يمكن التراجع عن الحذف. السجلات المرتبطة بعقود أو دفعات مسددة لن تُحذف، وستظهر لك بالسبب.", "This can't be undone. Records linked to leases or paid instalments are skipped and listed with the reason.")}</p>
          {nameOf && <ul className="bulk-names">{sel.ids.slice(0, 10).map((id) => <li key={id}><bdi>{nameOf(id)}</bdi></li>)}{sel.count > 10 && <li>{T(ar, `و${sel.count - 10} غيرها`, `and ${sel.count - 10} more`)}</li>}</ul>}
          {err && <p className="mx-err">{err}</p>}
        </Modal>
      )}
    </>
  );
}
