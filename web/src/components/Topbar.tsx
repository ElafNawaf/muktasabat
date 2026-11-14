"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useMobileNav } from "./MobileNavProvider";
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
  const tAcc = useTranslations("userMenu");
  const locale = useLocale();
  const { theme, toggle } = useTheme();
  const { toggle: toggleMobileNav } = useMobileNav();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName =
    (locale === "ar" ? user.full_name_ar || user.full_name : user.full_name || user.full_name_ar) ||
    user.username;

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
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
      <h1>{title}</h1>
      <div style={{ flex: 1 }} />

      <div className="topbar-search">
        <span className="ms">search</span>
        <input placeholder={t("search") + "…"} />
      </div>

      <button className="icon-btn" onClick={toggle} title="Theme">
        <span className="ms">{theme === "light" ? "dark_mode" : "light_mode"}</span>
      </button>

      <Link className="icon-btn" href={`/${locale}/support`} title={tAcc("support")}>
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
          <div
            className="topbar-user-text"
            style={{ display: "flex", flexDirection: "column", gap: 2, lineHeight: 1.1 }}
          >
            <span className="name">{displayName}</span>
          </div>
          <span className="ms ms-sm">expand_more</span>
        </button>

        {menuOpen && (
          <div className="user-menu-pop" role="menu">
            <div className="user-menu-hd">
              <UserAvatar name={displayName} url={user.avatar_url} size={40} />
              <div style={{ minWidth: 0 }}>
                <div className="name">{displayName}</div>
                <div className="sub mono">@{user.username}</div>
              </div>
            </div>
            <Link role="menuitem" href={`/${locale}/account`} onClick={() => setMenuOpen(false)}>
              <span className="ms ms-sm">account_circle</span> {tAcc("myProfile")}
            </Link>
            <Link role="menuitem" href={`/${locale}/account?tab=security`} onClick={() => setMenuOpen(false)}>
              <span className="ms ms-sm">lock</span> {tAcc("security")}
            </Link>
            <Link role="menuitem" href={`/${locale}/account?tab=preferences`} onClick={() => setMenuOpen(false)}>
              <span className="ms ms-sm">tune</span> {tAcc("preferences")}
            </Link>
            <Link role="menuitem" href={`/${locale}/support`} onClick={() => setMenuOpen(false)}>
              <span className="ms ms-sm">support_agent</span> {tAcc("support")}
            </Link>
            <div className="user-menu-sep" />
            <button role="menuitem" onClick={logout} disabled={signingOut} className="danger">
              <span className="ms ms-sm">logout</span> {signingOut ? "…" : t("logout")}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
