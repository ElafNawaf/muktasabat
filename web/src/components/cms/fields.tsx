"use client";

import { useRef, useState } from "react";

export const tx = (locale: string, pair: [string, string]) => (locale === "ar" ? pair[1] : pair[0]);

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/cms/media", { method: "POST", body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof j?.detail === "string" ? j.detail : `Upload failed (${res.status})`);
  return j.url as string;
}

export function ImageField({ value, onChange, locale }: { value?: string | null; onChange: (v: string | null) => void; locale: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="cms-image">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" />
      ) : (
        <div className="cms-image__empty"><span className="ms">image</span></div>
      )}
      <div className="cms-image__actions">
        <button type="button" className="cms-btn" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "…" : value ? tx(locale, ["Replace", "استبدال"]) : tx(locale, ["Upload", "رفع صورة"])}
        </button>
        {value && (
          <button type="button" className="cms-btn cms-btn--ghost" onClick={() => onChange(null)}>
            {tx(locale, ["Remove", "إزالة"])}
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            setErr(null);
            try {
              onChange(await uploadImage(f));
            } catch (x) {
              setErr(x instanceof Error ? x.message : "Upload failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      {err && <p className="cms-err">{err}</p>}
    </div>
  );
}

export function GalleryField({ value, onChange, locale }: { value: string[]; onChange: (v: string[]) => void; locale: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const move = (i: number, d: number) => {
    const next = [...value];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div>
      <div className="cms-gallery">
        {value.map((src, i) => (
          <div key={src + i} className="cms-gallery__item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" />
            <div className="cms-gallery__tools">
              <button type="button" aria-label="Move earlier" onClick={() => move(i, -1)}><span className="ms">chevron_left</span></button>
              <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((_, k) => k !== i))}><span className="ms">delete</span></button>
              <button type="button" aria-label="Move later" onClick={() => move(i, 1)}><span className="ms">chevron_right</span></button>
            </div>
          </div>
        ))}
        <button type="button" className="cms-gallery__add" disabled={busy || value.length >= 40} onClick={() => input.current?.click()}>
          <span className="ms">{busy ? "hourglass_top" : "add_photo_alternate"}</span>
          {tx(locale, ["Add photos", "إضافة صور"])}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          setErr(null);
          const added: string[] = [];
          for (const f of files) {
            try {
              added.push(await uploadImage(f));
            } catch (x) {
              setErr(x instanceof Error ? x.message : "Upload failed");
            }
          }
          onChange([...value, ...added].slice(0, 40));
          setBusy(false);
        }}
      />
      {err && <p className="cms-err">{err}</p>}
    </div>
  );
}

/** Arabic + English side by side — the editor always sees both languages. */
export function BiInput({
  name,
  values,
  onChange,
  multiline,
  rows = 3,
  max,
  required,
  mono,
}: {
  name: string;
  values: Record<string, unknown>;
  onChange: (field: string, v: string) => void;
  multiline?: boolean;
  rows?: number;
  max?: number;
  required?: boolean;
  mono?: boolean;
}) {
  const langs: ["ar" | "en", string, "rtl" | "ltr"][] = [["ar", "العربية", "rtl"], ["en", "English", "ltr"]];
  return (
    <div className="cms-bi">
      {langs.map(([lng, label, dir]) => {
        const field = `${name}_${lng}`;
        const v = (values[field] as string) ?? "";
        return (
          <label key={lng} className="cms-bi__col">
            <span className="cms-bi__lang">{label}</span>
            {multiline ? (
              <textarea dir={dir} rows={rows} maxLength={max} required={required} value={v} className={mono ? "cms-mono" : undefined} onChange={(e) => onChange(field, e.target.value)} />
            ) : (
              <input dir={dir} maxLength={max} required={required} value={v} onChange={(e) => onChange(field, e.target.value)} />
            )}
          </label>
        );
      })}
    </div>
  );
}
