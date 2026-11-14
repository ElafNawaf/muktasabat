"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { fetchNotifications, markNotificationsRead, type Notice } from "@/lib/notification-actions";

const T = (l: string, ar: string, en: string) => (l === "ar" ? ar : en);
const KIND: Record<string, [string, string]> = {
  attendance: ["الحضور", "Attendance"],
  approval: ["الموافقات", "Approvals"],
  ticket: ["الدعم", "Support"],
  maintenance: ["الصيانة", "Maintenance"],
  payment: ["الدفعات", "Payments"],
  hr: ["الموارد البشرية", "HR"],
  lease: ["العقود", "Leases"],
};

function ago(locale: string, iso: string) {
  const d = (Date.now() - new Date(iso + (iso.endsWith("Z") || iso.includes("+") ? "" : "Z")).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar" : "en", { numeric: "auto" });
  if (Math.abs(d) < 60) return rtf.format(0, "minute");
  if (Math.abs(d) < 3600) return rtf.format(-Math.round(d / 60), "minute");
  if (Math.abs(d) < 86400) return rtf.format(-Math.round(d / 3600), "hour");
  return rtf.format(-Math.round(d / 86400), "day");
}

/** Bell + panel listing everything that needs the user (see api/routers/notifications.py). */
export function NotificationBell({ locale, variant = "staff" }: { locale: string; variant?: "staff" | "portal" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [, start] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);
  const prev = useRef(0);
  const [ping, setPing] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchNotifications(locale);
    setItems(r.items);
    setUnread(r.unread);
    if (r.unread > prev.current) {
      setPing(true);
      window.setTimeout(() => setPing(false), 1600);
    }
    prev.current = r.unread;
  }, [locale]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markRead = (keys: string[], all = false) => {
    setItems((xs) => xs.map((x) => (all || keys.includes(x.key) ? { ...x, read: true } : x)));
    setUnread((u) => (all ? 0 : Math.max(0, u - keys.filter((k) => items.find((x) => x.key === k && !x.read)).length)));
    start(() => markNotificationsRead(keys, all, locale));
  };

  const go = (n: Notice) => {
    if (!n.read) markRead([n.key]);
    setOpen(false);
    if (n.href) router.push(n.href);
  };

  const shown = tab === "unread" ? items.filter((i) => !i.read) : items;
  const label = T(locale, "الإشعارات", "Notifications");

  return (
    <div className={`nb nb--${variant}`} ref={wrap}>
      <button
        type="button"
        className={`nb__btn${ping ? " is-ping" : ""}${unread ? " has-unread" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `${label} (${unread})` : label}
        aria-expanded={open}
        title={label}
      >
        <span className="ms">{unread ? "notifications_active" : "notifications"}</span>
        {unread > 0 && <span className="nb__count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="nb__panel" role="dialog" aria-label={label}>
          <header className="nb__head">
            <div>
              <strong>{label}</strong>
              <small>{unread ? T(locale, `${unread} غير مقروء`, `${unread} unread`) : T(locale, "لا جديد", "All caught up")}</small>
            </div>
            {unread > 0 && (
              <button type="button" className="nb__all" onClick={() => markRead([], true)}>
                <span className="ms ms-sm">done_all</span>{T(locale, "تحديد الكل كمقروء", "Mark all read")}
              </button>
            )}
          </header>
          <div className="nb__tabs" role="tablist">
            <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "is-on" : undefined} onClick={() => setTab("all")}>{T(locale, "الكل", "All")} <b>{items.length}</b></button>
            <button role="tab" aria-selected={tab === "unread"} className={tab === "unread" ? "is-on" : undefined} onClick={() => setTab("unread")}>{T(locale, "غير المقروءة", "Unread")} <b>{unread}</b></button>
          </div>
          <ul className="nb__list">
            {shown.length === 0 && (
              <li className="nb__empty">
                <span className="ms">notifications_off</span>
                <p>{tab === "unread" ? T(locale, "قرأت كل الإشعارات.", "You've read everything.") : T(locale, "لا توجد إشعارات حالياً.", "No notifications right now.")}</p>
              </li>
            )}
            {shown.map((n, i) => (
              <li key={n.key} style={{ ["--i" as string]: Math.min(i, 12) }}>
                <button type="button" className={`nb__item nb--${n.tone}${n.read ? " is-read" : ""}${n.urgent && !n.read ? " is-urgent" : ""}`} onClick={() => go(n)}>
                  <span className="nb__icon"><span className="ms">{n.icon}</span></span>
                  <span className="nb__text">
                    <strong>{n.title}</strong>
                    {n.body && <span>{n.body}</span>}
                    <small>{KIND[n.kind] ? T(locale, ...KIND[n.kind]) : ""} · {ago(locale, n.at)}</small>
                  </span>
                  {!n.read && <span className="nb__dot" aria-label={T(locale, "غير مقروء", "Unread")} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
