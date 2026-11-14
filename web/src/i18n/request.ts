import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";

import { cms } from "@/lib/cms";

import { defaultLocale, locales, type Locale } from "./config";

type Msgs = Record<string, unknown>;

/** Website editors can override any public-site text (Website → Website texts).
 *  Overrides replace a string at `site.<key>` only where a string already exists,
 *  so a bad key can never break the message structure. */
function applyOverrides(messages: Msgs, texts: Record<string, { ar?: string | null; en?: string | null }> | undefined, locale: string): Msgs {
  if (!texts || Object.keys(texts).length === 0) return messages;
  const out = structuredClone(messages) as Msgs;
  for (const [key, val] of Object.entries(texts)) {
    const text = (locale === "ar" ? val?.ar : val?.en)?.trim();
    if (!text) continue;
    const parts = ["site", ...key.split(".")];
    let node: Msgs = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const next = node[parts[i]];
      if (!next || typeof next !== "object") { node = {} as Msgs; break; }
      node = next as Msgs;
    }
    const last = parts[parts.length - 1];
    if (typeof node[last] === "string") node[last] = text;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = (locales as readonly string[]).includes(requested ?? "")
    ? (requested as Locale)
    : defaultLocale;

  if (!locales.includes(locale as Locale)) notFound();

  const base = (await import(`../../messages/${locale}.json`)).default as Msgs;
  let messages = base;
  try {
    const site = await cms.site();
    messages = applyOverrides(base, site.texts, locale);
  } catch {
    /* CMS unreachable — defaults */
  }
  return { locale, messages: messages as import("next-intl").AbstractIntlMessages };
});
