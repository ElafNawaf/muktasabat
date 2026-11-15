"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";

/** Props that make a table row open a details page.
 *  Clicks on links, buttons and form fields inside the row keep their own action;
 *  Ctrl/⌘-click opens a new tab; Enter opens it from the keyboard. */
export function useRowLink() {
  const router = useRouter();
  return (href: string | null | undefined, extraClass = "") => {
    if (!href) return {};
    const go = (newTab: boolean) => (newTab ? window.open(href, "_blank", "noopener") : router.push(href));
    return {
      className: `tr-link ${extraClass}`.trim(),
      tabIndex: 0,
      "data-href": href,
      onClick: (e: MouseEvent<HTMLElement>) => {
        if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label,[data-no-row]")) return;
        if (window.getSelection()?.toString()) return; // selecting text, not opening
        go(e.metaKey || e.ctrlKey);
      },
      onAuxClick: (e: MouseEvent<HTMLElement>) => { if (e.button === 1) go(true); },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => { if (e.key === "Enter" && e.target === e.currentTarget) go(false); },
    };
  };
}
