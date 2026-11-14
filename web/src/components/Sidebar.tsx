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

  const [collapsed, setCollapsed] = useState(false);
  const [pins, setPins] = useState<string[]>([]);
  const [closed, setClosed] = useState<string[]>([]);
  const [tip, setTip] = useState<null | { label: string; top: number }>(null);
  const navRef = useRef<HTMLElement>(null);
  const indRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setPins(readJSON<string[]>(PIN_KEY, []));
    setClosed(readJSON<string[]>(CLOSED_KEY, []));
    setCollapsed(readJSON<boolean>(RAIL_KEY, false));
  }, []);

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
  const toggleRail = () =>
    setCollapsed((c) => {
      writeJSON(RAIL_KEY, !c);
      return !c;
    });

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
  }, [placeIndicator, activeId, closed, pins, collapsed, sections]);
  useEffect(() => {
    const t = setTimeout(placeIndicator, 320); // after group open/close animation
    return () => clearTimeout(t);
  }, [placeIndicator, closed, collapsed]);

  const otherLocale = locale === "en" ? "ar" : "en";
  const displayName = user ? user.full_name || user.username : "—";

  const showTip = (e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>, label: string) => {
    if (!collapsed) return;
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
          aria-label={collapsed ? it.label : undefined}
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
        {!collapsed && (
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

  return (
    <aside className={"sidebar sb2" + (collapsed ? " collapsed" : "") + (mobileOpen ? " mobile-open" : "")}>
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
          <Link href={pathname.replace(`/${locale}`, `/${otherLocale}`)} className="sb2-iconbtn sb2-lang" title={ar ? "English" : "العربية"}>
            {locale === "en" ? "ع" : "EN"}
          </Link>
          <button className="sb2-iconbtn sb2-rail" onClick={toggleRail} aria-label={collapsed ? (ar ? "توسيع القائمة" : "Expand menu") : ar ? "طي القائمة" : "Collapse menu"} title={collapsed ? (ar ? "توسيع القائمة" : "Expand menu") : ar ? "طي القائمة" : "Collapse menu"}>
            <span className="ms ms-sm">{collapsed ? "left_panel_open" : "left_panel_close"}</span>
          </button>
        </div>
      </div>

      {collapsed && tip && (
        <span className="sb2-tip" style={{ top: tip.top }} role="tooltip">{tip.label}</span>
      )}
    </aside>
  );
}
