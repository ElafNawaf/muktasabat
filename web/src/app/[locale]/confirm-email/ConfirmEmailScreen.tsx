"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggleButton } from "@/components/ThemeToggleButton";
import { confirmEmailChange } from "@/lib/account-actions";

type Status = "working" | "success" | "invalid" | "missing";

/**
 * Landing page for the "confirm your new email" link. Confirmation happens via
 * a POST after render (not on GET) so link scanners in mail clients can't
 * consume the one-time token.
 */
export function ConfirmEmailScreen() {
  const t = useTranslations("confirmEmailPage");
  const locale = useLocale();
  const otherLocale = locale === "en" ? "ar" : "en";
  const token = useSearchParams().get("token");
  const [status, setStatus] = useState<Status>(token ? "working" : "missing");
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (!token || fired.current) return;
    fired.current = true; // StrictMode runs effects twice in dev; the token is single-use.
    confirmEmailChange(token).then((res) => {
      if (res.ok) {
        setEmail(res.data.email);
        setStatus("success");
      } else {
        setMessage(res.error);
        setStatus("invalid");
      }
    });
  }, [token]);

  return (
    <div className="login-page">
      <div className="login-pattern" />
      <ThemeToggleButton />
      <Link
        className="lang-toggle login-lang"
        href={`/${otherLocale}/confirm-email${token ? `?token=${encodeURIComponent(token)}` : ""}`}
      >
        {locale === "en" ? "العربية" : "English"}
      </Link>

      <div className="login-card screen-enter" style={{ textAlign: "center" }}>
        <div className="brand-block">
          <div className="brand-mark" style={{ width: 56, height: 56, borderRadius: 14 }}>
            <BrandLogo size={42} />
          </div>
          <h1>شركة مكتسبات العقارية</h1>
          <div className="en-name">Muktasabat Real Estate</div>
        </div>

        <h2 style={{ margin: "8px 0 0", fontSize: "1.25rem" }}>{t("title")}</h2>

        {status === "working" && (
          <div style={{ padding: 24 }}>
            <span className="ms" style={{ fontSize: 36, animation: "spin 0.8s linear infinite" }}>
              progress_activity
            </span>
            <p style={{ color: "var(--color-text-secondary)", marginTop: 12 }}>{t("working")}</p>
          </div>
        )}

        {status === "success" && (
          <div style={{ padding: 24 }}>
            <span className="ms" style={{ fontSize: 48, color: "var(--color-success)" }}>
              mark_email_read
            </span>
            <p style={{ marginTop: 12, fontWeight: 500 }}>{t("success")}</p>
            {email && <p className="mono" style={{ fontSize: 13.5 }}>{email}</p>}
            <Link className="btn btn-primary" href={`/${locale}/account`} style={{ marginTop: 16, height: 42, fontSize: 14 }}>
              {t("goToAccount")}
            </Link>
          </div>
        )}

        {(status === "invalid" || status === "missing") && (
          <div style={{ padding: 24 }}>
            <span className="ms" style={{ fontSize: 48, color: "var(--color-danger)" }}>
              error
            </span>
            <p style={{ marginTop: 12, fontWeight: 500 }}>{t("invalid")}</p>
            <p style={{ color: "var(--color-text-secondary)", fontSize: 13.5 }}>{message ?? t("invalidHint")}</p>
            <Link className="btn btn-secondary" href={`/${locale}/account`} style={{ marginTop: 16, height: 42, fontSize: 14 }}>
              {t("goToAccount")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
