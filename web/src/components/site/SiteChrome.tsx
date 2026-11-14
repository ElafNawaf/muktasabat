"use client";

import { useEffect, useState } from "react";

/** Phone-only action bar: the two things a property seeker does most — call or WhatsApp. */
export function MobileActions({ phone, wa, labels }: { phone?: string | null; wa?: string | null; labels: { call: string; whatsapp: string } }) {
  if (!phone && !wa) return null;
  return (
    <nav className="mk-mbar" aria-label={labels.call}>
      {phone && (
        <a href={`tel:${phone.replace(/\s/g, "")}`} className="mk-mbar__btn">
          <span className="ms" aria-hidden="true">call</span>
          {labels.call}
        </a>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="mk-mbar__btn mk-mbar__btn--wa">
          <span className="ms" aria-hidden="true">chat</span>
          {labels.whatsapp}
        </a>
      )}
    </nav>
  );
}

/** Appears after two screens of scrolling. */
export function BackToTop({ label }: { label: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(window.scrollY > window.innerHeight * 2);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <button
      type="button"
      className={`mk-totop${on ? " is-on" : ""}`}
      aria-label={label}
      title={label}
      tabIndex={on ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
    >
      <span className="ms" aria-hidden="true">arrow_upward</span>
    </button>
  );
}
