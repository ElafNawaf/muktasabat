"use client";

import dynamic from "next/dynamic";

import type { Dot, Zone } from "./ZoneMapInner";

export type { Dot, Zone };

/** Map of attendance zones; Leaflet only loads in the browser. */
export const ZoneMap = dynamic(() => import("./ZoneMapInner"), {
  ssr: false,
  loading: () => <div className="zm-loading" aria-hidden />,
});
