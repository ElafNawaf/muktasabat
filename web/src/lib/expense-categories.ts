/** Expense category codes stored in the API / database. */
export const EXPENSE_CATEGORIES = [
  "maintenance",
  "utilities",
  "insurance",
  "legal",
  "marketing",
  "cleaning",
  "security",
  "government_fees",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Per-category color + Material Symbols icon, ported from the prototype's `CAT`
 * map so category badges read at a glance. Keyed on the API category codes
 * (note `government_fees`, which the prototype called `government`).
 */
export const CATEGORY_META: Record<string, { color: string; icon: string }> = {
  maintenance: { color: "#7B1A1A", icon: "build" },
  utilities: { color: "#2563eb", icon: "bolt" },
  insurance: { color: "#0891b2", icon: "shield" },
  legal: { color: "#7c3aed", icon: "gavel" },
  marketing: { color: "#db2777", icon: "campaign" },
  cleaning: { color: "#0d9488", icon: "cleaning_services" },
  security: { color: "#475569", icon: "security" },
  government_fees: { color: "#854d0e", icon: "account_balance" },
  other: { color: "#6b7280", icon: "more_horiz" },
};

export function categoryMeta(code: string): { color: string; icon: string } {
  return CATEGORY_META[code] ?? CATEGORY_META.other;
}
