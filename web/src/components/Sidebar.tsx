"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "./BrandLogo";
import { UserAvatar } from "./UserAvatar";
import { useMobileNav } from "./MobileNavProvider";
import { usePermissions } from "./PermissionsProvider";

type NavItem = { id: string; href: string; icon: string; label: string; badge?: number };

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

  const { can } = usePermissions();
  const isAdmin = user?.role === "admin";
  const L = (p: string) => `/${locale}/${p}`;

  // Grouped by what the data is about: portfolio → contracts → money → running the company.
  const sections: { label: string; items: NavItem[] }[] = [
    {
      label: t("overview"),
      items: [{ id: "dashboard", href: L("dashboard"), icon: "space_dashboard", label: t("dashboard") }],
    },
    {
      label: t("portfolio"),
      items: [
        { id: "properties", href: L("properties"), icon: "domain", label: t("properties") },
        { id: "owners", href: L("owners"), icon: "group", label: t("owners") },
        { id: "tenants", href: L("tenants"), icon: "person", label: t("tenants") },
        { id: "agents", href: L("agents"), icon: "support_agent", label: t("agents") },
      ],
    },
    {
      label: t("contractsGroup"),
      items: [
        { id: "contracts", href: L("contracts"), icon: "description", label: t("leaseContracts") },
        { id: "management-contracts", href: L("management-contracts"), icon: "handshake", label: t("managementContracts") },
      ],
    },
    {
      label: t("finance"),
      items: [
        { id: "payments", href: L("payments"), icon: "payments", label: t("payments") },
        { id: "expenses", href: L("expenses"), icon: "receipt_long", label: t("expenses") },
      ],
    },
    {
      label: t("management"),
      items: [
        ...(isAdmin ? [{ id: "users", href: L("users"), icon: "admin_panel_settings", label: t("users") }] : []),
        ...(isAdmin ? [{ id: "data-management", href: L("data-management"), icon: "database", label: t("dataManagement") }] : []),
        ...(user?.is_super_admin ? [{ id: "email-log", href: L("email-log"), icon: "outgoing_mail", label: t("emailLog") }] : []),
        ...(isAdmin || can("owners", "view")
          ? [{ id: "owner-access", href: L("owner-access"), icon: "key", label: t("ownerAccess") }]
          : []),
        ...(isAdmin || user?.role === "content_editor"
          ? [{ id: "website", href: L("website"), icon: "language", label: t("website") }]
          : []),
      ],
    },
    {
      label: t("myAccount"),
      items: [
        { id: "account", href: L("account"), icon: "account_circle", label: t("profile") },
        { id: "support", href: L("support"), icon: "support_agent", label: t("support") },
      ],
    },
  ].filter((sec) => sec.items.length > 0);

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
