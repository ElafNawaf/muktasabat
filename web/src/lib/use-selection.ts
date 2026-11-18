"use client";

import { useCallback, useMemo, useState } from "react";

/** Row selection for a list. Only rows currently shown count (filters narrow the selection). */
export function useSelection(visibleIds: number[]) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const ids = useMemo(() => visibleIds.filter((id) => picked.has(id)), [visibleIds, picked]);
  const all = visibleIds.length > 0 && ids.length === visibleIds.length;
  const toggle = useCallback((id: number) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const toggleAll = useCallback(() => setPicked(all ? new Set() : new Set(visibleIds)), [all, visibleIds]);
  const clear = useCallback(() => setPicked(new Set()), []);
  return { ids, count: ids.length, total: visibleIds.length, all, some: ids.length > 0 && !all, has: (id: number) => picked.has(id), toggle, toggleAll, clear };
}
export type Selection = ReturnType<typeof useSelection>;
