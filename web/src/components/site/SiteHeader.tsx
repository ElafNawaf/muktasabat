"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";

type NavLink = { href: string; label: string };

export function SiteHeader({
  locale,
  brand,
  logoUrl,
  links,
  portalLabel,
  langLabel,
  menuLabel,
  closeLabel,
}: {
  locale: string;
  brand: string;
  logoUrl?: string | null;
  links: NavLink[];
  portalLabel: string;
  langLabel: string;
  menuLabel: string;
  closeLabel: string;
}) {
  const pathname = usePathname() || `/${locale}`;
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [overHero, setOverHero] = useState(false);
  const other = locale === "ar" ? "en" : "ar";
  const switchHref = pathname.replace(new RegExp(`^/${locale}(?=/|$)`), `/${other}`);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    setOverHero(!!document.querySelector("[data-hero-dark]"));
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) =>
    href === `/${locale}` ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <header className={`mk-header${scrolled ? " is-scrolled" : ""}${overHero && !scrolled && !open ? " is-over" : ""}${open ? " is-menu" : ""}`}>
      <div className="mk-wrap mk-header__bar">
        <Link href={`/${locale}`} className="mk-brand" aria-label={brand}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="mk-brand__logo" />
          ) : (
            <span className="mk-brand__mark" aria-hidden="true"><BrandLogo size={30} /></span>
          )}
          <span className="mk-brand__name">{brand}</span>
        </Link>

        <nav className="mk-nav" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={isActive(l.href) ? "is-active" : undefined} aria-current={isActive(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="mk-header__actions">
          <Link href={switchHref} hrefLang={other} className="mk-lang" lang={other}>
            {langLabel}
          </Link>
          <Link href={`/${locale}/login`} className="mk-btn mk-btn--primary mk-btn--sm">
            {portalLabel}
          </Link>
          <button
            type="button"
            className="mk-burger"
            aria-expanded={open}
            aria-controls="mk-drawer"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="ms" aria-hidden="true">{open ? "close" : "menu"}</span>
            <span className="mk-sr">{open ? closeLabel : menuLabel}</span>
          </button>
        </div>
      </div>

      <div id="mk-drawer" className={`mk-drawer${open ? " is-open" : ""}`} hidden={!open}>
        <nav aria-label="Mobile">
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          <Link href={`/${locale}/login`} className="mk-btn mk-btn--primary">
            {portalLabel}
          </Link>
          <Link href={switchHref} hrefLang={other} lang={other} className="mk-drawer__lang">
            {langLabel}
          </Link>
        </nav>
      </div>
    </header>
  );
}
