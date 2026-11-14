import type { TicketPriority, TicketStatus } from "./types";

export const STATUS_BADGE: Record<TicketStatus, string> = {
  open: "badge-info",
  in_progress: "badge-primary",
  waiting_user: "badge-warning",
  resolved: "badge-success",
  closed: "badge-neutral",
};

export const PRIORITY_BADGE: Record<TicketPriority, string> = {
  low: "badge-neutral",
  normal: "badge-info",
  high: "badge-warning",
  urgent: "badge-danger",
};

export const CATEGORY_ICON: Record<string, string> = {
  technical: "bug_report",
  account: "manage_accounts",
  data: "database",
  billing: "receipt_long",
  feature: "lightbulb",
  other: "help",
};
