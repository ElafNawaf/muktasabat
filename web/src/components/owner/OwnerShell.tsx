"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { BrandLogo } from "@/components/BrandLogo";

type NavItem = { href: string; icon: string; ar: string; en: string; self?: boolean };

const TENANT_NAV: NavItem[] = [
  { href: "", icon: "home", ar: "الرئيسية", en: "Home" },
  { href: "/payments", icon: "event_upcoming", ar: "دفعاتي", en: "My payments" },
  { href: "/contracts", icon: "description", ar: "عقدي", en: "My lease" },
  { href: "/support", icon: "support_agent", ar: "الدعم", en: "Support", self: true },
  { href: "/account", icon: "account_circle", ar: "حسابي", en: "Account", self: true },
];

const NAV: NavItem[] = [
  { href: "", icon: "space_dashboard", ar: "نظرة عامة", en: "Overview" },
  { href: "/properties", icon: "apartment", ar: "عقاراتي", en: "My properties" },
  { href: "/contracts", icon: "description", ar: "العقود", en: "Contracts" },
  { href: "/payments", icon: "payments", ar: "التحصيل", en: "Collections" },
  { href: "/statements", icon: "receipt_long", ar: "كشوف الحساب", en: "Statements" },
  { href: "/maintenance", icon: "handyman", ar: "الصيانة", en: "Maintenance" },
  { href: "/renewals", icon: "autorenew", ar: "التجديدات", en: "Renewals" },
  // Self-service — hidden in staff preview (it would show the staff member's own account).
  { href: "/support", icon: "support_agent", ar: "الدعم", en: "Support", self: true },
  { href: "/account", icon: "account_circle", ar: "حسابي", en: "My account", self: true },
];

export function OwnerShell({
  locale,
  ownerName,
  isPreview,
  children,
  kind = "owner",
}: {
  locale: string;
  ownerName: string;
  isPreview: boolean;
  children: React.ReactNode;
  kind?: "owner" | "tenant";
}) {
  const nav = kind === "tenant" ? TENANT_NAV : NAV;
  const navRef = useRef<HTMLElement>(null);
  const path = usePathname() || "";
  const sp = useSearchParams();
  const router = useRouter();
  const as = sp.get("as");
  const ar = locale === "ar";
  const base = `/${locale}/${kind}`;
  const qs = as ? `?as=${as}` : "";
  const other = ar ? "en" : "ar";
  const switchHref = path.replace(new RegExp(`^/${locale}`), `/${other}`) + qs;

  // Keep the current section visible in the scrollable tab row on phones.
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>(".is-on")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(`/${locale}/login`);
  }

  return (
    <div className={`ow-root ow-root--${kind}`} dir={ar ? "rtl" : "ltr"}>
      {isPreview && (
        <div className="ow-preview">
          <span className="ms">visibility</span>
          {kind === "tenant"
            ? ar ? "معاينة كما يراها المستأجر (للقراءة فقط)" : "Previewing as the tenant sees it (read-only)"
            : ar ? "معاينة كما يراها المالك" : "Previewing as the owner sees it"}
          <Link href={`/${locale}/${kind}-access`}>{ar ? "رجوع" : "Back"}</Link>
        </div>
      )}
      <header className="ow-top">
        <div className="ow-wrap ow-top__bar">
          <Link href={base + qs} className="ow-brand">
            <span className="ow-brand__mark"><BrandLogo size={26} /></span>
            <span>
              <strong>{ar ? "شركة مكتسبات العقارية" : "Muktasabat Real Estate"}</strong>
              <small>{kind === "tenant" ? (ar ? "بوابة المستأجرين" : "Tenant portal") : ar ? "بوابة الملاك" : "Owner portal"}</small>
            </span>
          </Link>
          <div className="ow-top__end">
            <span className="ow-hello">{ownerName}</span>
            <Link href={switchHref} className="ow-lang" lang={other}>{ar ? "EN" : "ع"}</Link>
            {!isPreview && (
              <button className="ow-icon" onClick={logout} title={ar ? "تسجيل الخروج" : "Sign out"} aria-label={ar ? "تسجيل الخروج" : "Sign out"}>
                <span className="ms">logout</span>
              </button>
            )}
          </div>
        </div>
        <nav ref={navRef} className="ow-wrap ow-nav" aria-label={ar ? "أقسام البوابة" : "Portal sections"}>
          {nav.filter((n) => !(isPreview && n.self)).map((n) => {
            const href = base + n.href;
            const on = n.href === "" ? path === base : path.startsWith(href);
            return (
              <Link key={n.href} href={href + qs} className={on ? "is-on" : undefined} aria-current={on ? "page" : undefined}>
                <span className="ms">{n.icon}</span>
                {ar ? n.ar : n.en}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="ow-wrap ow-main">
        {(() => {
          // Detail pages (e.g. a support ticket) get a Back control to their section.
          const section = nav.filter((n) => n.href).find((n) => path.startsWith(base + n.href + "/"));
          if (!section) return null;
          const to = base + section.href + qs;
          return (
            <button
              type="button"
              className="ow-backbtn"
              onClick={() => (window.history.length > 1 ? router.back() : router.push(to))}
            >
              <span className="ms ms-sm" style={{ transform: ar ? "scaleX(-1)" : undefined }} aria-hidden>arrow_back</span>
              {ar ? `رجوع إلى ${section.ar}` : `Back to ${section.en}`}
            </button>
          );
        })()}
        <div className="route-fade" key={path}>{children}</div>
      </main>
      <footer className="ow-wrap ow-foot">
        {kind === "tenant"
          ? ar
            ? "لأي استفسار عن عقدك أو دفعاتك تواصل معنا على 920007039 أو من صفحة الدعم."
            : "Questions about your lease or payments? Call 920007039 or use Support."
          : ar
          ? "الأرقام محدّثة لحظياً من نظام إدارة الأملاك. لأي استفسار تواصل مع مدير حسابك أو على 920007039."
          : "Figures are live from our property-management system. Questions? Contact your account manager or call 920007039."}
      </footer>
    </div>
  );
}

export function YearPicker({ year, years, label }: { year: number; years: number[]; label: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <label className="ow-select">
      <span>{label}</span>
      <select
        value={year}
        onChange={(e) => {
          const p = new URLSearchParams(sp.toString());
          p.set("year", e.target.value);
          router.push(`${path}?${p}`);
        }}
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </label>
  );
}

/** Generic URL-param dropdown (filters on portal pages). Empty value removes the param. */
export function ParamSelect({ name, value, label, options }: { name: string; value: string; label: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <label className="ow-select">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => {
          const p = new URLSearchParams(sp.toString());
          if (e.target.value) p.set(name, e.target.value);
          else p.delete(name);
          router.push(`${path}?${p}`);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
