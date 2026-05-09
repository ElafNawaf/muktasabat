"use client";

import { useLayoutEffect } from "react";

/** Syncs <html> lang/dir after navigation because the root layout cannot read [locale] params. */
export function LocaleDocument({
  locale,
  dir,
}: {
  locale: string;
  dir: "ltr" | "rtl";
}) {
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = dir;
  }, [locale, dir]);

  return null;
}
