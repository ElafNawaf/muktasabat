/** Format an amount as locale-aware integer SAR (matches prototype's formatSAR). */
export function formatSAR(amount: number, locale: string = "en"): string {
  const lc = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.NumberFormat(lc, { maximumFractionDigits: 0 }).format(Math.round(amount));
}

export function formatPercent(value: number, locale: string = "en"): string {
  const lc = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.NumberFormat(lc, { maximumFractionDigits: 1 }).format(value) + "%";
}
