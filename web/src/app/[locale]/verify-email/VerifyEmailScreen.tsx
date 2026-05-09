"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggleButton } from "@/components/ThemeToggleButton";

type Status = "verifying" | "success" | "invalid" | "missing";

export function VerifyEmailScreen() {
  const t = useTranslations("verifyEmailPage");
  const locale = useLocale();
  const otherLocale = locale === "en" ? "ar" : "en";
  const params = useSearchParams();
  const token = params.get("token");

  const [status, setStatus] = useState<Status>(token ? "verifying" : "missing");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (res.ok) {
          setStatus("success");
        } else {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setStatus("invalid");
          setMessage(data.error ?? null);
        }
      } catch {
        if (!cancelled) {
          setStatus("invalid");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const verifyHref = `/${otherLocale}/verify-email${token ? `?token=${encodeURIComponent(token)}` : ""}`;

  return (
    <div className="login-page">
      <div className="login-pattern" />
      <ThemeToggleButton />
      <Link className="lang-toggle login-lang" href={verifyHref}>
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

        {status === "verifying" && (
          <div style={{ padding: 24 }}>
            <span className="ms" style={{ fontSize: 36, animation: "spin 0.8s linear infinite" }}>
              progress_activity
            </span>
            <p style={{ color: "var(--color-text-secondary)", marginTop: 12 }}>{t("verifying")}</p>
          </div>
        )}

        {status === "success" && (
          <div style={{ padding: 24 }}>
            <span
              className="ms"
              style={{ fontSize: 48, color: "var(--color-success)" }}
            >
              check_circle
            </span>
            <p style={{ marginTop: 12, fontWeight: 500 }}>{t("success")}</p>
            <p style={{ color: "var(--color-text-secondary)", fontSize: 13.5 }}>
              {t("successHint")}
            </p>
            <Link
              className="btn btn-primary"
              href={`/${locale}/login`}
              style={{ marginTop: 16, height: 42, fontSize: 14 }}
            >
              {t("signIn")}
            </Link>
          </div>
        )}

        {status === "invalid" && (
          <div style={{ padding: 24 }}>
            <span
              className="ms"
              style={{ fontSize: 48, color: "var(--color-danger)" }}
            >
              error
            </span>
            <p style={{ marginTop: 12, fontWeight: 500 }}>{t("invalid")}</p>
            <p style={{ color: "var(--color-text-secondary)", fontSize: 13.5 }}>
              {message ?? t("invalidHint")}
            </p>
            <Link
              className="btn btn-secondary"
              href={`/${locale}/login`}
              style={{ marginTop: 16, height: 42, fontSize: 14 }}
            >
              {t("backToSignIn")}
            </Link>
          </div>
        )}

        {status === "missing" && (
          <div style={{ padding: 24 }}>
            <p style={{ color: "var(--color-text-secondary)", fontSize: 13.5 }}>
              {t("missingHint")}
            </p>
            <Link
              className="btn btn-secondary"
              href={`/${locale}/login`}
              style={{ marginTop: 16, height: 42, fontSize: 14 }}
            >
              {t("backToSignIn")}
            </Link>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
