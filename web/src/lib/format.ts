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
  const lc = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.DateTimeFormat(lc, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}
