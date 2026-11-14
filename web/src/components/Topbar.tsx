"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { NotificationBell } from "./NotificationBell";
import { useLocale } from "next-intl";

import { BrandLogo } from "./BrandLogo";
import { useMobileNav } from "./MobileNavProvider";
import { usePortalNav, useGoBack, useTrail } from "./PortalNav";
import { useTheme } from "./ThemeProvider";
import { UserAvatar } from "./UserAvatar";

export function Topbar({
  title,
  user,
}: {
  title: string;
  user: {
    username: string;
    role: string;
    full_name?: string | null;
    full_name_ar?: string | null;
    avatar_url?: string | null;
  };
}) {
  const t = useTranslations("common");
  const { theme, toggle } = useTheme();
  const { toggle: toggleMobileNav } = useMobileNav();
  const { openPalette } = usePortalNav();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const locale = useLocale();
  const tAcc = useTranslations("userMenu");
  const displayName =
    (locale === "ar" ? user.full_name_ar || user.full_name : user.full_name || user.full_name_ar) ||
    user.username;
  const tRoles = useTranslations("roles");
  const roleLabel = (["admin", "manager", "viewer", "owner"] as const).includes(user.role as "admin")
    ? tRoles(user.role as "admin")
    : user.role;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
    router.push("/");
  }

  return (
    <header className="topbar">
      <button
        className="icon-btn topbar-menu-btn"
        onClick={toggleMobileNav}
        title="Menu"
        aria-label="Open navigation menu"
      >
        <span className="ms">menu</span>
      </button>
      <Link href={`/${locale}/dashboard`} className="topbar-brand" aria-label="شركة مكتسبات العقارية · Muktasabat Real Estate">
        <span className="brand-mark"><BrandLogo size={24} /></span>
      </Link>
      <NavTrail title={title} />

      <button className="tb-search" onClick={openPalette} aria-label={locale === "ar" ? "الانتقال السريع" : "Quick navigation"}>
        <span className="ms ms-sm" aria-hidden>search</span>
        <span className="tb-search__label">{locale === "ar" ? "ابحث أو انتقل إلى صفحة" : "Search or jump to a page"}</span>
        <kbd className="kbd">{locale === "ar" ? "Ctrl K" : "⌘K"}</kbd>
      </button>

      <button className="icon-btn" onClick={toggle} title="Theme" aria-label="Toggle theme">
        <span className="ms">{theme === "light" ? "dark_mode" : "light_mode"}</span>
      </button>

      <NotificationBell locale={locale} />

      <Link className="icon-btn" href={`/${locale}/support`} title={tAcc("support")} aria-label={tAcc("support")}>
        <span className="ms">help</span>
      </Link>

      <div className="user-menu" ref={menuRef}>
        <button
          className="topbar-avatar"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <UserAvatar name={displayName} url={user.avatar_url} size={28} />
          <span className="topbar-user-text">
            <span className="name">{displayName}</span>
            <span className="role">{roleLabel}</span>
          </span>
          <span className="ms ms-sm topbar-user-caret" aria-hidden>expand_more</span>
        </button>
        {menuOpen && (
          <div className="user-menu__pop" role="menu">
            <div className="user-menu__who">
              <strong>{displayName}</strong>
              <small>
                <span className="mono">@{user.username}</span> · {roleLabel}
              </small>
            </div>
            {(
              [
                ["account", "account_circle", tAcc("myProfile")],
                ["account?tab=security", "lock", tAcc("security")],
                ["account?tab=preferences", "tune", tAcc("preferences")],
                ["support", "support_agent", tAcc("support")],
              ] as const
            ).map(([path, icon, label]) => (
              <Link
                key={path}
                role="menuitem"
                className="user-menu__item"
                href={`/${locale}/${path}`}
                onClick={() => setMenuOpen(false)}
              >
                <span className="ms ms-sm" aria-hidden>{icon}</span>
                {label}
              </Link>
            ))}
            <button role="menuitem" className="user-menu__item" onClick={logout} disabled={signingOut}>
              <span className="ms ms-sm" aria-hidden>logout</span>
              {t("logout")}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/** Back button + breadcrumb trail (desktop) / page title (phone). */
function NavTrail({ title }: { title: string }) {
  const locale = useLocale();
  const ar = locale === "ar";
  const { crumbs, parent } = useTrail(title);
  const goBack = useGoBack(parent);
  const isHome = crumbs.length <= 1;
  return (
    <div className="navtrail">
      {!isHome && (
        <button type="button" className="navtrail-back" onClick={goBack} aria-label={ar ? "رجوع" : "Back"} title={ar ? "رجوع" : "Back"}>
          <span className="ms ms-sm flip-rtl" aria-hidden>arrow_back</span>
        </button>
      )}
      <nav aria-label={ar ? "مسار التنقل" : "Breadcrumb"} className="navtrail-crumbs">
        <ol>
          {crumbs.map((c, i) => (
            <li key={i}>
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
      <h1 className="navtrail-title">{title}</h1>
    </div>
  );
}
