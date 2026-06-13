"use client";

import { useTranslations } from "next-intl";
import { Children, useId, type ReactNode } from "react";

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
  const hasFieldFilters = Children.count(children) > 0;

  return (
    <section className="filter-panel" aria-label={t("panelTitle")}>
      <div className="filter-panel-header">
        <div className="filter-panel-title">
          <span className="ms filter-panel-title-icon" aria-hidden>tune</span>
          <span>{t("panelTitle")}</span>
        </div>
        {trailing ? <div className="filter-panel-header-actions">{trailing}</div> : null}
      </div>

      {(search || statusRow) && (
        <div className="filter-panel-primary">
          {search ? <div className="filter-panel-search">{search}</div> : null}
          {statusRow ? <div className="filter-panel-status">{statusRow}</div> : null}
        </div>
      )}

      {hasFieldFilters ? (
        <div className="filter-panel-fields">
          <div className="filter-panel-fields-head">
            <span className="filter-panel-fields-label">{t("refineBy")}</span>
          </div>
          <div className="filter-panel-grid">{children}</div>
        </div>
      ) : null}
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
  minWidth = 148,
  maxWidth = 220,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  minWidth?: number;
  maxWidth?: number;
}) {
  const selectId = useId();
  return (
    <div className="filter-control" style={{ minWidth, maxWidth }}>
      <label className="filter-control-label" htmlFor={selectId}>{label}</label>
      <div className="filter-select-wrap">
        <select
          id={selectId}
          className="select filter-select"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="ms filter-select-icon" aria-hidden>expand_more</span>
      </div>
    </div>
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
    <button type="button" className="btn btn-sm btn-secondary filter-clear-btn" onClick={onClick}>
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
      {label.replace("{showing}", String(showing)).replace("{total}", String(total))}
    </span>
  );
}
