"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggleButton } from "@/components/ThemeToggleButton";

export function ForgotPasswordScreen() {
  const t = useTranslations("forgotPage");
  const locale = useLocale();
  const otherLocale = locale === "en" ? "ar" : "en";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [debugUrl, setDebugUrl] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        debug_reset_url?: string | null;
      };
      if (!res.ok) {
        setError(data.error || t("failed"));
        return;
      }
      setDebugUrl(typeof data.debug_reset_url === "string" ? data.debug_reset_url : null);
      setDone(true);
    } catch {
      setError(t("failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-pattern" />
      <ThemeToggleButton />
      <Link className="lang-toggle login-lang" href={`/${otherLocale}/forgot-password`}>
        {locale === "en" ? "العربية" : "English"}
      </Link>

      <div className="login-card screen-enter">
        <div className="brand-block">
          <div className="brand-mark" style={{ width: 56, height: 56, borderRadius: 14 }}>
            <BrandLogo size={42} />
          </div>
          <h1>شركة مكتسبات العقارية</h1>
          <div className="en-name">Muktasabat Real Estate</div>
        </div>

        {!done ? (
          <form onSubmit={submit}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem", textAlign: "center" }}>{t("title")}</h2>
            <p style={{ margin: "0 0 16px", color: "var(--color-text-secondary)", fontSize: 14, textAlign: "center" }}>
              {t("subtitle")}
            </p>
            <div className="form-fields">
              <div className="field">
                <label>{t("email")}</label>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && (
                <div
                  className="badge badge-danger"
                  role="alert"
                  style={{ alignSelf: "stretch", justifyContent: "center", padding: "8px 12px" }}
                >
                  {error}
                </div>
              )}
              <button type="submit" className="btn btn-primary" style={{ height: 42, fontSize: 14 }} disabled={loading}>
                {loading ? (
                  <span className="ms" style={{ animation: "spin 0.8s linear infinite" }}>
                    progress_activity
                  </span>
                ) : (
                  t("submit")
                )}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ textAlign: "center" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>{t("sentTitle")}</h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>{t("sentBody")}</p>
            {debugUrl && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 8,
                  background: "var(--color-warning-soft)",
                  textAlign: "start",
                  fontSize: 13,
                }}
              >
                <strong>{t("devLinkHint")}</strong>
                <div style={{ marginTop: 8, wordBreak: "break-all" }}>
                  <Link href={`/${locale}${debugUrl}`}>{`/${locale}${debugUrl}`}</Link>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="login-foot" style={{ marginTop: 20 }}>
          <Link href={`/${locale}/login`}>{t("backToLogin")}</Link>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
