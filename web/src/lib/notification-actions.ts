"use server";

import { api } from "./api";

export type Notice = {
  key: string;
  kind: string;
  icon: string;
  tone: "ok" | "bad" | "soon" | "info";
  title: string;
  body?: string | null;
  at: string;
  href?: string | null;
  urgent: boolean;
  read: boolean;
};

export async function fetchNotifications(locale: string): Promise<{ items: Notice[]; unread: number }> {
  try {
    return await api.get<{ items: Notice[]; unread: number }>(`/api/v1/notifications?locale=${locale === "en" ? "en" : "ar"}`);
  } catch {
    return { items: [], unread: 0 };
  }
}

export async function markNotificationsRead(keys: string[], all = false, locale = "ar"): Promise<void> {
  try {
    await api.post(`/api/v1/notifications/read?locale=${locale === "en" ? "en" : "ar"}`, { keys: keys.slice(0, 200), all });
  } catch {
    /* best effort */
  }
}
