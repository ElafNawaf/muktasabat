"use client";

import { useState } from "react";

/**
 * Collapsible group used to break long forms (Building, Contract) into
 * scannable chunks without forcing a tab navigation. Click the header to
 * toggle. Default-open via `defaultOpen`.
 */
export function CollapsibleSection({
  title,
  subtitle,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        background: "var(--color-bg)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          background: open ? "var(--color-bg-deep)" : "transparent",
          border: 0,
          borderBottom: open ? "1px solid var(--color-border)" : "0",
          cursor: "pointer",
          textAlign: "start",
          fontFamily: "inherit",
          color: "inherit",
          transition: "background 0.15s ease",
        }}
      >
        {icon && (
          <span className="ms ms-sm" style={{ color: "var(--color-primary)" }}>
            {icon}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</div>
          {subtitle && (
            <div className="text-sec" style={{ fontSize: 11.5 }}>
              {subtitle}
            </div>
          )}
        </div>
        <span
          className="ms ms-sm"
          style={{
            color: "var(--color-text-secondary)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.18s ease",
          }}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}
