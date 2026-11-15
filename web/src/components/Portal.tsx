"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Renders full-screen overlays at <body> so they sit above the sidebar, not inside the main column's layer. */
export function Portal({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}
