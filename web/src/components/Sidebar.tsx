"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "./BrandLogo";
import { useMobileNav } from "./MobileNavProvider";

type NavItem = { id: string; href: string; icon: string; label: string; badge?: number };

type AppRole = "admin" | "manager" | "viewer" | "owner";

function roleDisplayName(role: string, tr: (key: AppRole) => string): string {
  if (role === "admin" || role === "manager" || role === "viewer" || role === "owner") {
    return tr(role);
  }
  return role;
}

export function Sidebar({ user }: { user: { username: string; role: string } | null }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { open: mobileOpen, close: closeMobile } = useMobileNav();

  const roleLabel = useTranslations("roles");

  const sections: { label: string; items: NavItem[] }[] = [
    {
      label: t("main"),
      items: [
        { id: "dashboard", href: `/${locale}/dashboard`, icon: "space_dashboard", label: t("dashboard") },
        { id: "properties", href: `/${locale}/properties`, icon: "domain", label: t("properties") },
      ],
    },
    {
      label: t("data"),
      items: [
        { id: "owners", href: `/${locale}/owners`, icon: "group", label: t("owners") },
        { id: "tenants", href: `/${locale}/tenants`, icon: "person", label: t("tenants") },
        { id: "contracts", href: `/${locale}/contracts`, icon: "description", label: t("contracts") },
        { id: "payments", href: `/${locale}/payments`, icon: "payments", label: t("payments") },
        { id: "expenses", href: `/${locale}/expenses`, icon: "receipt_long", label: t("expenses") },
      ],
    },
    ...(user?.role === "admin"
      ? [
          {
            label: t("admin"),
            items: [
              {
                id: "users",
                href: `/${locale}/users`,
                icon: "admin_panel_settings",
                label: t("users"),
              },
            ],
          },
        ]
      : []),
  ];

  const otherLocale = locale === "en" ? "ar" : "en";
  const initials = user
    ? user.username.slice(0, 2).toUpperCase()
    : "—";

  return (
    <aside className={"sidebar" + (collapsed ? " collapsed" : "") + (mobileOpen ? " mobile-open" : "")}>
      <div className="sidebar-hd">
        <div className="brand">
          <div className="brand-mark">
            <BrandLogo size={28} />
          </div>
          {!collapsed && (
            <div className="brand-text">
              <span className="ar">شركة مكتسبات</span>
              <span className="en">Muktasabat Real Estate</span>
            </div>
          )}
        </div>
        <button
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          title="Collapse"
        >
          <span className="ms ms-sm">{collapsed ? "menu_open" : "menu"}</span>
        </button>
      </div>

      <nav className="sidebar-nav">
        {sections.map((s) => (
          <div key={s.label}>
            <div className="nav-section">{s.label}</div>
            {s.items.map((it) => {
              const isActive = pathname === it.href || pathname.startsWith(it.href + "/");
              return (
                <Link
                  key={it.id}
                  href={it.href}
                  className={"nav-item" + (isActive ? " active" : "")}
                  title={collapsed ? it.label : undefined}
                  onClick={closeMobile}
                >
                  <span className="ms">{it.icon}</span>
                  <span className="label">{it.label}</span>
                  {it.badge && <span className="badge">{it.badge}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="avatar">{initials}</div>
        {!collapsed && user && (
          <div className="user-info">
            <div className="name">{user.username}</div>
            <div className="role">{roleDisplayName(user.role, roleLabel)}</div>
          </div>
        )}
        <Link
          href={pathname.replace(`/${locale}`, `/${otherLocale}`)}
          className="lang-toggle"
          title="Toggle language"
        >
          {locale === "en" ? "AR" : "EN"}
        </Link>
      </div>
    </aside>
  );
}
