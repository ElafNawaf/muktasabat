"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Turnstile } from "./Turnstile";

const KINDS = ["owner", "investor", "tenant", "partner", "general"] as const;

export function LeadForm({ locale, defaultKind = "owner", sourcePage }: { locale: string; defaultKind?: (typeof KINDS)[number]; sourcePage?: string }) {
  const t = useTranslations("site.form");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries()) as Record<string, string>;
    if (!body.phone && !body.email) {
      setError(t("needContact"));
      return;
    }
    setError(null);
    setState("sending");
    try {
      const res = await fetch("/api/site/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          locale,
          source_page: sourcePage ?? window.location.pathname,
          turnstile_token: tokenRef.current,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j?.detail === "string" ? j.detail : t("error"));
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setError(t("error"));
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="mk-form__done" role="status">
        <span className="ms" aria-hidden="true">check_circle</span>
        <p>{t("success")}</p>
      </div>
    );
  }

  return (
    <form className="mk-form" onSubmit={onSubmit} noValidate={false}>
      <fieldset className="mk-chips">
        <legend>{t("iAm")}</legend>
        {KINDS.map((k) => (
          <label key={k} className="mk-chip">
            <input type="radio" name="kind" value={k} defaultChecked={k === defaultKind} />
            <span>{t(k)}</span>
          </label>
        ))}
      </fieldset>

      <div className="mk-form__row">
        <label className="mk-field">
          <span>{t("name")}</span>
          <input name="name" required minLength={2} maxLength={120} autoComplete="name" />
        </label>
        <label className="mk-field">
          <span>{t("phone")}</span>
          <input name="phone" type="tel" inputMode="tel" dir="ltr" maxLength={20} pattern="[+0-9 ()\-]{7,20}" autoComplete="tel" placeholder="+966 5x xxx xxxx" />
        </label>
      </div>
      <div className="mk-form__row">
        <label className="mk-field">
          <span>{t("email")}</span>
          <input name="email" type="email" dir="ltr" maxLength={160} autoComplete="email" />
        </label>
        <label className="mk-field">
          <span>{t("city")}</span>
          <input name="city" maxLength={80} autoComplete="address-level2" />
        </label>
      </div>
      <label className="mk-field">
        <span>{t("message")}</span>
        <textarea name="message" rows={4} maxLength={4000} />
      </label>

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <label className="mk-hp" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>

      <Turnstile onToken={(tok) => (tokenRef.current = tok)} />

      {error && <p className="mk-form__error" role="alert">{error}</p>}
      <div className="mk-form__foot">
        <button className="mk-btn mk-btn--primary" disabled={state === "sending"}>
          {state === "sending" ? t("sending") : t("submit")}
        </button>
        <p className="mk-form__privacy">{t("privacy")}</p>
      </div>
    </form>
  );
}
