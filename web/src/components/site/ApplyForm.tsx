"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Turnstile } from "./Turnstile";

export function ApplyForm({ slug }: { slug: string }) {
  const t = useTranslations("site");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const cv = fd.get("cv");
    if (cv instanceof File && cv.size > 5 * 1024 * 1024) {
      setError(t("careers.cv"));
      return;
    }
    if (cv instanceof File && cv.size === 0) fd.delete("cv");
    if (tokenRef.current) fd.set("turnstile_token", tokenRef.current);
    setError(null);
    setState("sending");
    try {
      const res = await fetch(`/api/site/apply/${encodeURIComponent(slug)}`, { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j?.detail === "string" ? j.detail : t("form.error"));
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError(t("form.error"));
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="mk-form__done" role="status">
        <span className="ms" aria-hidden="true">check_circle</span>
        <p>{t("careers.submitted")}</p>
      </div>
    );
  }

  return (
    <form className="mk-form" onSubmit={onSubmit}>
      <div className="mk-form__row">
        <label className="mk-field">
          <span>{t("form.name")}</span>
          <input name="name" required minLength={2} maxLength={120} autoComplete="name" />
        </label>
        <label className="mk-field">
          <span>{t("form.email")}</span>
          <input name="email" type="email" required dir="ltr" maxLength={160} autoComplete="email" />
        </label>
      </div>
      <div className="mk-form__row">
        <label className="mk-field">
          <span>{t("form.phone")}</span>
          <input name="phone" type="tel" dir="ltr" maxLength={20} pattern="[+0-9 ()\-]{7,20}" autoComplete="tel" />
        </label>
        <label className="mk-field">
          <span>{t("careers.linkedin")}</span>
          <input name="linkedin" type="url" dir="ltr" maxLength={300} pattern="https://.*" placeholder="https://linkedin.com/in/…" />
        </label>
      </div>
      <label className="mk-field">
        <span>{t("careers.cv")}</span>
        <input
          name="cv"
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        />
      </label>
      <label className="mk-field">
        <span>{t("careers.coverLetter")}</span>
        <textarea name="cover_letter" rows={5} maxLength={6000} />
      </label>
      <label className="mk-hp" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <Turnstile onToken={(tok) => (tokenRef.current = tok)} />
      {error && <p className="mk-form__error" role="alert">{error}</p>}
      <div className="mk-form__foot">
        <button className="mk-btn mk-btn--primary" disabled={state === "sending"}>
          {state === "sending" ? t("form.sending") : t("careers.apply")}
        </button>
        <p className="mk-form__privacy">{t("form.privacy")}</p>
      </div>
    </form>
  );
}
