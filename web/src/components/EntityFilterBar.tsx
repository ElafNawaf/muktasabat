"use client";

import { useLocale, useTranslations } from "next-intl";
import { Children, useId, useState, type ReactNode } from "react";

/** Modern single-row toolbar: search grows, filters sit inline as pill
 *  selects, result count + clear on the far end. Wraps on small screens. */
export function FilterBar({
  children,
  trailing,
  statusRow,
  search,
}: {
  children?: ReactNode;
  trailing?: ReactNode;
  statusRow?: ReactNode;
  search?: ReactNode;
}) {
  const t = useTranslations("filters");
  const [more, setMore] = useState(false);
  const items = Children.toArray(children);
  // Keep the toolbar to one calm row: search + 3 filters, the rest on demand.
  const VISIBLE = search ? 3 : 4;
  const shown = more ? items : items.slice(0, VISIBLE);
  const hidden = items.length - VISIBLE;
  const ar = useLocale() === "ar";
  return (
    <section className="fbar" aria-label={t("panelTitle")}>
      {statusRow ? <div className="fbar-status">{statusRow}</div> : null}
      <div className="fbar-row">
        {search ? <div className="fbar-search">{search}</div> : null}
        {shown}
        {hidden > 0 && (
          <button type="button" className={`fbar-more${more ? " is-on" : ""}`} onClick={() => setMore((m) => !m)} aria-expanded={more}>
            <span className="ms ms-sm" aria-hidden>{more ? "expand_less" : "tune"}</span>
            {more ? (ar ? "فلاتر أقل" : "Fewer filters") : (ar ? `فلاتر أخرى (${hidden})` : `More filters (${hidden})`)}
          </button>
        )}
        {trailing ? <div className="fbar-end">{trailing}</div> : null}
      </div>
    </section>
  );
}

export function FilterStatusPills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="filter-status-pills" role="tablist" aria-label="Status">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`filter-status-pill${active ? " active" : ""}`}
            onClick={() => onChange(o.value)}
          >
            <span className="filter-status-pill-label">{o.label}</span>
            {o.count != null && <span className="filter-status-pill-count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  minWidth,
  maxWidth = 260,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  minWidth?: number;
  maxWidth?: number;
}) {
  const selectId = useId();
  const active = options.length > 0 && value !== options[0].value;
  const current = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? "";
  return (
    <label className={`chip-select${active ? " is-active" : ""}`} htmlFor={selectId} style={{ minWidth, maxWidth }}>
      <span className="chip-select__label">{label}</span>
      <span className="chip-select__value">{current}</span>
      <span className="ms chip-select__icon" aria-hidden>expand_more</span>
      <select id={selectId} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search-input filter-search-input">
      <span className="ms" aria-hidden>search</span>
      <input
        type="search"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function FilterClearButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="fbar-clear" onClick={onClick}>
      <span className="ms ms-sm" aria-hidden>filter_alt_off</span>
      {label}
    </button>
  );
}

export function FilterResultMeta({
  showing,
  total,
  label,
}: {
  showing: number;
  total: number;
  label: string;
}) {
  if (showing === total) return null;
  return (
    <span className="filter-result-meta">
      {label}
    </span>
  );
}
