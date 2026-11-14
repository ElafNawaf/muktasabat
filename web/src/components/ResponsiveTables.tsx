"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Phones: every staff `.tbl` becomes a stack of cards (CSS in globals.css,
 * `.tbl[data-cards]`). This labels each cell with its column header so the
 * card can show "Amount  SAR 9,000" instead of a bare value, and re-labels
 * when rows change (filters, paging). Tables that already label their own
 * cells, or opt out with `data-nocards`, are left alone.
 */
export function ResponsiveTables() {
  const path = usePathname();
  useEffect(() => {
    const label = () => {
      document.querySelectorAll<HTMLTableElement>(".main table.tbl:not([data-nocards])").forEach((tbl) => {
        const heads = [...tbl.querySelectorAll("thead th")].map((th) => (th.textContent || "").trim());
        if (heads.length < 3) return;
        const own = tbl.querySelector("td[data-label]:not([data-auto])");
        if (own) return; // table has its own mobile layout
        tbl.setAttribute("data-cards", "");
        tbl.querySelectorAll("tbody tr").forEach((tr) => {
          let i = 0;
          tr.querySelectorAll(":scope > td").forEach((td) => {
            const span = Number(td.getAttribute("colspan") || 1);
            const h = heads[i] || "";
            if (span > 1) td.setAttribute("data-span", "");
            if (h && !td.hasAttribute("data-label")) {
              td.setAttribute("data-label", h);
              td.setAttribute("data-auto", "");
            }
            i += span;
          });
        });
      });
    };
    label();
    const mo = new MutationObserver(() => label());
    const main = document.querySelector(".main");
    if (main) mo.observe(main, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [path]);
  return null;
}
