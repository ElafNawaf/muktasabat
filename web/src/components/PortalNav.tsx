"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { usePermissions } from "./PermissionsProvider";

/**
 * One source of truth for the staff portal's navigation: the sidebar, the
 * breadcrumb trail, the back button and the ⌘K palette all read from here,
 * so a page added to the menu is automatically reachable everywhere.
 */

export type PortalUser = {
  username: string;
  role: string;
  full_name?: string | null;
  avatar_url?: string | null;
  is_super_admin?: boolean;
};

export type NavItem = { id: string; href: string; icon: string; label: string; section: string; badge?: number };
export type NavSection = { label: string; items: NavItem[] };

export function usePortalNavSections(user: PortalUser | null): NavSection[] {
  const t = useTranslations("nav");
  const locale = useLocale();
  const { can } = usePermissions();
  const isAdmin = user?.role === "admin";
  const L = (p: string) => `/${locale}/${p}`;
  const v = (m: Parameters<typeof can>[0]) => isAdmin || can(m, "view");

  // Grouped by what the data is about: portfolio → contracts → money → running the company.
  const raw: { label: string; items: (Omit<NavItem, "section"> & { show?: boolean })[] }[] = [
    {
      label: t("overview"),
      items: [
        { id: "dashboard", href: L("dashboard"), icon: "space_dashboard", label: t("dashboard"), show: v("dashboard") },
        { id: "approvals", href: L("approvals"), icon: "approval", label: t("approvals"), show: isAdmin || can("maintenance", "approve") || can("contracts", "approve") || can("payments", "approve") },
      ],
    },
    {
      label: t("portfolio"),
      items: [
        { id: "properties", href: L("properties"), icon: "domain", label: t("properties"), show: v("properties") },
        { id: "owners", href: L("owners"), icon: "group", label: t("owners"), show: v("owners") },
        { id: "tenants", href: L("tenants"), icon: "person", label: t("tenants"), show: v("tenants") },
        { id: "agents", href: L("agents"), icon: "support_agent", label: t("agents"), show: v("agents") },
      ],
    },
    {
      label: t("contractsGroup"),
      items: [
        { id: "contracts", href: L("contracts"), icon: "description", label: t("leaseContracts"), show: v("contracts") },
        { id: "renewals", href: L("renewals"), icon: "autorenew", label: t("renewals"), show: v("contracts") },
        { id: "management-contracts", href: L("management-contracts"), icon: "handshake", label: t("managementContracts"), show: v("management_contracts") },
      ],
    },
    {
      label: t("finance"),
      items: [
        { id: "payments", href: L("payments"), icon: "payments", label: t("payments"), show: v("payments") },
        { id: "collections", href: L("collections"), icon: "savings", label: t("collections"), show: v("payments") },
        { id: "expenses", href: L("expenses"), icon: "receipt_long", label: t("expenses"), show: v("expenses") },
      ],
    },
    {
      label: t("operations"),
      items: [
        { id: "maintenance", href: L("maintenance"), icon: "handyman", label: t("maintenance"), show: v("maintenance") },
      ],
    },
    {
      label: t("management"),
      items: [
        { id: "users", href: L("users"), icon: "admin_panel_settings", label: t("users"), show: isAdmin },
        { id: "owner-access", href: L("owner-access"), icon: "key", label: t("ownerAccess"), show: v("owner_portal") },
        { id: "website", href: L("website"), icon: "language", label: t("website"), show: v("website") },
        { id: "data-management", href: L("data-management"), icon: "database", label: t("dataManagement"), show: v("data") },
        { id: "email-log", href: L("email-log"), icon: "outgoing_mail", label: t("emailLog"), show: !!user?.is_super_admin },
      ],
    },
    {
      label: t("myAccount"),
      items: [
        { id: "account", href: L("account"), icon: "account_circle", label: t("profile") },
        { id: "support", href: L("support"), icon: "support_agent", label: t("support") },
      ],
    },
  ];
  return raw
    .map((sec) => ({
      label: sec.label,
      items: sec.items.filter((it) => it.show !== false).map(({ show: _s, ...it }) => ({ ...it, section: sec.label })),
    }))
    .filter((sec) => sec.items.length > 0);
}

type Ctx = {
  user: PortalUser | null;
  sections: NavSection[];
  items: NavItem[];
  canGoBack: boolean;
  openPalette: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
};

const PortalNavCtx = createContext<Ctx | null>(null);

const HIST_KEY = "mk-portal-hist";

/** Tracks in-app history so "Back" only steps back inside the portal; when the
 *  page was opened directly (bookmark, e-mail link) Back goes to the parent page. */
function useInAppHistory() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [depth, setDepth] = useState(0);
  useEffect(() => {
    const here = pathname + (search?.toString() ? `?${search}` : "");
    let stack: string[] = [];
    try {
      stack = JSON.parse(sessionStorage.getItem(HIST_KEY) || "[]");
    } catch {
      stack = [];
    }
    if (stack[stack.length - 1] === here) {
      /* reload — nothing to do */
    } else if (stack[stack.length - 2] === here) stack.pop();
    else stack.push(here);
    stack = stack.slice(-50);
    try {
      sessionStorage.setItem(HIST_KEY, JSON.stringify(stack));
    } catch {
      /* private mode */
    }
    setDepth(stack.length);
  }, [pathname, search]);
  return depth > 1;
}

export function PortalNavProvider({ user, children }: { user: PortalUser | null; children: React.ReactNode }) {
  const sections = usePortalNavSections(user);
  const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const canGoBack = useInAppHistory();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  return (
    <PortalNavCtx.Provider value={{ user, sections, items, canGoBack, openPalette, paletteOpen, setPaletteOpen }}>
      {children}
    </PortalNavCtx.Provider>
  );
}

export function usePortalNav(): Ctx {
  const c = useContext(PortalNavCtx);
  if (!c) {
    return { user: null, sections: [], items: [], canGoBack: false, openPalette: () => {}, paletteOpen: false, setPaletteOpen: () => {} };
  }
  return c;
}

/** Labels for sub-pages that are not menu items. */
const SUB_LABELS: Record<string, [string, string]> = {
  settings: ["الإعدادات", "Settings"],
  leads: ["الاستفسارات", "Leads"],
  applications: ["طلبات التوظيف", "Applications"],
  texts: ["نصوص الموقع", "Website texts"],
  services: ["الخدمات", "Services"],
  projects: ["المشاريع", "Projects"],
  posts: ["الأخبار", "News"],
  jobs: ["الوظائف", "Jobs"],
  testimonials: ["آراء العملاء", "Testimonials"],
  partners: ["الشركاء", "Partners"],
  listings: ["العقارات المعروضة", "Listings"],
};

export type Crumb = { label: string; href?: string };

/** Breadcrumb trail + parent link for the current portal URL. */
export function useTrail(title?: string): { crumbs: Crumb[]; parent: string } {
  const pathname = usePathname() || "";
  const locale = useLocale();
  const { items } = usePortalNav();
  const ar = locale === "ar";
  const parts = pathname.split("/").filter(Boolean).slice(1); // drop locale
  const home = items.find((i) => i.id === "dashboard");
  const crumbs: Crumb[] = [];
  if (home && parts[0] !== "dashboard") crumbs.push({ label: home.label, href: home.href });
  let acc = `/${locale}`;
  parts.forEach((p, i) => {
    acc += `/${p}`;
    const last = i === parts.length - 1;
    const nav = i === 0 ? items.find((it) => it.id === p) : undefined;
    const sub = SUB_LABELS[p];
    const label = nav?.label ?? (sub ? sub[ar ? 0 : 1] : last && title ? title : decodeURIComponent(p));
    crumbs.push({ label: last && title && i > 0 && !sub ? title : label, href: last ? undefined : acc });
  });
  const parentParts = parts.slice(0, -1);
  const parent = parentParts.length ? `/${locale}/${parentParts.join("/")}` : home?.href ?? `/${locale}/dashboard`;
  return { crumbs, parent };
}

/** Back: one step back inside the portal, or up to the parent page. */
export function useGoBack(parent: string) {
  const router = useRouter();
  const { canGoBack } = usePortalNav();
  return useCallback(() => {
    if (canGoBack) router.back();
    else router.push(parent);
  }, [canGoBack, parent, router]);
}
