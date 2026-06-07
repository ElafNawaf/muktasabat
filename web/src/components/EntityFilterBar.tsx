"use client";

import type { ReactNode } from "react";

export function FilterBar({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="filter-bar">
      {children}
      {trailing ? (
        <div
          style={{
            marginInlineStart: "auto",
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {trailing}
        </div>
      ) : null}
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  minWidth = 140,
  maxWidth = 200,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  minWidth?: number;
  maxWidth?: number;
}) {
  return (
    <select
      className="select"
      aria-label={label}
      title={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ height: 36, minWidth, maxWidth }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
    <div className="search-input">
      <span className="ms">search</span>
      <input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function FilterClearButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-sm btn-secondary" onClick={onClick}>
      <span className="ms ms-sm">filter_alt_off</span>
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
    <span className="text-sec" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
      {label.replace("{showing}", String(showing)).replace("{total}", String(total))}
    </span>
  );
}
