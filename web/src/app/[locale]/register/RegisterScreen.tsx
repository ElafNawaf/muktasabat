"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggleButton } from "@/components/ThemeToggleButton";

export function RegisterScreen() {
  const t = useTranslations("registerPage");
  const locale = useLocale();
  const otherLocale = locale === "en" ? "ar" : "en";

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [resentMsg, setResentMsg] = useState<string | null>(null);
  const [debugVerifyUrl, setDebugVerifyUrl] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(t("weakPassword"));
      return;
    }
    if (password !== confirm) {
      setError(t("passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        registered?: boolean;
        email?: string;
      };
      if (res.status === 409) {
        const msg = data.error || "";
        setError(
          msg.includes("Username") || msg.includes("username")
            ? t("usernameTaken")
            : msg.includes("Email") || msg.includes("email")
              ? t("emailTaken")
              : t("failed"),
        );
        return;
      }
      if (!res.ok) {
        setError(data.error || t("failed"));
        return;
      }
      setSubmittedEmail(data.email ?? email);
    } catch {
      setError(t("failed"));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!submittedEmail) return;
    setResentMsg(null);
    setDebugVerifyUrl(null);
    const res = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: submittedEmail }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      debug_verify_url?: string | null;
    };
    setResentMsg(data.message ?? t("resentOk"));
    if (data.debug_verify_url) {
      setDebugVerifyUrl(`/${locale}${data.debug_verify_url}`);
    }
  }

  if (submittedEmail) {
    return (
      <div className="login-page">
        <div className="login-pattern" />
        <ThemeToggleButton />
        <Link className="lang-toggle login-lang" href={`/${otherLocale}/register`}>
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
          <span className="ms" style={{ fontSize: 48, color: "var(--color-success)" }}>
            mark_email_read
          </span>
          <h2 style={{ margin: "8px 0 0", fontSize: "1.25rem" }}>{t("checkEmailTitle")}</h2>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
            {t("checkEmailHint", { email: submittedEmail })}
          </p>
          {debugVerifyUrl && (
            <div className="badge" style={{ marginTop: 8, padding: "8px 12px" }}>
              <span className="ms ms-sm">link</span>
              <a className="mono" href={debugVerifyUrl} style={{ marginInlineStart: 6 }}>
                {debugVerifyUrl}
              </a>
            </div>
          )}
          <button
            className="btn btn-secondary"
            onClick={resend}
            style={{ marginTop: 12, height: 40, fontSize: 13 }}
          >
            <span className="ms ms-sm">forward_to_inbox</span> {t("resend")}
          </button>
          {resentMsg && (
            <div className="text-sec" style={{ fontSize: 12, marginTop: 6 }}>
              {resentMsg}
            </div>
          )}
          <div className="login-foot" style={{ marginTop: 16 }}>
            <Link href={`/${locale}/login`}>{t("signIn")}</Link>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-pattern" />
      <ThemeToggleButton />
      <Link className="lang-toggle login-lang" href={`/${otherLocale}/register`}>
        {locale === "en" ? "العربية" : "English"}
      </Link>

      <form className="login-card screen-enter" onSubmit={submit}>
        <div className="brand-block">
          <div className="brand-mark" style={{ width: 56, height: 56, borderRadius: 14 }}>
            <BrandLogo size={42} />
          </div>
          <h1>شركة مكتسبات العقارية</h1>
          <div className="en-name">Muktasabat Real Estate</div>
        </div>

        <h2 style={{ margin: "8px 0 0", fontSize: "1.25rem", textAlign: "center" }}>{t("title")}</h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-secondary)", fontSize: 14, textAlign: "center" }}>
          {t("subtitle")}
        </p>

        <div className="form-fields">
          <div className="field">
            <label>{t("username")}</label>
            <input
              className="input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
            />
          </div>
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
          <div className="field">
            <label>{t("password")}</label>
            <div className="password-wrap">
              <input
                className="input"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                className="eye"
                onClick={() => setShowPw((s) => !s)}
                aria-label="Toggle password visibility"
              >
                <span className="ms ms-sm">{showPw ? "visibility_off" : "visibility"}</span>
              </button>
            </div>
          </div>
          <div className="field">
            <label>{t("confirmPassword")}</label>
            <input
              className="input"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
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

        <div className="login-foot">
          {t("alreadyHave")}{" "}
          <Link href={`/${locale}/login`}>{t("signIn")}</Link>
        </div>
      </form>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
