/** Format an amount as locale-aware integer SAR (matches prototype's formatSAR). */
export function formatSAR(amount: number, locale: string = "en"): string {
  const lc = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.NumberFormat(lc, { maximumFractionDigits: 0 }).format(Math.round(amount));
}

export function formatPercent(value: number, locale: string = "en"): string {
  const lc = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.NumberFormat(lc, { maximumFractionDigits: 1 }).format(value) + "%";
}

/**
 * Format a date string for display.
 *
 * Critical: uses `timeZone: "UTC"` so the output matches between the server
 * (Node, usually UTC) and the browser (user's local TZ). Without this lock
 * a timestamp near midnight UTC renders as a different day on each side and
 * triggers React hydration errors (#425 / "text content does not match").
 *
 * `iso` may be a full ISO timestamp or a YYYY-MM-DD date — both are treated
 * as the calendar day in UTC.
 */
export function formatDate(iso: string, locale: string = "en"): string {
  if (!iso) return "—";
  // ar-SA alone uses the Hijri calendar in many browsers but Gregorian in Node,
  // which causes hydration mismatches. Match the prototype: force Gregorian + Latin digits.
  const lc =
    locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US";
  return new Intl.DateTimeFormat(lc, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/**
 * Date + time, pinned to Riyadh time on both server and browser so SSR and
 * hydration render the same string.
 */
export function formatDateTime(iso: string | null | undefined, locale: string = "en"): string {
  if (!iso) return "—";
  // API datetimes are naive UTC; make that explicit before parsing.
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z");
  const lc = locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
  return new Intl.DateTimeFormat(lc, {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Money with a text currency label ("12,500 ر.س" / "SAR 12,500").
 * Intl's `style: "currency"` now emits the new Saudi riyal sign (U+20C1) in
 * Safari, which our fonts don't carry, so we never use it for SAR.
 */
export function sarText(
  amount: number | null | undefined,
  locale: string = "en",
  opts: { digits?: number; compact?: boolean } = {},
): string {
  const v = amount ?? 0;
  const digits = opts.digits ?? 0;
  const n = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    notation: opts.compact && Math.abs(v) >= 1_000_000 ? "compact" : "standard",
  }).format(v);
  return locale === "ar" ? `${n} ر.س` : `SAR ${n}`;
}
