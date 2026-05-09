"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Ctx = { open: boolean; toggle: () => void; close: () => void };

const MobileNavCtx = createContext<Ctx | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change so the user actually sees the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open on phone.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("mobile-nav-open", open);
    return () => document.body.classList.remove("mobile-nav-open");
  }, [open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <MobileNavCtx.Provider value={{ open, toggle, close }}>{children}</MobileNavCtx.Provider>
  );
}

export function useMobileNav() {
  const ctx = useContext(MobileNavCtx);
  if (!ctx) {
    // Allow Topbar etc. to render outside an app shell (e.g. on auth pages).
    return { open: false, toggle: () => {}, close: () => {} };
  }
  return ctx;
}

export function MobileNavBackdrop() {
  const { open, close } = useMobileNav();
  if (!open) return null;
  return (
    <button
      type="button"
      aria-label="Close menu"
      onClick={close}
      className="mobile-nav-backdrop"
    />
  );
}
