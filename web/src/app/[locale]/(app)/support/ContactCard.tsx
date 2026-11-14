"use client";

import { useEffect, useState } from "react";

export type SupportContactInfo = { phone?: string | null; whatsapp?: string | null; email?: string | null };

const T = (l: string, ar: string, en: string) => (l === "ar" ? ar : en);
// Office hours: Saturday–Thursday, 09:00–21:00 Riyadh time (Friday closed).
const OPEN_H = 9;
const CLOSE_H = 21;
const DAYS = [6, 0, 1, 2, 3, 4, 5]; // Sat → Fri (JS weekday numbers)

function riyadhNow() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")?.value ?? "Sun");
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { wd, h, m };
}

function digits(v: string) {
  const d = v.replace(/\D/g, "");
  return d.startsWith("0") ? "966" + d.slice(1) : d;
}

/** "Contact us" card on Help & support: live open/closed state, call / WhatsApp / email, weekly hours. */
export function ContactCard({ locale, info }: { locale: string; info?: SupportContactInfo }) {
  const phone = info?.phone?.trim() || "920007039";
  const wa = info?.whatsapp?.trim() || null;
  const email = info?.email?.trim() || null;
  const [now, setNow] = useState<{ wd: number; h: number; m: number } | null>(null);
  useEffect(() => {
    setNow(riyadhNow());
    const id = window.setInterval(() => setNow(riyadhNow()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const isOpen = !!now && now.wd !== 5 && now.h >= OPEN_H && now.h < CLOSE_H;
  const dayName = (wd: number, style: "short" | "long" = "short") =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { weekday: style }).format(new Date(2026, 10, 15 + ((wd - 0 + 7) % 7)));
  const opensText = () => {
    if (!now) return "";
    if (isOpen) {
      const left = (CLOSE_H - now.h) * 60 - now.m;
      return left <= 60 ? T(locale, `يغلق بعد ${left} دقيقة`, `Closes in ${left} min`) : T(locale, "حتى 9 مساءً", "Until 9 pm");
    }
    const sameDay = now.wd !== 5 && now.h < OPEN_H;
    if (sameDay) return T(locale, "يفتح اليوم 9 صباحاً", "Opens today at 9 am");
    const next = now.wd === 4 && now.h >= CLOSE_H ? 6 : (now.wd + 1) % 7 === 5 ? 6 : (now.wd + 1) % 7;
    return T(locale, `يفتح ${dayName(next, "long")} 9 صباحاً`, `Opens ${dayName(next, "long")} at 9 am`);
  };
  const waText = encodeURIComponent(T(locale, "مرحباً، أحتاج مساعدة بخصوص بوابة مكتسبات.", "Hello, I need help with the Muktasabat portal."));

  return (
    <section className="cc" aria-labelledby="cc-h">
      <header className="cc__head">
        <span className="cc__avatar" aria-hidden="true"><span className="ms">support_agent</span></span>
        <div>
          <h3 id="cc-h">{T(locale, "تواصل معنا", "Contact us")}</h3>
          <p>{T(locale, "فريق الدعم جاهز لمساعدتك", "Our support team is here to help")}</p>
        </div>
        {now && (
          <span className={`cc__status${isOpen ? " is-open" : ""}`}>
            <i aria-hidden="true" />
            {isOpen ? T(locale, "متاح الآن", "Available now") : T(locale, "خارج أوقات العمل", "Closed now")}
          </span>
        )}
      </header>

      <div className="cc__actions">
        <a className="cc__act cc__act--call" href={`tel:${phone.replace(/\s/g, "")}`}>
          <span className="cc__icon"><span className="ms">call</span></span>
          <span className="cc__txt">
            <small>{T(locale, "اتصال مباشر", "Call us")}</small>
            <strong dir="ltr">{phone}</strong>
          </span>
          <span className="ms cc__go flip-rtl" aria-hidden="true">arrow_forward</span>
        </a>
        {wa && (
          <a className="cc__act cc__act--wa" href={`https://wa.me/${digits(wa)}?text=${waText}`} target="_blank" rel="noopener noreferrer">
            <span className="cc__icon">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.06c-.24.68-1.42 1.3-1.95 1.34-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.92-4.66-4.1-.13-.18-1.11-1.48-1.11-2.83s.71-2 .96-2.28c.25-.27.55-.34.73-.34l.52.01c.17.01.39-.06.61.47.24.56.79 1.94.86 2.08.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.35-.41.47-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.9 1.05.93 1.93 1.22 2.2 1.36.27.14.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.66-.17 1.33Z"/></svg>
            </span>
            <span className="cc__txt">
              <small>{T(locale, "محادثة واتساب", "WhatsApp chat")}</small>
              <strong>{T(locale, "ابدأ المحادثة", "Start a chat")}</strong>
            </span>
            <span className="ms cc__go flip-rtl" aria-hidden="true">arrow_forward</span>
          </a>
        )}
        {email && (
          <a className="cc__act cc__act--mail" href={`mailto:${email}`}>
            <span className="cc__icon"><span className="ms">mail</span></span>
            <span className="cc__txt">
              <small>{T(locale, "البريد الإلكتروني", "Email")}</small>
              <strong dir="ltr">{email}</strong>
            </span>
            <span className="ms cc__go flip-rtl" aria-hidden="true">arrow_forward</span>
          </a>
        )}
      </div>

      <div className="cc__hours">
        <div className="cc__hours-h">
          <span className="ms ms-sm">schedule</span>
          <strong>{T(locale, "أوقات العمل", "Office hours")}</strong>
          <small>{opensText()}</small>
        </div>
        <ol className="cc__week">
          {DAYS.map((d) => (
            <li key={d} className={`${d === 5 ? "is-off" : ""}${now?.wd === d ? " is-today" : ""}`} title={d === 5 ? T(locale, "مغلق", "Closed") : "9:00–21:00"}>
              <span title={dayName(d, "long")}>{locale === "ar" ? new Intl.DateTimeFormat("ar-SA", { weekday: "narrow" }).format(new Date(2026, 10, 15 + d)) : dayName(d)}</span>
              <i aria-hidden="true" />
            </li>
          ))}
        </ol>
        <p className="cc__range">{T(locale, "السبت – الخميس · 9 صباحاً – 9 مساءً · الجمعة مغلق", "Sat – Thu · 9 am – 9 pm · Friday closed")}</p>
      </div>
    </section>
  );
}
