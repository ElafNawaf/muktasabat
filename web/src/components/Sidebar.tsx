"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "./BrandLogo";
import { UserAvatar } from "./UserAvatar";
import { useMobileNav } from "./MobileNavProvider";
import { usePortalNav } from "./PortalNav";


type AppRole = "admin" | "manager" | "viewer" | "owner";

function roleDisplayName(role: string, tr: (key: AppRole) => string): string {
  if (role === "admin" || role === "manager" || role === "viewer" || role === "owner") {
    return tr(role);
  }
  return role;
}

export function Sidebar({
  user,
}: {
  user: {
    username: string;
    role: string;
    full_name?: string | null;
    avatar_url?: string | null;
    is_super_admin?: boolean;
  } | null;
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { open: mobileOpen, close: closeMobile } = useMobileNav();

  const roleLabel = useTranslations("roles");

  const L = (p: string) => `/${locale}/${p}`;
  // Menu definition is shared with the breadcrumb trail and the ⌘K palette.
  const { sections, openPalette } = usePortalNav();

  const otherLocale = locale === "en" ? "ar" : "en";
  const displayName = user ? user.full_name || user.username : "—";

  return (
    <aside className={"sidebar" + (collapsed ? " collapsed" : "") + (mobileOpen ? " mobile-open" : "")}>
      <div className="sidebar-hd">
        <div className="brand">
          <div className="brand-mark">
            <BrandLogo size={28} />
          </div>
          {!collapsed && (
            <div className="brand-text">
              <span className="ar">شركة مكتسبات العقارية</span>
              <span className="en">Muktasabat Real Estate</span>
            </div>
          )}
        </div>
        <button className="sidebar-close-btn" onClick={closeMobile} aria-label={locale === "ar" ? "إغلاق القائمة" : "Close menu"}>
          <span className="ms ms-sm">close</span>
        </button>
      </div>

      <button type="button" className="sidebar-search" onClick={() => { closeMobile(); openPalette(); }}>
        <span className="ms ms-sm" aria-hidden>search</span>
        {!collapsed && <span className="sidebar-search__label">{locale === "ar" ? "انتقل إلى…" : "Go to…"}</span>}
        {!collapsed && <kbd className="kbd">{locale === "ar" ? "Ctrl K" : "⌘K"}</kbd>}
      </button>

      <nav className="sidebar-nav">
        {sections.map((s) => (
          <div key={s.label}>
            <div className="nav-section">{s.label}</div>
            {s.items.map((it) => {
              const matches = (h: string) => pathname === h || pathname.startsWith(h + "/");
              const best = sections.flatMap((x) => x.items).filter((x) => matches(x.href)).sort((a, b) => b.href.length - a.href.length)[0];
              const isActive = !!best && best.href === it.href;
              return (
                <Link
                  key={it.id}
                  href={it.href}
                  className={"nav-item" + (isActive ? " active" : "")}
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? it.label : undefined}
                  onClick={closeMobile}
                >
                  <span className="ms" aria-hidden>{it.icon}</span>
                  <span className="label">{it.label}</span>
                  {it.badge && <span className="badge">{it.badge}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <Link
          href={L("account")}
          className="sidebar-user-link"
          title={collapsed ? displayName : undefined}
          onClick={closeMobile}
        >
          <UserAvatar name={displayName} url={user?.avatar_url} size={32} />
          {!collapsed && user && (
            <div className="user-info">
              <div className="name">{displayName}</div>
              <div className="role">{roleDisplayName(user.role, roleLabel)}</div>
            </div>
          )}
        </Link>
        <Link
          href={pathname.replace(`/${locale}`, `/${otherLocale}`)}
          className="lang-toggle"
          title="Toggle language"
        >
          {locale === "en" ? "AR" : "EN"}
        </Link>
        <button
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? (locale === "ar" ? "توسيع القائمة" : "Expand menu") : (locale === "ar" ? "طي القائمة" : "Collapse menu")}
          aria-label={collapsed ? (locale === "ar" ? "توسيع القائمة" : "Expand menu") : (locale === "ar" ? "طي القائمة" : "Collapse menu")}
        >
          <span className="ms ms-sm">{collapsed ? "left_panel_open" : "left_panel_close"}</span>
        </button>

      </div>
    </aside>
  );
}
