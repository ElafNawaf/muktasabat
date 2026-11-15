"use client";

import type { ReactNode } from "react";

import { useRowLink } from "@/lib/row-link";

/** A table row that opens `href` — for server components that can't use hooks. */
export function ClickRow({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const row = useRowLink();
  return <tr {...row(href, className ?? "")}>{children}</tr>;
}
