"use client";

/**
 * Shared building blocks for every dashboard page (لوحات المؤشرات):
 * animated numbers, KPI tiles, cards, legends that toggle series, bar lists,
 * period picker and the dashboard tab bar. Motion is CSS-driven (see the
 * `.dash` rules in globals.css) and switches off with prefers-reduced-motion.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { useTheme } from "@/components/ThemeProvider";

export const C = {
  maroon: "#7B1A1A", maroonLight: "#C25B4F", palm: "#2F5D50", palmLight: "#6FA593", sand: "#C9B28C",
  amber: "#D08A1E", red: "#C2410C", grey: "#9AA0A6", basalt: "#3D3A36", sky: "#4C7A9B", plum: "#7A4E7E",
};
export const PALETTE = [C.maroon, C.palm, C.sand, C.amber, C.sky, C.maroonLight, C.palmLight, C.plum, C.grey];

// ── Formatting ──────────────────────────────────────────────────────────────

export function useFmt(locale: string) {
  const ar = locale === "ar";
  return useMemo(() => {
    const L = ar ? "ar-SA" : "en-US";
    const nf = new Intl.NumberFormat(L, { maximumFractionDigits: 0 });
    const cf = new Intl.NumberFormat(L, { notation: "compact", maximumFractionDigits: 1 });
    const pf1 = new Intl.NumberFormat(L, { maximumFractionDigits: 1 });
    return {
      ar,
      T: (a: string, e: string) => (ar ? a : e),
      nf: (v: number) => nf.format(v),
      cf: (v: number) => cf.format(v),
      pf: (v: number | null | undefined) => (v == null ? "—" : `${pf1.format(v)}%`),
      sar: (v: number) => `${cf.format(v)} ${ar ? "ر.س" : "SAR"}`,
      month: (m: string) => {
        const [y, mm] = m.split("-").map(Number);
        return new Intl.DateTimeFormat(ar ? "ar-SA-u-ca-gregory" : "en-GB", { month: "short" }).format(new Date(y, mm - 1, 1)) + (mm === 1 ? ` ${String(y).slice(2)}` : "");
      },
      day: (d: string) => new Intl.DateTimeFormat(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short" }).format(new Date(d)),
      date: (d: string) => new Intl.DateTimeFormat(ar ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium" }).format(new Date(d)),
    };
  }, [ar]);
}

// ── Chart theme ─────────────────────────────────────────────────────────────

export function useChart(locale: string) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const ar = locale === "ar";
  return {
    dark,
    grid: dark ? "rgba(255,255,255,.07)" : "rgba(31,35,40,.07)",
    axis: dark ? "rgba(255,255,255,.55)" : "rgba(31,35,40,.55)",
    maroon: dark ? "#E58C80" : C.maroon,
    track: dark ? "#3A3431" : "#EFE7DA",
    tip: {
      contentStyle: { background: dark ? "#1E1B1A" : "#fff", border: `1px solid ${dark ? "#34302D" : "#E3DDD2"}`, borderRadius: 10, fontSize: 12.5, direction: (ar ? "rtl" : "ltr") as "rtl" | "ltr", boxShadow: "0 12px 30px -18px rgba(0,0,0,.4)" },
      labelStyle: { fontWeight: 700, marginBottom: 4 },
      cursor: { fill: dark ? "rgba(255,255,255,.04)" : "rgba(123,26,26,.05)" },
    },
    anim: { isAnimationActive: !reducedMotion(), animationDuration: 900, animationEasing: "ease-out" as const },
  };
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// ── Animated number ─────────────────────────────────────────────────────────

/** Counts from the previous value to the new one (ease-out, ~0.9 s). */
export function Num({ value, format, duration = 900 }: { value: number | null | undefined; format: (v: number) => string; duration?: number }) {
  const [shown, setShown] = useState<number>(0);
  const from = useRef(0);
  useEffect(() => {
    if (value == null || !isFinite(value)) return;
    if (reducedMotion()) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  if (value == null || !isFinite(value)) return <>—</>;
  return <>{format(shown)}</>;
}

// ── Layout pieces ───────────────────────────────────────────────────────────

export function Card({ title, sub, action, children, className = "", id }: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section className={`bi-card dash-card ${className}`} id={id}>
      <header className="bi-card__h">
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export type Tone = "good" | "warn" | "bad" | "maroon";

export function Kpi({
  label, value, fmt, sub, tone = "maroon", bar, ring, href, delta, deltaGoodWhenUp = true, icon, locale,
}: {
  label: string; value: number | null | undefined; fmt: (v: number) => string; sub?: React.ReactNode; tone?: Tone;
  bar?: number; ring?: number | null; href?: string; delta?: number | null; deltaGoodWhenUp?: boolean; icon?: string; locale: string;
}) {
  const body = (
    <>
      <div className="bi-kpi__top">
        <span className="bi-kpi__label">{icon && <span className="ms ms-sm dash-kpi-ico" aria-hidden>{icon}</span>}{label}</span>
        {ring != null && (
          <svg className="bi-ring dash-ring" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="15.5" className="bi-ring__bg" />
            <circle cx="18" cy="18" r="15.5" className="bi-ring__fg" strokeDasharray={`${(Math.max(0, Math.min(100, ring)) * 97.4) / 100} 97.4`} />
          </svg>
        )}
      </div>
      <div className="bi-kpi__value"><Num value={value} format={fmt} /></div>
      {delta != null && (
        <span className={`dash-delta ${(delta >= 0) === deltaGoodWhenUp ? "is-up" : "is-down"}`} title={locale === "ar" ? "مقارنة بالشهر الماضي" : "vs last month"}>
          <span className="ms ms-sm" aria-hidden>{delta >= 0 ? "trending_up" : "trending_down"}</span>
          {`${delta > 0 ? "+" : ""}${new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: 1 }).format(delta)}%`}
        </span>
      )}
      {bar != null && <div className="bi-kpi__bar"><i className="dash-grow" style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} /></div>}
      {sub && <div className="bi-kpi__sub">{sub}</div>}
      {href && <span className="ms ms-sm dash-kpi-go" aria-hidden>{locale === "ar" ? "arrow_back" : "arrow_forward"}</span>}
    </>
  );
  const cls = `bi-kpi dash-kpi is-${tone}${href ? " is-link" : ""}`;
  return href ? <Link href={`/${locale}/${href}`} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function Seg<K extends string | number>({ options, value, onChange, label }: { options: readonly (readonly [K, string])[]; value: K; onChange: (k: K) => void; label?: string }) {
  return (
    <div className="bi-seg" role="tablist" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={String(k)} type="button" role="tab" aria-selected={value === k} className={value === k ? "is-on" : ""} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

/** Clickable legend: each item shows / hides its series. */
export function Legend({ items, hidden, onToggle }: { items: { key: string; label: string; color: string; line?: boolean }[]; hidden: Set<string>; onToggle: (k: string) => void }) {
  return (
    <div className="bi-legend dash-legend">
      {items.map((it) => (
        <button key={it.key} type="button" className={hidden.has(it.key) ? "is-off" : ""} aria-pressed={!hidden.has(it.key)} onClick={() => onToggle(it.key)}>
          <i className={it.line ? "line" : ""} style={{ background: it.color }} />{it.label}
        </button>
      ))}
    </div>
  );
}

export function useToggleSet(initial: string[] = []) {
  const [s, set] = useState<Set<string>>(new Set(initial));
  return [s, (k: string) => set((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; })] as const;
}

/** Horizontal bars that grow in; rows can link somewhere. */
export function BarList({ rows, color = C.maroon, locale, empty }: { rows: { key: string; label: string; value: number; display?: string; href?: string; color?: string }[]; color?: string; locale: string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="bi-empty">{empty ?? (locale === "ar" ? "لا توجد بيانات بعد." : "No data yet.")}</p>;
  return (
    <ul className="bi-bars dash-bars">
      {rows.map((r, i) => {
        const inner = (
          <>
            <div className="bi-bars__row"><span>{r.label}</span><strong>{r.display ?? r.value}</strong></div>
            <div className="bi-bars__track"><i className="dash-grow" style={{ width: `${(100 * r.value) / max}%`, background: r.color ?? color, animationDelay: `${i * 70}ms` }} /></div>
          </>
        );
        return <li key={r.key}>{r.href ? <Link href={`/${locale}/${r.href}`} className="dash-bars__link">{inner}</Link> : inner}</li>;
      })}
    </ul>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="bi-empty">{children}</p>;
}

// ── Period picker (updates ?months=) ────────────────────────────────────────

export function PeriodPicker({ value, locale, options = [3, 6, 12, 24] }: { value: number; locale: string; options?: number[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const ar = locale === "ar";
  return (
    <div className={`dash-period${pending ? " is-loading" : ""}`}>
      <span className="ms ms-sm" aria-hidden>{pending ? "progress_activity" : "date_range"}</span>
      <Seg
        label={ar ? "الفترة" : "Period"}
        value={value}
        onChange={(m) => start(() => {
          const q = new URLSearchParams(params.toString());
          q.set("months", String(m));
          router.replace(`${pathname}?${q.toString()}`, { scroll: false });
        })}
        options={options.map((m) => [m, ar ? `${m} شهرًا` : `${m} mo`] as const)}
      />
    </div>
  );
}

// ── Dashboard tab bar ───────────────────────────────────────────────────────

export type DashKey = "portfolio" | "finance" | "operations" | "people" | "growth";

export const DASHES: { key: DashKey; path: string; icon: string; ar: string; en: string; arSub: string; enSub: string }[] = [
  { key: "portfolio", path: "dashboard", icon: "domain", ar: "المحفظة", en: "Portfolio", arSub: "التحصيل والإشغال والعقود", enSub: "Collections, occupancy, leases" },
  { key: "finance", path: "dashboard/finance", icon: "account_balance", ar: "المالية", en: "Finance", arSub: "الإيراد والهامش وصافي الربح", enSub: "Revenue, margin, net profit" },
  { key: "operations", path: "dashboard/operations", icon: "construction", ar: "التشغيل", en: "Operations", arSub: "الصيانة والتجديد والدعم", enSub: "Maintenance, renewals, support" },
  { key: "people", path: "dashboard/people", icon: "groups", ar: "الموارد البشرية", en: "People", arSub: "الحضور والإجازات والعقود", enSub: "Attendance, leave, contracts" },
  { key: "growth", path: "dashboard/growth", icon: "campaign", ar: "النمو والتسويق", en: "Growth", arSub: "العملاء المحتملون والإعلانات", enSub: "Leads, listings, careers" },
];

export function DashTabs({ locale, active, allowed }: { locale: string; active: DashKey; allowed: DashKey[] }) {
  const ar = locale === "ar";
  return (
    <nav className="dash-tabs" aria-label={ar ? "لوحات المؤشرات" : "Dashboards"}>
      {DASHES.filter((d) => allowed.includes(d.key)).map((d) => (
        <Link key={d.key} href={`/${locale}/${d.path}`} className={`dash-tab${d.key === active ? " is-active" : ""}`} aria-current={d.key === active ? "page" : undefined} prefetch>
          <span className="ms" aria-hidden>{d.icon}</span>
          <span className="dash-tab__txt">
            <strong>{ar ? d.ar : d.en}</strong>
            <small>{ar ? d.arSub : d.enSub}</small>
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** Scroll-spy chips for long pages: jump to a section. */
export function SectionChips({ items, locale }: { items: { id: string; label: string; icon: string; badge?: number }[]; locale: string }) {
  const [on, setOn] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setOn(vis.target.id);
    }, { rootMargin: "-30% 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  return (
    <div className="dash-chips" role="navigation" aria-label={locale === "ar" ? "الأقسام" : "Sections"}>
      {items.map((i) => (
        <a key={i.id} href={`#${i.id}`} className={on === i.id ? "is-on" : ""} onClick={(e) => { e.preventDefault(); document.getElementById(i.id)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }); }}>
          <span className="ms ms-sm" aria-hidden>{i.icon}</span>{i.label}
          {i.badge ? <b>{i.badge}</b> : null}
        </a>
      ))}
    </div>
  );
}
