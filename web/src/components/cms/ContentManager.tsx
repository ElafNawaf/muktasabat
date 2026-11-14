"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { cmsDelete, cmsSave } from "@/lib/cms-actions";
import { KIND_DEFAULTS, KIND_FIELDS, KIND_META, type CmsKind, type FieldDef } from "@/lib/cms-fields";

import { BiInput, GalleryField, ImageField, tx } from "./fields";

type Row = Record<string, unknown> & { id: number; published: boolean };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 160);

export function ContentManager({ kind, rows, locale, canEdit, canDelete }: { kind: CmsKind; rows: Row[]; locale: string; canEdit: boolean; canDelete: boolean }) {
  const meta = KIND_META[kind];
  const fields = KIND_FIELDS[kind];
  const router = useRouter();
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");

  const label = (r: Record<string, unknown>, f?: string) => {
    if (!f) return "";
    return String((locale === "ar" ? r[`${f}_ar`] || r[`${f}_en`] : r[`${f}_en`] || r[`${f}_ar`]) ?? "");
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [label(r, meta.titleField), r.slug].join(" ").toLowerCase().includes(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q]);

  function openNew() {
    setError(null);
    setEditing({ ...KIND_DEFAULTS[kind] });
  }

  function set(field: string, v: unknown) {
    setEditing((cur) => {
      if (!cur) return cur;
      const next = { ...cur, [field]: v };
      // Auto-fill the slug from the English title on new items until the editor touches it.
      if (field === `${meta.titleField}_en` && !cur.id && !cur.__slugTouched && fields.some((f) => f.type === "slug")) {
        next.slug = slugify(String(v));
      }
      if (field === "slug") next.__slugTouched = true;
      return next;
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const { id, updated_at: _u, __slugTouched: _s, ...data } = editing;
    // Empty strings → null so optional fields validate cleanly.
    for (const k of Object.keys(data)) if (data[k] === "") data[k] = null;
    setError(null);
    start(async () => {
      const res = await cmsSave(kind, (id as number) ?? null, data);
      if (!res.ok) return setError(res.error);
      setEditing(null);
      router.refresh();
    });
  }

  function remove(r: Row) {
    if (!window.confirm(tx(locale, [`Delete “${label(r, meta.titleField)}”? This cannot be undone.`, `حذف «${label(r, meta.titleField)}»؟ لا يمكن التراجع.`]))) return;
    start(async () => {
      const res = await cmsDelete(kind, r.id);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  function togglePublish(r: Row) {
    const { id, updated_at: _u, ...data } = r;
    start(async () => {
      const res = await cmsSave(kind, id, { ...data, published: !r.published });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="cms-panel">
      <div className="cms-toolbar">
        <input className="cms-search" placeholder={tx(locale, ["Search…", "بحث…"])} value={q} onChange={(e) => setQ(e.target.value)} />
        {canEdit && (
          <button className="cms-btn cms-btn--primary" onClick={openNew}>
            <span className="ms">add</span>
            {tx(locale, ["Add new", "إضافة جديد"])}
          </button>
        )}
      </div>

      {error && !editing && <p className="cms-err">{error}</p>}

      {shown.length === 0 ? (
        <div className="cms-empty">
          <span className="ms">{meta.icon}</span>
          <p>{tx(locale, ["Nothing here yet.", "لا يوجد محتوى بعد."])}</p>
        </div>
      ) : (
        <ul className="cms-list">
          {shown.map((r) => {
            const img = (r.cover_url || r.image_url || r.logo_url || r.avatar_url) as string | undefined;
            return (
              <li key={r.id} className="cms-row">
                <div className="cms-row__thumb">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" />
                  ) : (
                    <span className="ms">{meta.icon}</span>
                  )}
                </div>
                <div className="cms-row__main">
                  <strong>{label(r, meta.titleField) || "—"}</strong>
                  <small>{label(r, meta.subtitleField)}</small>
                </div>
                <button
                  type="button"
                  className={`cms-pill${r.published ? " is-on" : ""}`}
                  disabled={!canEdit || pending}
                  onClick={() => togglePublish(r)}
                  title={tx(locale, ["Toggle visibility on the website", "إظهار/إخفاء في الموقع"])}
                >
                  {r.published ? tx(locale, ["Published", "منشور"]) : tx(locale, ["Draft", "مسودة"])}
                </button>
                <div className="cms-row__actions">
                  {meta.publicPath && r.published && typeof r.slug === "string" && (
                    <a className="cms-icon" href={`/${locale}/${meta.publicPath}/${r.slug}`} target="_blank" rel="noreferrer" title={tx(locale, ["View on site", "عرض في الموقع"])}>
                      <span className="ms">open_in_new</span>
                    </a>
                  )}
                  {canEdit && (
                    <button className="cms-icon" onClick={() => { setError(null); setEditing({ ...r, __slugTouched: true }); }} title={tx(locale, ["Edit", "تعديل"])}>
                      <span className="ms">edit</span>
                    </button>
                  )}
                  {canDelete && (
                    <button className="cms-icon cms-icon--danger" onClick={() => remove(r)} title={tx(locale, ["Delete", "حذف"])}>
                      <span className="ms">delete</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <div className="cms-drawer" role="dialog" aria-modal="true" aria-label={tx(locale, meta.title)}>
          <div className="cms-drawer__backdrop" onClick={() => !pending && setEditing(null)} />
          <form className="cms-drawer__panel" onSubmit={save}>
            <header>
              <h2>{editing.id ? tx(locale, ["Edit", "تعديل"]) : tx(locale, ["New", "جديد"])} · {tx(locale, meta.title)}</h2>
              <button type="button" className="cms-icon" onClick={() => setEditing(null)} aria-label="Close"><span className="ms">close</span></button>
            </header>
            <div className="cms-drawer__body">
              {fields.map((f) => (
                <Field key={f.name} f={f} values={editing} set={set} locale={locale} />
              ))}
            </div>
            <footer>
              {error && <p className="cms-err">{error}</p>}
              <button type="button" className="cms-btn cms-btn--ghost" onClick={() => setEditing(null)} disabled={pending}>
                {tx(locale, ["Cancel", "إلغاء"])}
              </button>
              <button className="cms-btn cms-btn--primary" disabled={pending}>
                {pending ? "…" : tx(locale, ["Save", "حفظ"])}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ f, values, set, locale }: { f: FieldDef; values: Record<string, unknown>; set: (k: string, v: unknown) => void; locale: string }) {
  const lbl = tx(locale, f.label);
  const hint = "hint" in f && f.hint ? <small className="cms-hint">{tx(locale, f.hint)}</small> : null;
  switch (f.type) {
    case "bi-text":
      return <div className="cms-field"><span className="cms-label">{lbl}</span><BiInput name={f.name} values={values} onChange={set} max={f.max} required={f.required} /></div>;
    case "bi-textarea":
      return <div className="cms-field"><span className="cms-label">{lbl}</span><BiInput name={f.name} values={values} onChange={set} multiline max={f.max} required={f.required} /></div>;
    case "bi-markdown":
      return (
        <div className="cms-field">
          <span className="cms-label">{lbl}</span>
          <BiInput name={f.name} values={values} onChange={set} multiline rows={10} mono />
          <small className="cms-hint">{tx(locale, ["Markdown: ## Heading, **bold**, - list, [link](https://…)", "Markdown: ## عنوان، **عريض**، - قائمة، [رابط](https://…)"])}</small>
        </div>
      );
    case "text":
    case "url":
    case "icon":
    case "slug":
      return (
        <label className="cms-field">
          <span className="cms-label">
            {lbl}
            {f.type === "icon" && typeof values[f.name] === "string" && values[f.name] ? <span className="ms cms-iconprev">{String(values[f.name])}</span> : null}
          </span>
          <input
            dir="ltr"
            type={f.type === "url" ? "url" : "text"}
            required={f.required}
            maxLength={f.type === "slug" ? 160 : f.max ?? 600}
            pattern={f.type === "slug" ? "[a-z0-9]+(-[a-z0-9]+)*" : f.type === "icon" ? "[a-z0-9_]+" : undefined}
            value={(values[f.name] as string) ?? ""}
            onChange={(e) => set(f.name, f.type === "slug" ? e.target.value.toLowerCase() : e.target.value)}
          />
          {hint}
        </label>
      );
    case "number":
      return (
        <label className="cms-field cms-field--short">
          <span className="cms-label">{lbl}</span>
          <input
            type="number"
            min={f.min}
            max={f.max}
            step={f.step ?? "any"}
            value={values[f.name] == null ? "" : String(values[f.name])}
            onChange={(e) => set(f.name, e.target.value === "" ? null : Number(e.target.value))}
          />
        </label>
      );
    case "bool":
      return (
        <label className="cms-check">
          <input type="checkbox" checked={!!values[f.name]} onChange={(e) => set(f.name, e.target.checked)} />
          <span>{lbl}</span>
        </label>
      );
    case "date":
      return (
        <label className="cms-field cms-field--short">
          <span className="cms-label">{lbl}</span>
          <input type="date" value={(values[f.name] as string) ?? ""} onChange={(e) => set(f.name, e.target.value || null)} />
        </label>
      );
    case "select":
      return (
        <label className="cms-field cms-field--short">
          <span className="cms-label">{lbl}</span>
          <select value={(values[f.name] as string) ?? f.options[0].value} onChange={(e) => set(f.name, e.target.value)}>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{tx(locale, o.label)}</option>
            ))}
          </select>
        </label>
      );
    case "image":
      return <div className="cms-field"><span className="cms-label">{lbl}</span><ImageField value={values[f.name] as string | null} onChange={(v) => set(f.name, v)} locale={locale} /></div>;
    case "gallery":
      return <div className="cms-field"><span className="cms-label">{lbl}</span><GalleryField value={(values[f.name] as string[]) ?? []} onChange={(v) => set(f.name, v)} locale={locale} /></div>;
    case "latlng":
      return (
        <div className="cms-field">
          <span className="cms-label">{lbl}</span>
          <div className="cms-latlng">
            {(["lat", "lng"] as const).map((k) => (
              <label key={k}>
                <small>{k === "lat" ? tx(locale, ["Latitude", "خط العرض"]) : tx(locale, ["Longitude", "خط الطول"])}</small>
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  min={k === "lat" ? -90 : -180}
                  max={k === "lat" ? 90 : 180}
                  value={values[k] == null ? "" : String(values[k])}
                  onChange={(e) => set(k, e.target.value === "" ? null : Number(e.target.value))}
                />
              </label>
            ))}
          </div>
          <small className="cms-hint">{tx(locale, ["Tip: right-click a spot in Google Maps to copy its coordinates.", "تلميح: انقر بزر الفأرة الأيمن على الموقع في خرائط Google لنسخ الإحداثيات."])}</small>
        </div>
      );
  }
}
