"use client";

import { useEffect, useState } from "react";

/** URL query parameters, read once after mount (deep links such as /payments?contract=12&status=overdue). */
export function useQuery(): Record<string, string> {
  const [q, setQ] = useState<Record<string, string>>({});
  useEffect(() => {
    setQ(Object.fromEntries(new URLSearchParams(window.location.search).entries()));
  }, []);
  return q;
}

/** Drop query parameters from the address bar without a navigation (after "Clear filter"). */
export function clearQuery(keys: string[]) {
  const url = new URL(window.location.href);
  keys.forEach((k) => url.searchParams.delete(k));
  window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
}
