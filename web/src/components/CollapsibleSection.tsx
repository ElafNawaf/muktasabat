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
    <section className={"fsec" + (open ? " is-open" : "")}>
      <button type="button" className="fsec-hd" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {icon && (
          <span className="fsec-ico" aria-hidden="true">
            <span className="ms ms-sm">{icon}</span>
          </span>
        )}
        <span className="fsec-title">
          <span>{title}</span>
          {subtitle && <small>{subtitle}</small>}
        </span>
        <span className="ms ms-sm fsec-chev" aria-hidden="true">expand_more</span>
      </button>
      {open && <div className="fsec-body">{children}</div>}
    </section>
  );
}
