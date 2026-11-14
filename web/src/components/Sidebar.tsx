"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { BrandLogo } from "./BrandLogo";
import { UserAvatar } from "./UserAvatar";
import { useMobileNav } from "./MobileNavProvider";
import { usePortalNav, type NavItem } from "./PortalNav";

type AppRole = "admin" | "manager" | "viewer" | "owner";

function roleDisplayName(role: string, tr: (key: AppRole) => string): string {
  if (role === "admin" || role === "manager" || role === "viewer" || role === "owner") return tr(role);
  return role;
}

// One accent per menu group, so each area of the system has its own colour.
const ACCENTS = ["#7B1A1A", "#b7832a", "#2f6b5a", "#2d6fa3", "#7a4fa0", "#c0603a", "#3f7d8c", "#8a5a2b"];
const PIN_KEY = "mk-sb-pins";
const CLOSED_KEY = "mk-sb-closed";
const RAIL_KEY = "mk-sb-rail";
const MODE_KEY = "mk-nav-mode";

export type NavMode = "full" | "rail" | "hover" | "top";
const MODES: { id: NavMode; icon: string; ar: string; en: string; arHint: string; enHint: string }[] = [
  { id: "full", icon: "view_sidebar", ar: "قائمة جانبية كاملة", en: "Full sidebar", arHint: "الأسماء والأيقونات ظاهرة دائماً", enHint: "Names and icons always visible" },
  { id: "rail", icon: "view_compact_alt", ar: "أيقونات فقط", en: "Icons only", arHint: "مساحة أكبر للمحتوى", enHint: "More room for content" },
  { id: "hover", icon: "swipe_right", ar: "تتوسع عند المرور", en: "Expand on hover", arHint: "أيقونات تتوسع عند وضع المؤشر", enHint: "Icons that open when you point" },
  { id: "top", icon: "toolbar", ar: "قائمة علوية", en: "Top menu bar", arHint: "القوائم في شريط أعلى الصفحة", enHint: "Menus in a bar across the top" },
];

function readJSON<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

export function Sidebar({
  user,
}: {
  user: { username: string; role: string; full_name?: string | null; avatar_url?: string | null; is_super_admin?: boolean } | null;
}) {
  const locale = useLocale();
  const ar = locale === "ar";
  const pathname = usePathname() || "";
  const { open: mobileOpen, close: closeMobile } = useMobileNav();
  const roleLabel = useTranslations("roles");
  const { sections, openPalette } = usePortalNav();

  const [mode, setMode] = useState<NavMode>("full");
  const [narrow, setNarrow] = useState(false);
  const [picker, setPicker] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const [pins, setPins] = useState<string[]>([]);
  const [closed, setClosed] = useState<string[]>([]);
  const [tip, setTip] = useState<null | { label: string; top: number }>(null);
  const navRef = useRef<HTMLElement>(null);
  const indRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setPins(readJSON<string[]>(PIN_KEY, []));
    setClosed(readJSON<string[]>(CLOSED_KEY, []));
    const saved = readJSON<NavMode | null>(MODE_KEY, null);
    // No choice yet: tablets / split screen start as icons so the page keeps its room.
    setMode(saved ?? (readJSON<boolean>(RAIL_KEY, false) || window.innerWidth < 1100 ? "rail" : "full"));
    const mq = window.matchMedia("(max-width: 519px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Phones always get the slide-in drawer; the chosen layout applies from tablet up.
  const eff: NavMode = narrow ? "full" : mode;
  const collapsed = eff === "rail" || eff === "hover";
  useEffect(() => {
    const app = asideRef.current?.parentElement;
    if (!app) return;
    app.setAttribute("data-nav", eff);
    app.classList.add("nav-anim");
  }, [eff]);
  const chooseMode = (m: NavMode) => {
    setMode(m);
    writeJSON(MODE_KEY, m);
    setPicker(false);
    setOpenGroup(null);
  };
  useEffect(() => {
    if (!picker && !openGroup) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".sb2-picker, .sb2-pickbtn, .sb2-tg")) {
        setPicker(false);
        setOpenGroup(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPicker(false);
        setOpenGroup(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [picker, openGroup]);
  useEffect(() => setOpenGroup(null), [pathname]);

  const allItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const activeId = useMemo(() => {
    const matches = (h: string) => pathname === h || pathname.startsWith(h + "/");
    return allItems.filter((x) => matches(x.href)).sort((a, b) => b.href.length - a.href.length)[0]?.id ?? null;
  }, [allItems, pathname]);

  const pinned = pins.map((id) => allItems.find((i) => i.id === id)).filter((x): x is NavItem => !!x);
  const groups = useMemo(
    () => sections.map((s, i) => ({ ...s, accent: ACCENTS[i % ACCENTS.length], hasActive: s.items.some((it) => it.id === activeId) })),
    [sections, activeId],
  );

  const togglePin = (id: string) =>
    setPins((p) => {
      const next = p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-8);
      writeJSON(PIN_KEY, next);
      return next;
    });
  const toggleGroup = (label: string) =>
    setClosed((c) => {
      const next = c.includes(label) ? c.filter((x) => x !== label) : [...c, label];
      writeJSON(CLOSED_KEY, next);
      return next;
    });
  const toggleRail = () => chooseMode(mode === "full" ? "rail" : "full");

  // Sliding highlight that glides to the current page.
  const placeIndicator = useCallback(() => {
    const nav = navRef.current;
    const ind = indRef.current;
    if (!nav || !ind) return;
    const el = nav.querySelector<HTMLElement>(".sb2-item.is-active");
    const r = el?.getBoundingClientRect();
    if (!el || !r || r.height < 8) {
      ind.style.opacity = "0";
      return;
    }
    const n = nav.getBoundingClientRect();
    ind.style.opacity = "1";
    ind.style.transform = `translateY(${r.top - n.top + nav.scrollTop}px)`;
    ind.style.height = `${r.height}px`;
  }, []);
  useLayoutEffect(() => {
    placeIndicator();
  }, [placeIndicator, activeId, closed, pins, eff, sections]);
  useEffect(() => {
    const t = setTimeout(placeIndicator, 380); // after open/close and width animations
    return () => clearTimeout(t);
  }, [placeIndicator, closed, eff]);

  // Expand-on-hover changes heights while it animates: re-place the highlight as it settles.
  const settle = () => {
    requestAnimationFrame(placeIndicator);
    setTimeout(placeIndicator, 200);
    setTimeout(placeIndicator, 420);
  };

  const otherLocale = locale === "en" ? "ar" : "en";
  const displayName = user ? user.full_name || user.username : "—";

  const showTip = (e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>, label: string) => {
    if (eff !== "rail") return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2 });
  };

  const renderItem = (it: NavItem, accent: string, i: number, inPins = false) => {
    const isActive = it.id === activeId && (inPins || !pins.includes(it.id) || !pinned.length);
    const isPinned = pins.includes(it.id);
    return (
      <div key={(inPins ? "p-" : "") + it.id} className="sb2-row" style={{ ["--ac" as string]: accent, ["--i" as string]: i }}>
        <Link
          href={it.href}
          className={"sb2-item" + (isActive ? " is-active" : "")}
          aria-current={isActive ? "page" : undefined}
          aria-label={eff === "rail" ? it.label : undefined}
          onClick={closeMobile}
          onMouseEnter={(e) => showTip(e, it.label)}
          onMouseLeave={() => setTip(null)}
          onFocus={(e) => showTip(e, it.label)}
          onBlur={() => setTip(null)}
        >
          <span className="sb2-ico" aria-hidden><span className="ms">{it.icon}</span></span>
          <span className="sb2-label">{it.label}</span>
          {it.badge ? <span className="sb2-badge">{it.badge}</span> : null}
        </Link>
        {eff !== "rail" && (
          <button
            type="button"
            className={"sb2-pin" + (isPinned ? " is-on" : "")}
            onClick={() => togglePin(it.id)}
            aria-pressed={isPinned}
            aria-label={isPinned ? (ar ? `إلغاء تثبيت ${it.label}` : `Unpin ${it.label}`) : ar ? `تثبيت ${it.label}` : `Pin ${it.label}`}
            title={isPinned ? (ar ? "إلغاء التثبيت" : "Unpin") : ar ? "تثبيت في الأعلى" : "Pin to top"}
          >
            <span className="ms ms-sm">push_pin</span>
          </button>
        )}
      </div>
    );
  };

  const pickerEl = picker && (
    <div className="sb2-picker" role="dialog" aria-label={ar ? "شكل القائمة" : "Menu layout"}>
      <p className="sb2-picker__h">{ar ? "اختر شكل القائمة" : "Choose the menu layout"}</p>
      <div className="sb2-picker__grid">
        {MODES.map((m) => (
          <button key={m.id} type="button" className={"sb2-mode" + (mode === m.id ? " is-on" : "")} onClick={() => chooseMode(m.id)} aria-pressed={mode === m.id}>
            <span className={`sb2-mini sb2-mini--${m.id}`} aria-hidden><i /><b /><u /></span>
            <span className="sb2-mode__t"><b>{ar ? m.ar : m.en}</b><small>{ar ? m.arHint : m.enHint}</small></span>
            {mode === m.id && <span className="ms ms-sm sb2-mode__ok">check_circle</span>}
          </button>
        ))}
      </div>
      {narrow && <p className="sb2-picker__note">{ar ? "على الجوال تظهر القائمة كدرج جانبي دائماً." : "On phones the menu always slides in from the side."}</p>}
    </div>
  );
  const pickBtn = (
    <button type="button" className={"sb2-iconbtn sb2-pickbtn" + (picker ? " is-on" : "")} onClick={() => setPicker((v) => !v)} aria-expanded={picker} title={ar ? "شكل القائمة" : "Menu layout"} aria-label={ar ? "شكل القائمة" : "Menu layout"}>
      <span className="ms ms-sm">dashboard_customize</span>
    </button>
  );

  if (eff === "top") {
    return (
      <aside ref={asideRef} className="sidebar sb2 sb2--top">
        <Link href={`/${locale}/dashboard`} className="sb2-brand">
          <span className="sb2-brand__mark"><BrandLogo size={22} /></span>
          <span className="sb2-brand__text"><b>{ar ? "مكتسبات" : "Muktasabat"}</b></span>
        </Link>
        <nav className="sb2-topnav" aria-label={ar ? "القائمة الرئيسية" : "Main menu"}>
          {pinned.length > 0 && (
            <div className={"sb2-tg" + (openGroup === "__pins" ? " is-open" : "")} style={{ ["--ac" as string]: "#b7832a" }}>
              <button type="button" className="sb2-tg__b" onClick={() => setOpenGroup(openGroup === "__pins" ? null : "__pins")} aria-expanded={openGroup === "__pins"}>
                <span className="ms ms-sm">push_pin</span>{ar ? "المثبّتة" : "Pinned"}<span className="ms ms-sm sb2-tg__chev">expand_more</span>
              </button>
              <div className="sb2-dd">{pinned.map((it, i) => renderItem(it, "#b7832a", i, true))}</div>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.label} className={"sb2-tg" + (g.hasActive ? " has-active" : "") + (openGroup === g.label ? " is-open" : "")} style={{ ["--ac" as string]: g.accent }}>
              <button type="button" className="sb2-tg__b" onClick={() => setOpenGroup(openGroup === g.label ? null : g.label)} aria-expanded={openGroup === g.label}>
                <span className="sb2-gh__dot" />{g.label}<span className="ms ms-sm sb2-tg__chev">expand_more</span>
              </button>
              <div className="sb2-dd">{g.items.map((it, i) => renderItem(it, g.accent, i))}</div>
            </div>
          ))}
        </nav>
        <div className="sb2-toptools">
          <button type="button" className="sb2-iconbtn" onClick={openPalette} title={ar ? "بحث وانتقال سريع" : "Search & jump"} aria-label={ar ? "بحث" : "Search"}><span className="ms ms-sm">search</span></button>
          {pickBtn}
          <Link href={pathname.replace(`/${locale}`, `/${otherLocale}`)} className="sb2-iconbtn sb2-lang" title={ar ? "English" : "العربية"}>{locale === "en" ? "ع" : "EN"}</Link>
          {pickerEl}
        </div>
      </aside>
    );
  }

  return (
    <aside
      ref={asideRef}
      className={"sidebar sb2" + (collapsed ? " sb2--" + eff : "") + (mobileOpen ? " mobile-open" : "")}
      onMouseEnter={eff === "hover" ? settle : undefined}
      onMouseLeave={eff === "hover" ? settle : undefined}
      onTransitionEnd={eff === "hover" ? placeIndicator : undefined}
    >
      <div className="sb2-hd">
        <Link href={`/${locale}/dashboard`} className="sb2-brand" onClick={closeMobile}>
          <span className="sb2-brand__mark"><BrandLogo size={26} /></span>
          <span className="sb2-brand__text">
            <b>{ar ? "مكتسبات العقارية" : "Muktasabat"}</b>
            <small>{ar ? "منصة إدارة الأملاك" : "Property management"}</small>
          </span>
        </Link>
        <button className="sb2-iconbtn sb2-close" onClick={closeMobile} aria-label={ar ? "إغلاق القائمة" : "Close menu"}>
          <span className="ms ms-sm">close</span>
        </button>
      </div>

      <button type="button" className="sb2-search" onClick={() => { closeMobile(); openPalette(); }} onMouseEnter={(e) => showTip(e, ar ? "بحث وانتقال سريع" : "Search & jump")} onMouseLeave={() => setTip(null)}>
        <span className="ms ms-sm" aria-hidden>search</span>
        <span className="sb2-search__label">{ar ? "ابحث أو انتقل إلى…" : "Search or jump to…"}</span>
        <kbd>{ar ? "Ctrl K" : "⌘K"}</kbd>
      </button>

      <nav className="sb2-nav" ref={navRef} aria-label={ar ? "القائمة الرئيسية" : "Main menu"}>
        <span className="sb2-ind" ref={indRef} aria-hidden />

        {pinned.length > 0 && (
          <div className="sb2-group is-pins">
            <div className="sb2-gh sb2-gh--static">
              <span className="ms ms-sm">push_pin</span>
              <span className="sb2-gh__t">{ar ? "المثبّتة" : "Pinned"}</span>
            </div>
            <div className="sb2-gb"><div>{pinned.map((it, i) => renderItem(it, "#b7832a", i, true))}</div></div>
          </div>
        )}

        {groups.map((g, gi) => {
          const isClosed = closed.includes(g.label) && !g.hasActive;
          return (
            <div key={g.label} className={"sb2-group" + (isClosed ? " is-closed" : "")} style={{ ["--ac" as string]: g.accent }}>
              <button type="button" className="sb2-gh" onClick={() => toggleGroup(g.label)} aria-expanded={!isClosed}>
                <span className="sb2-gh__dot" />
                <span className="sb2-gh__t">{g.label}</span>
                <span className="sb2-gh__n">{g.items.length}</span>
                <span className="ms ms-sm sb2-gh__chev">expand_more</span>
              </button>
              <div className="sb2-gb">
                <div>{g.items.map((it, i) => renderItem(it, g.accent, i + gi))}</div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="sb2-foot">
        <Link href={`/${locale}/account`} className="sb2-user" onClick={closeMobile} onMouseEnter={(e) => showTip(e, displayName)} onMouseLeave={() => setTip(null)}>
          <span className="sb2-user__av"><UserAvatar name={displayName} url={user?.avatar_url} size={36} /><i /></span>
          {user && (
            <span className="sb2-user__t">
              <b>{displayName}</b>
              <small>{roleDisplayName(user.role, roleLabel)}</small>
            </span>
          )}
        </Link>
        <div className="sb2-foot__tools">
          {!narrow && pickBtn}
          <Link href={pathname.replace(`/${locale}`, `/${otherLocale}`)} className="sb2-iconbtn sb2-lang" title={ar ? "English" : "العربية"}>
            {locale === "en" ? "ع" : "EN"}
          </Link>
          <button className="sb2-iconbtn sb2-rail" onClick={toggleRail} aria-label={collapsed ? (ar ? "توسيع القائمة" : "Expand menu") : ar ? "طي القائمة" : "Collapse menu"} title={collapsed ? (ar ? "توسيع القائمة" : "Expand menu") : ar ? "طي القائمة" : "Collapse menu"}>
            <span className="ms ms-sm">{collapsed ? "left_panel_open" : "left_panel_close"}</span>
          </button>
        </div>
      </div>

      {pickerEl}
      {eff === "rail" && tip && (
        <span className="sb2-tip" style={{ top: tip.top }} role="tooltip">{tip.label}</span>
      )}
    </aside>
  );
}
