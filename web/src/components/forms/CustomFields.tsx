"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { customSchema, customValuesGet, customValuesSave } from "@/lib/forms-actions";
import { FIELD_TYPES, displayValue, fieldLabel, type CustomField, type FormEntity } from "@/lib/forms-types";

type Values = Record<string, unknown>;

/** One input for a custom field (also used by the designer's live preview). */
export function CustomInput({ f, value, onChange, locale, disabled }: { f: CustomField; value: unknown; onChange: (v: unknown) => void; locale: string; disabled?: boolean }) {
  const ar = locale === "ar";
  const opt = (o: CustomField["options"][number]) => (ar ? o.ar : o.en || o.ar);
  const s = value == null ? "" : String(value);
  switch (f.type) {
    case "textarea":
      return <textarea className="input textarea" rows={3} value={s} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
    case "number":
      return <input className="input" type="number" inputMode="decimal" dir="ltr" value={s} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} disabled={disabled} />;
    case "date":
      return <input className="input" type="date" dir="ltr" value={s.slice(0, 10)} onChange={(e) => onChange(e.target.value || null)} disabled={disabled} />;
    case "select":
      return (
        <select className="input select" value={s} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}>
          <option value="">{ar ? "— اختر —" : "— Choose —"}</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{opt(o)}</option>)}
        </select>
      );
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="cf-chips">
          {f.options.map((o) => {
            const on = arr.includes(o.value);
            return (
              <button key={o.value} type="button" className={"cf-chip" + (on ? " is-on" : "")} aria-pressed={on} disabled={disabled}
                onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}>
                <span className="ms ms-sm">{on ? "check" : "add"}</span>{opt(o)}
              </button>
            );
          })}
        </div>
      );
    }
    case "checkbox":
      return (
        <label className="cf-toggle">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
          <span className="cf-toggle__track"><i /></span>
          <span>{value ? (ar ? "نعم" : "Yes") : ar ? "لا" : "No"}</span>
        </label>
      );
    default:
      return (
        <input className="input" value={s} onChange={(e) => onChange(e.target.value)} disabled={disabled}
          type={f.type === "email" ? "email" : f.type === "url" ? "url" : f.type === "phone" ? "tel" : "text"}
          dir={["email", "url", "phone"].includes(f.type) ? "ltr" : undefined}
          placeholder={f.type === "url" ? "https://" : undefined} />
      );
  }
}

/** Fields grouped by their section, rendered as form rows. */
export function CustomFieldsGrid({ fields, values, setValue, locale, disabled }: { fields: CustomField[]; values: Values; setValue: (k: string, v: unknown) => void; locale: string; disabled?: boolean }) {
  const ar = locale === "ar";
  const groups = useMemo(() => {
    const m = new Map<string, CustomField[]>();
    for (const f of fields) {
      const sec = (ar ? f.section_ar : f.section_en || f.section_ar) || "";
      m.set(sec, [...(m.get(sec) ?? []), f]);
    }
    return [...m.entries()];
  }, [fields, ar]);
  return (
    <div className="cf-grid">
      {groups.map(([sec, fs]) => (
        <div key={sec || "_"} className="cf-group">
          {sec && <h4 className="cf-sec">{sec}</h4>}
          <div className="cf-rows">
            {fs.map((f) => (
              <div key={f.key} className={"field cf-field" + (f.type === "textarea" || f.type === "multiselect" ? " cf-wide" : "")}>
                <label>
                  <span className="ms ms-sm cf-ico" aria-hidden>{FIELD_TYPES[f.type].icon}</span>
                  {fieldLabel(f, locale)}{f.required && <b className="cf-req"> *</b>}
                </label>
                <CustomInput f={f} value={values[f.key]} onChange={(v) => setValue(f.key, v)} locale={locale} disabled={disabled} />
                {(ar ? f.help_ar : f.help_en || f.help_ar) && <small className="cf-help">{ar ? f.help_ar : f.help_en || f.help_ar}</small>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Custom fields inside an entity's form (Owner, Tenant, Building, Unit, Lease, Agent).
 * Render `node` inside the form; after the record is saved call `save(id)` —
 * it returns an error message, or null when saved (or when there's nothing to save).
 */
export function useCustomFields(entity: FormEntity, id: number | null | undefined, locale: string) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [values, setValues] = useState<Values>({});
  const [loaded, setLoaded] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    let alive = true;
    (id ? customValuesGet(entity, id) : customSchema(entity).then((r) => (r.ok ? { ok: true as const, data: { fields: r.data.fields, values: {} } } : r))).then((r) => {
      if (!alive || !r.ok) return;
      setFields(r.data.fields);
      setValues(r.data.values ?? {});
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [entity, id]);

  const setValue = useCallback((k: string, v: unknown) => {
    dirty.current = true;
    setValues((x) => ({ ...x, [k]: v }));
  }, []);

  const save = useCallback(
    async (recordId: number): Promise<string | null> => {
      if (!fields.length || (!dirty.current && id)) return null;
      const r = await customValuesSave(entity, recordId, values, locale);
      if (!r.ok) return r.error;
      dirty.current = false;
      return null;
    },
    [entity, fields.length, id, locale, values],
  );

  const missing = fields.filter((f) => f.required && f.type !== "checkbox" && (values[f.key] == null || values[f.key] === "" || (Array.isArray(values[f.key]) && !(values[f.key] as unknown[]).length)));

  const node =
    loaded && fields.length > 0 ? (
      <CollapsibleSection title={locale === "ar" ? "بيانات إضافية" : "Additional details"} subtitle={locale === "ar" ? `${fields.length} حقل مخصّص` : `${fields.length} custom field(s)`} icon="dynamic_form">
        <CustomFieldsGrid fields={fields} values={values} setValue={setValue} locale={locale} />
      </CollapsibleSection>
    ) : null;

  return { node, save, missing, hasFields: fields.length > 0 };
}

/** Read-only "Additional details" card for profiles and detail pages. */
export function CustomFieldsCard({ entity, id, locale, className = "card tp2-card" }: { entity: FormEntity; id: number; locale: string; className?: string }) {
  const [data, setData] = useState<{ fields: CustomField[]; values: Values } | null>(null);
  useEffect(() => {
    customValuesGet(entity, id).then((r) => r.ok && setData(r.data));
  }, [entity, id]);
  if (!data || !data.fields.length) return null;
  return (
    <section className={className}>
      <h3 className="bd-h3">{locale === "ar" ? "بيانات إضافية" : "Additional details"}</h3>
      <dl className="bd-dl">
        {data.fields.map((f) => (
          <div key={f.key}><dt>{fieldLabel(f, locale)}</dt><dd>{f.type === "url" && data.values[f.key] ? <a href={String(data.values[f.key])} target="_blank" rel="noopener noreferrer">{String(data.values[f.key])}</a> : displayValue(f, data.values[f.key], locale)}</dd></div>
        ))}
      </dl>
    </section>
  );
}
