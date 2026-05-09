"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

      <button className="icon-btn topbar-notif-btn" title="Notifications">
        <span className="ms">notifications</span>
        <span className="dot" />
      </button>

      <button className="topbar-avatar" onClick={logout} title={t("logout")}>
        <div className="avatar">{initials}</div>
        <div
          className="topbar-user-text"
          style={{ display: "flex", flexDirection: "column", gap: 2, lineHeight: 1.1 }}
        >
          <span className="name">{user.username}</span>
        </div>
        <span className="role-pill">{user.role}</span>
      </button>
    </header>
  );
}
