"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { cmsDeleteApplication, cmsDeleteLead, cmsUpdateApplication, cmsUpdateLead } from "@/lib/cms-actions";

import { tx } from "./fields";

type Lead = { id: number; kind: string; name: string; phone?: string | null; email?: string | null; city?: string | null; message?: string | null; source_page?: string | null; locale?: string | null; status: string; notes?: string | null; created_at: string };
type App = { id: number; job_title_en?: string | null; job_title_ar?: string | null; name: string; email: string; phone?: string | null; linkedin?: string | null; cover_letter?: string | null; cv_filename?: string | null; has_cv: boolean; status: string; notes?: string | null; created_at: string };

const LEAD_STATUS: Record<string, [string, string]> = {
  new: ["New", "جديد"], contacted: ["Contacted", "تم التواصل"], qualified: ["Qualified", "مؤهل"], won: ["Won", "تم الاتفاق"], lost: ["Lost", "لم يتم"], spam: ["Spam", "مزعج"],
};
const APP_STATUS: Record<string, [string, string]> = {
  new: ["New", "جديد"], reviewing: ["Reviewing", "قيد المراجعة"], interview: ["Interview", "مقابلة"], offer: ["Offer", "عرض"], hired: ["Hired", "تم التعيين"], rejected: ["Rejected", "مرفوض"],
};
const LEAD_KIND: Record<string, [string, string]> = {
  owner: ["Owner", "مالك"], investor: ["Investor", "مستثمر"], tenant: ["Tenant", "مستأجر"], partner: ["Partner", "شريك"], buyer: ["Buyer", "مشترٍ"], valuation: ["Rent estimate", "تقدير إيجار"], viewing: ["Viewing request", "طلب معاينة"], general: ["General", "عام"],
};

function fmt(locale: string, iso: string) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso + (iso.endsWith("Z") ? "" : "Z")));
}

function useInbox<T extends { id: number; status: string; notes?: string | null }>(
  update: (id: number, status: string, notes: string | null) => Promise<{ ok: boolean; error?: string }>,
  remove: (id: number) => Promise<{ ok: boolean; error?: string }>,
) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Error");
      router.refresh();
    });
  return {
    pending,
    error,
    setStatus: (row: T, status: string) => run(() => update(row.id, status, row.notes ?? null)),
    saveNotes: (row: T, notes: string) => run(() => update(row.id, row.status, notes || null)),
    remove: (row: T, confirmText: string) => {
      if (window.confirm(confirmText)) run(() => remove(row.id));
    },
  };
}

function Filter({ statuses, value, onChange, counts, locale }: { statuses: Record<string, [string, string]>; value: string; onChange: (v: string) => void; counts: Record<string, number>; locale: string }) {
  return (
    <div className="cms-tabs cms-tabs--sub" role="tablist">
      {["all", ...Object.keys(statuses)].map((k) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? "is-on" : undefined} onClick={() => onChange(k)}>
          {k === "all" ? tx(locale, ["All", "الكل"]) : tx(locale, statuses[k])}
          {counts[k] ? <span className="cms-count">{counts[k]}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function LeadsInbox({ rows, locale, canEdit, canDelete }: { rows: Lead[]; locale: string; canEdit: boolean; canDelete: boolean }) {
  const [filter, setFilter] = useState("new");
  const [open, setOpen] = useState<number | null>(null);
  const ib = useInbox<Lead>(cmsUpdateLead, cmsDeleteLead);
  const counts = useMemo(() => rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), (a.all = (a.all ?? 0) + 1), a), {}), [rows]);
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="cms-panel">
      <div className="cms-toolbar">
        <Filter statuses={LEAD_STATUS} value={filter} onChange={setFilter} counts={counts} locale={locale} />
        <a className="cms-btn" href={`/api/cms/leads-csv?locale=${locale}`}><span className="ms">table_view</span>{tx(locale, ["Export Excel", "تصدير Excel"])}</a>
      </div>
      {ib.error && <p className="cms-err">{ib.error}</p>}
      {shown.length === 0 ? (
        <div className="cms-empty"><span className="ms">inbox</span><p>{tx(locale, ["No enquiries in this view.", "لا توجد استفسارات هنا."])}</p></div>
      ) : (
        <ul className="cms-list">
          {shown.map((r) => (
            <li key={r.id} className={`cms-inbox${open === r.id ? " is-open" : ""}`}>
              <button className="cms-inbox__head" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                <span className={`cms-dot cms-dot--${r.status}`} />
                <strong>{r.name}</strong>
                <span className="cms-tag">{tx(locale, LEAD_KIND[r.kind] ?? [r.kind, r.kind])}</span>
                <small className="cms-inbox__msg">{r.message}</small>
                <small className="cms-inbox__date">{fmt(locale, r.created_at)}</small>
              </button>
              {open === r.id && (
                <div className="cms-inbox__body">
                  <dl className="cms-dl">
                    {r.phone && (<><dt>{tx(locale, ["Phone", "الجوال"])}</dt><dd><a href={`tel:${r.phone}`} dir="ltr">{r.phone}</a> · <a href={`https://wa.me/${r.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a></dd></>)}
                    {r.email && (<><dt>{tx(locale, ["Email", "البريد"])}</dt><dd><a href={`mailto:${r.email}`}>{r.email}</a></dd></>)}
                    {r.city && (<><dt>{tx(locale, ["City", "المدينة"])}</dt><dd>{r.city}</dd></>)}
                    {r.source_page && (<><dt>{tx(locale, ["Page", "الصفحة"])}</dt><dd dir="ltr">{r.source_page}</dd></>)}
                  </dl>
                  {r.message && <p className="cms-msg">{r.message}</p>}
                  <div className="cms-inbox__controls">
                    <label className="cms-field cms-field--short">
                      <span className="cms-label">{tx(locale, ["Status", "الحالة"])}</span>
                      <select value={r.status} disabled={!canEdit || ib.pending} onChange={(e) => ib.setStatus(r, e.target.value)}>
                        {Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{tx(locale, v)}</option>)}
                      </select>
                    </label>
                    <NotesBox initial={r.notes ?? ""} disabled={!canEdit || ib.pending} onSave={(n) => ib.saveNotes(r, n)} locale={locale} />
                    {canDelete && (
                      <button className="cms-btn cms-btn--danger" onClick={() => ib.remove(r, tx(locale, ["Delete this enquiry permanently?", "حذف هذا الاستفسار نهائياً؟"]))}>
                        <span className="ms">delete</span>{tx(locale, ["Delete", "حذف"])}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ApplicationsInbox({ rows, locale, canEdit, canDelete }: { rows: App[]; locale: string; canEdit: boolean; canDelete: boolean }) {
  const [filter, setFilter] = useState("new");
  const [open, setOpen] = useState<number | null>(null);
  const ib = useInbox<App>(cmsUpdateApplication, cmsDeleteApplication);
  const counts = useMemo(() => rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {}), [rows]);
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="cms-panel">
      <div className="cms-toolbar">
        <Filter statuses={APP_STATUS} value={filter} onChange={setFilter} counts={counts} locale={locale} />
      </div>
      {ib.error && <p className="cms-err">{ib.error}</p>}
      {shown.length === 0 ? (
        <div className="cms-empty"><span className="ms">badge</span><p>{tx(locale, ["No applications in this view.", "لا توجد طلبات هنا."])}</p></div>
      ) : (
        <ul className="cms-list">
          {shown.map((r) => (
            <li key={r.id} className={`cms-inbox${open === r.id ? " is-open" : ""}`}>
              <button className="cms-inbox__head" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                <span className={`cms-dot cms-dot--${r.status}`} />
                <strong>{r.name}</strong>
                <span className="cms-tag">{(locale === "ar" ? r.job_title_ar : r.job_title_en) ?? "—"}</span>
                <small className="cms-inbox__msg" />
                <small className="cms-inbox__date">{fmt(locale, r.created_at)}</small>
              </button>
              {open === r.id && (
                <div className="cms-inbox__body">
                  <dl className="cms-dl">
                    <dt>{tx(locale, ["Email", "البريد"])}</dt><dd><a href={`mailto:${r.email}`}>{r.email}</a></dd>
                    {r.phone && (<><dt>{tx(locale, ["Phone", "الجوال"])}</dt><dd dir="ltr">{r.phone}</dd></>)}
                    {r.linkedin && (<><dt>LinkedIn</dt><dd><a href={r.linkedin} target="_blank" rel="noopener noreferrer">{r.linkedin}</a></dd></>)}
                    {r.has_cv && (<><dt>{tx(locale, ["CV", "السيرة الذاتية"])}</dt><dd><a href={`/api/cms/cv/${r.id}`}>{r.cv_filename ?? "CV"}</a></dd></>)}
                  </dl>
                  {r.cover_letter && <p className="cms-msg">{r.cover_letter}</p>}
                  <div className="cms-inbox__controls">
                    <label className="cms-field cms-field--short">
                      <span className="cms-label">{tx(locale, ["Status", "الحالة"])}</span>
                      <select value={r.status} disabled={!canEdit || ib.pending} onChange={(e) => ib.setStatus(r, e.target.value)}>
                        {Object.entries(APP_STATUS).map(([k, v]) => <option key={k} value={k}>{tx(locale, v)}</option>)}
                      </select>
                    </label>
                    <NotesBox initial={r.notes ?? ""} disabled={!canEdit || ib.pending} onSave={(n) => ib.saveNotes(r, n)} locale={locale} />
                    {canDelete && (
                      <button className="cms-btn cms-btn--danger" onClick={() => ib.remove(r, tx(locale, ["Delete this application and its CV permanently?", "حذف هذا الطلب وسيرته الذاتية نهائياً؟"]))}>
                        <span className="ms">delete</span>{tx(locale, ["Delete", "حذف"])}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesBox({ initial, onSave, disabled, locale }: { initial: string; onSave: (v: string) => void; disabled: boolean; locale: string }) {
  const [v, setV] = useState(initial);
  return (
    <label className="cms-field cms-grow">
      <span className="cms-label">{tx(locale, ["Internal notes", "ملاحظات داخلية"])}</span>
      <textarea rows={2} maxLength={4000} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={() => v !== initial && onSave(v)} />
    </label>
  );
}
