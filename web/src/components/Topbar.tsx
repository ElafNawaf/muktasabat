"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useMobileNav } from "./MobileNavProvider";
import { useTheme } from "./ThemeProvider";

export function Topbar({
  title,
  user,
}: {
  title: string;
  user: { username: string; role: string };
}) {
  const t = useTranslations("common");
  const { theme, toggle } = useTheme();
  const { toggle: toggleMobileNav } = useMobileNav();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const initials = user.username.slice(0, 2).toUpperCase();
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
      <h1>{title}</h1>
      <div style={{ flex: 1 }} />

      <button className="icon-btn" onClick={toggle} title="Theme" aria-label="Toggle theme">
        <span className="ms">{theme === "light" ? "dark_mode" : "light_mode"}</span>
      </button>

      <div className="user-menu" ref={menuRef}>
        <button
          className="topbar-avatar"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <div className="avatar">{initials}</div>
          <span className="topbar-user-text">
            <span className="name">{user.username}</span>
            <span className="role">{roleLabel}</span>
          </span>
          <span className="ms ms-sm topbar-user-caret" aria-hidden>expand_more</span>
        </button>
        {menuOpen && (
          <div className="user-menu__pop" role="menu">
            <div className="user-menu__who">
              <strong>{user.username}</strong>
              <small>{roleLabel}</small>
            </div>
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
