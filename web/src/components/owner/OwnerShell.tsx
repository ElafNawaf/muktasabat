"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { NotificationBell } from "@/components/NotificationBell";

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

type ExportItem = { kind: string; icon: string; ar: string; en: string };
const EXPORTS: Record<"owner" | "tenant", ExportItem[]> = {
  owner: [
    { kind: "payments", icon: "receipt_long", ar: "الدفعات والتحويلات", en: "Payments & payouts" },
    { kind: "units", icon: "apartment", ar: "الوحدات والعقود", en: "Units & leases" },
    { kind: "expenses", icon: "construction", ar: "المصروفات", en: "Expenses" },
  ],
  tenant: [
    { kind: "payments", icon: "receipt_long", ar: "دفعاتي", en: "My payments" },
    { kind: "leases", icon: "description", ar: "عقودي", en: "My leases" },
  ],
};

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
  const [menu, setMenu] = useState(false);
  const L = (a: string, e: string) => (ar ? a : e);

  // Close the phone menu on navigation; Esc closes it too.
  useEffect(() => setMenu(false), [path]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(`/${locale}/login`);
  }

  const isOn = (href: string) => (href === "" ? path === base : path.startsWith(base + href));
  const main = nav.filter((n) => !n.self);
  const self = nav.filter((n) => n.self && !isPreview);
  const exportHref = (k: string) => `/api/${kind}/export?kind=${k}&locale=${locale}${as ? `&as_${kind}=${as}` : ""}`;
  const initials = ownerName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  const section = nav.filter((n) => n.href).find((n) => path.startsWith(base + n.href + "/"));
  const current = nav.find((n) => isOn(n.href));

  return (
    <div className={`ow-root ow-root--${kind} ow-app${menu ? " is-menu" : ""}`} dir={ar ? "rtl" : "ltr"}>
      {isPreview && (
        <div className="ow-preview">
          <span className="ms">visibility</span>
          {kind === "tenant"
            ? L("معاينة كما يراها المستأجر (للقراءة فقط)", "Previewing as the tenant sees it (read-only)")
            : L("معاينة كما يراها المالك", "Previewing as the owner sees it")}
          <Link href={`/${locale}/${kind}-access`}>{L("رجوع", "Back")}</Link>
        </div>
      )}

      <div className="ow-frame">
        <aside className="ow-side" aria-label={L("القائمة", "Menu")}>
          <Link href={base + qs} className="ow-side__brand">
            <span className="ow-brand__mark"><BrandLogo size={28} /></span>
            <span>
              <strong>{L("شركة مكتسبات العقارية", "Muktasabat Real Estate")}</strong>
              <small>{kind === "tenant" ? L("بوابة المستأجرين", "Tenant portal") : L("بوابة الملاك", "Owner portal")}</small>
            </span>
          </Link>

          <div className="ow-side__me">
            <span className="ow-side__avatar">{initials}</span>
            <span>
              <strong>{ownerName}</strong>
              <small>{isPreview ? L("معاينة الموظف", "Staff preview") : kind === "tenant" ? L("مستأجر", "Tenant") : L("مالك", "Owner")}</small>
            </span>
          </div>

          <nav ref={navRef} className="ow-sidenav">
            <p className="ow-sidenav__h">{L("الرئيسية", "Main")}</p>
            {main.map((n) => {
              const on = isOn(n.href);
              return (
                <Link key={n.href} href={base + n.href + qs} className={on ? "is-on" : undefined} aria-current={on ? "page" : undefined}>
                  <span className="ms">{n.icon}</span>
                  {ar ? n.ar : n.en}
                </Link>
              );
            })}
            {self.length > 0 && <p className="ow-sidenav__h">{L("حسابي والدعم", "Account & help")}</p>}
            {self.map((n) => {
              const on = isOn(n.href);
              return (
                <Link key={n.href} href={base + n.href + qs} className={on ? "is-on" : undefined} aria-current={on ? "page" : undefined}>
                  <span className="ms">{n.icon}</span>
                  {ar ? n.ar : n.en}
                </Link>
              );
            })}
          </nav>

          {!isPreview && (
            <Link href={`${base}/support?new=1`} className="ow-side__ticket">
              <span className="ms">confirmation_number</span>
              <span>
                <strong>{L("رفع تذكرة دعم", "Raise a support ticket")}</strong>
                <small>{L("مشكلة تقنية أو استفسار؟ نرد عليك بسرعة", "A technical issue or a question? We'll reply fast")}</small>
              </span>
            </Link>
          )}

          <details className="ow-side__export">
            <summary><span className="ms">download</span>{L("تصدير البيانات (Excel)", "Export data (Excel)")}<span className="ms ow-side__chev">expand_more</span></summary>
            <ul>
              {EXPORTS[kind].map((x) => (
                <li key={x.kind}>
                  <a href={exportHref(x.kind)} download>
                    <span className="ms">{x.icon}</span>
                    {ar ? x.ar : x.en}
                  </a>
                </li>
              ))}
              {kind === "owner" && (
                <li>
                  <Link href={`${base}/statements${qs}`}><span className="ms">summarize</span>{L("كشف الحساب الشهري", "Monthly statement")}</Link>
                </li>
              )}
            </ul>
          </details>

          <div className="ow-side__foot">
            <Link href={switchHref} className="ow-side__btn" lang={other}><span className="ms">translate</span>{ar ? "English" : "العربية"}</Link>
            <a href="tel:920007039" className="ow-side__btn"><span className="ms">call</span><span dir="ltr">920007039</span></a>
            {!isPreview && (
              <button className="ow-side__btn ow-side__btn--out" onClick={logout}><span className="ms">logout</span>{L("خروج", "Sign out")}</button>
            )}
          </div>
        </aside>
        <div className="ow-scrim" onClick={() => setMenu(false)} aria-hidden />

        <div className="ow-body">
          <header className="ow-topbar">
            <button className="ow-topbar__menu" onClick={() => setMenu(true)} aria-label={L("فتح القائمة", "Open menu")} aria-expanded={menu}>
              <span className="ms">menu</span>
            </button>
            <div className="ow-topbar__title">
              {section ? (
                <button
                  type="button"
                  className="ow-topbar__back"
                  onClick={() => (window.history.length > 1 ? router.back() : router.push(base + section.href + qs))}
                >
                  <span className="ms ms-sm" style={{ transform: ar ? "scaleX(-1)" : undefined }} aria-hidden>arrow_back</span>
                  {ar ? section.ar : section.en}
                </button>
              ) : (
                <strong>{current ? (ar ? current.ar : current.en) : ""}</strong>
              )}
            </div>
            <Link href={base + qs} className="ow-topbar__brand" aria-label={L("الرئيسية", "Home")}><BrandLogo size={24} /></Link>
            {!isPreview && <NotificationBell locale={locale} variant="portal" />}
            {!isPreview && (
              <Link href={`${base}/support?new=1`} className="ow-topbar__ticket" title={L("رفع تذكرة دعم", "Raise a ticket")}>
                <span className="ms">confirmation_number</span>
                <span className="ow-topbar__ticket-t">{L("تذكرة دعم", "Support ticket")}</span>
              </Link>
            )}
          </header>
          <main className="ow-main">
            <div className="route-fade" key={path}>{children}</div>
          </main>
          <footer className="ow-foot">
            {kind === "tenant"
              ? L("لأي استفسار عن عقدك أو دفعاتك تواصل معنا على 920007039 أو ارفع تذكرة دعم.", "Questions about your lease or payments? Call 920007039 or raise a support ticket.")
              : L("الأرقام محدّثة لحظياً من نظام إدارة الأملاك. لأي استفسار تواصل مع مدير حسابك أو على 920007039.", "Figures are live from our property-management system. Questions? Contact your account manager or call 920007039.")}
          </footer>
        </div>
      </div>

      {kind === "tenant" && (
        <nav className="ow-tabbar" aria-label={L("أقسام البوابة", "Portal sections")}>
          {nav.filter((n) => !(isPreview && n.self)).map((n) => {
            const on = isOn(n.href);
            return (
              <Link key={n.href} href={base + n.href + qs} className={on ? "is-on" : undefined} aria-current={on ? "page" : undefined}>
                <span className="ms">{n.icon}</span>
                {ar ? n.ar : n.en}
              </Link>
            );
          })}
        </nav>
      )}
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
