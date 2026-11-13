"use client";

import { useEffect } from "react";

/** Fallback for browsers without CSS :has() — unlocks document scrolling
 *  while a public page is mounted (see site.css). */
export function SitePageScroll() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("mk-public");
    return () => html.classList.remove("mk-public");
  }, []);
  return null;
}
