"use client";

import { useEffect, useRef, useState } from "react";

type Stat = { value: number; suffix?: string | null; label: string };

function Counter({ value, suffix, locale }: { value: number; suffix?: string | null; locale: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const fmt = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: 1 });

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      setShown(0);
      const start = performance.now();
      const dur = 1200;
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        setShown(value * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <span ref={ref} className="mk-stat__value">
      {fmt.format(Number.isInteger(value) ? Math.round(shown) : shown)}
      {suffix}
    </span>
  );
}

/** Only rendered when an editor has entered real (non-zero) figures. */
export function StatsRow({ stats, locale }: { stats: Stat[]; locale: string }) {
  const real = stats.filter((s) => s.value > 0 && s.label);
  if (real.length === 0) return null;
  return (
    <dl className="mk-stats">
      {real.map((s, i) => (
        <div key={i} className="mk-stat">
          <dt>{s.label}</dt>
          <dd>
            <Counter value={s.value} suffix={s.suffix} locale={locale} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
