"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BrandLogo } from "@/components/BrandLogo";

const NAV: { href: string; icon: string; ar: string; en: string; self?: boolean }[] = [
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
}: {
  locale: string;
  ownerName: string;
  isPreview: boolean;
  children: React.ReactNode;
}) {
  const path = usePathname() || "";
  const sp = useSearchParams();
  const router = useRouter();
  const as = sp.get("as");
  const ar = locale === "ar";
  const base = `/${locale}/owner`;
  const qs = as ? `?as=${as}` : "";
  const other = ar ? "en" : "ar";
  const switchHref = path.replace(new RegExp(`^/${locale}`), `/${other}`) + qs;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(`/${locale}/login`);
  }

  return (
    <div className="ow-root" dir={ar ? "rtl" : "ltr"}>
      {isPreview && (
        <div className="ow-preview">
          <span className="ms">visibility</span>
          {ar ? "معاينة كما يراها المالك" : "Previewing as the owner sees it"}
          <Link href={`/${locale}/owner-access`}>{ar ? "رجوع" : "Back"}</Link>
        </div>
      )}
      <header className="ow-top">
        <div className="ow-wrap ow-top__bar">
          <Link href={base + qs} className="ow-brand">
            <span className="ow-brand__mark"><BrandLogo size={26} /></span>
            <span>
              <strong>{ar ? "شركة مكتسبات العقارية" : "Muktasabat Real Estate"}</strong>
              <small>{ar ? "بوابة الملاك" : "Owner portal"}</small>
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
        <nav className="ow-wrap ow-nav" aria-label={ar ? "أقسام البوابة" : "Portal sections"}>
          {NAV.filter((n) => !(isPreview && n.self)).map((n) => {
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
          const section = NAV.filter((n) => n.href).find((n) => path.startsWith(base + n.href + "/"));
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
        {ar
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
