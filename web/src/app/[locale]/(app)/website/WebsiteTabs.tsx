"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function WebsiteTabs({ locale, tabs }: { locale: string; tabs: { href: string; label: string; icon: string; badge?: number }[] }) {
  const path = usePathname();
  const nav = useRef<HTMLElement>(null);
  // On narrow screens the strip scrolls: keep the current section in view.
  useEffect(() => {
    const on = nav.current?.querySelector<HTMLElement>(".is-on");
    on?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);
  return (
    <nav ref={nav} className="cms-tabs" aria-label="Website sections">
      {tabs.map((t) => {
        const href = `/${locale}/website/${t.href}`;
        const on = path === href || path.startsWith(href + "/");
        return (
          <Link key={t.href} href={href} className={on ? "is-on" : undefined} aria-current={on ? "page" : undefined}>
            <span className="ms">{t.icon}</span>
            {t.label}
            {t.badge ? <span className="cms-count cms-count--hot">{t.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
