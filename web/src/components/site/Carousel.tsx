"use client";

import { useEffect, useRef, useState } from "react";

/** Scroll-snap carousel with arrow buttons and a progress rail. Native
 *  touch/trackpad scrolling, keyboard reachable, RTL-aware. */
export function Carousel({
  children,
  label,
  prevLabel,
  nextLabel,
  className = "",
}: {
  children: React.ReactNode;
  label: string;
  prevLabel: string;
  nextLabel: string;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false, p: 0 });

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const x = Math.abs(el.scrollLeft); // RTL scrollLeft is negative
      setEdge({ start: x < 4, end: x > max - 4, p: max > 0 ? x / max : 1 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  function go(dir: 1 | -1) {
    const el = track.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    const step = Math.max(280, el.clientWidth * 0.8);
    el.scrollBy({ left: dir * step * (rtl ? -1 : 1), behavior: "smooth" });
  }

  return (
    <div className={`mk-carousel ${className}`} role="region" aria-roledescription="carousel" aria-label={label}>
      <div ref={track} className="mk-carousel__track" tabIndex={0}>
        {children}
      </div>
      <div className="mk-carousel__nav">
        <span className="mk-carousel__rail" aria-hidden="true">
          <i style={{ transform: `scaleX(${Math.max(0.08, edge.p)})` }} />
        </span>
        <button type="button" onClick={() => go(-1)} disabled={edge.start} aria-label={prevLabel}>
          <span className="ms mk-flip" aria-hidden="true">arrow_back</span>
        </button>
        <button type="button" onClick={() => go(1)} disabled={edge.end} aria-label={nextLabel}>
          <span className="ms mk-flip" aria-hidden="true">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
