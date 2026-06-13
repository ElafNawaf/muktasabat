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
