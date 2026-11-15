"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { usePortalNav } from "./PortalNav";
import { useTheme } from "./ThemeProvider";

type Cmd = { id: string; label: string; hint: string; icon: string; run: () => void; keywords?: string };

/** Arabic-insensitive matching: strip tashkeel/tatweel and unify alef/yaa/taa marbuta. */
function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

/**
 * ⌘K / Ctrl K palette: jump to any page the user can open, switch language or
 * theme. Keyboard first (↑ ↓ Enter Esc), works with the mouse too.
 */
export function CommandPalette() {
  const { items, paletteOpen, setPaletteOpen } = usePortalNav();
  const router = useRouter();
  const pathname = usePathname() || "";
  const locale = useLocale();
  const ar = locale === "ar";
  const { toggle } = useTheme();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  // Global shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, setPaletteOpen]);

  useEffect(() => {
    if (paletteOpen) {
      setQ("");
      setSel(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [paletteOpen]);

  const commands: Cmd[] = useMemo(() => {
    const go = (href: string) => () => {
      setPaletteOpen(false);
      router.push(href);
    };
    const other = ar ? "en" : "ar";
    return [
      ...items.map((it) => ({ id: it.id, label: it.label, hint: it.section, icon: it.icon, run: go(it.href), keywords: it.id })),
      {
        id: "lang",
        label: ar ? "English" : "العربية",
        hint: ar ? "تغيير اللغة" : "Switch language",
        icon: "translate",
        run: go(pathname.replace(new RegExp(`^/${locale}(?=/|$)`), `/${other}`)),
        keywords: "language لغة english arabic",
      },
      {
        id: "theme",
        label: ar ? "تبديل الوضع الليلي / النهاري" : "Toggle dark / light mode",
        hint: ar ? "المظهر" : "Appearance",
        icon: "contrast",
        run: () => {
          setPaletteOpen(false);
          toggle();
        },
        keywords: "theme dark light مظهر ليلي",
      },
      {
        id: "site",
        label: ar ? "فتح الموقع العام" : "Open the public website",
        hint: "mrc.sa",
        icon: "open_in_new",
        run: () => {
          setPaletteOpen(false);
          window.open(`/${locale}`, "_blank", "noopener");
        },
        keywords: "website site موقع",
      },
    ];
  }, [items, ar, locale, pathname, router, setPaletteOpen, toggle]);

  const shown = useMemo(() => {
    const n = norm(q);
    if (!n) return commands;
    return commands.filter((c) => norm(`${c.label} ${c.hint} ${c.keywords ?? ""}`).includes(n));
  }, [commands, q]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!paletteOpen) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(shown.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      shown[sel]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setPaletteOpen(false);
    }
  }

  return (
    <div className="cmdk-overlay" onMouseDown={() => setPaletteOpen(false)}>
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label={ar ? "الانتقال السريع" : "Quick navigation"}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="cmdk-input">
          <span className="ms" aria-hidden>search</span>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={ar ? "اكتب اسم صفحة أو أمر…" : "Type a page or command…"}
            aria-controls="cmdk-list"
            aria-activedescendant={shown[sel] ? `cmdk-${shown[sel].id}` : undefined}
            role="combobox"
            aria-expanded="true"
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <ul className="cmdk-list" id="cmdk-list" role="listbox" ref={list}>
          {shown.length === 0 ? (
            <li className="cmdk-empty">{ar ? "لا توجد نتائج. جرّب كلمة أخرى." : "No matches. Try another word."}</li>
          ) : (
            shown.map((c, i) => (
              <li
                key={c.id}
                id={`cmdk-${c.id}`}
                data-i={i}
                role="option"
                aria-selected={i === sel}
                className={i === sel ? "is-sel" : undefined}
                onMouseMove={() => setSel(i)}
                onClick={() => c.run()}
              >
                <span className="cmdk-ico" aria-hidden><span className="ms ms-sm">{c.icon}</span></span>
                <span className="cmdk-label">{c.label}</span>
                <span className="cmdk-hint">{c.hint}</span>
              </li>
            ))
          )}
        </ul>
        <div className="cmdk-foot">
          <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> {ar ? "للتنقل" : "to move"}</span>
          <span><kbd className="kbd">Enter</kbd> {ar ? "للفتح" : "to open"}</span>
        </div>
      </div>
    </div>
  );
}
