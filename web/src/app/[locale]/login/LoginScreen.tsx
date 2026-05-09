"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { BrandLogo } from "@/components/BrandLogo";

export function LoginScreen() {
  const t = useTranslations("login");
  const locale = useLocale();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherLocale = locale === "en" ? "ar" : "en";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError(t("invalidCredentials"));
        return;
      }
      router.push(`/${locale}/dashboard`);
      router.refresh();
    } catch {
      setError(t("invalidCredentials"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-pattern" />
      <Link className="lang-toggle login-lang" href={`/${otherLocale}/login`}>
        {locale === "en" ? "العربية" : "English"}
      </Link>

      <form className="login-card screen-enter" onSubmit={submit}>
        <div className="brand-block">
          <div
            className="brand-mark"
            style={{ width: 56, height: 56, borderRadius: 14 }}
          >
            <BrandLogo size={42} />
          </div>
          <h1>شركة مكتسبات العقارية</h1>
          <div className="en-name">Muktasabat Real Estate</div>
        </div>

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
            />
          </div>

          <div className="field">
            <label>{t("password")}</label>
            <div className="password-wrap">
              <input
                className="input"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="eye"
                onClick={() => setShowPw((s) => !s)}
                aria-label="Toggle password visibility"
              >
                <span className="ms ms-sm">
                  {showPw ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </div>

          <div className="form-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              {t("rememberMe")}
            </label>
            <Link href={`/${locale}/forgot-password`}>{t("forgotPassword")}</Link>
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

          <button
            type="submit"
            className="btn btn-primary"
            style={{ height: 42, fontSize: 14 }}
            disabled={loading}
          >
            {loading ? (
              <span className="ms" style={{ animation: "spin 0.8s linear infinite" }}>
                progress_activity
              </span>
            ) : (
              t("signIn")
            )}
          </button>
        </div>

        <div className="login-foot">
          {t("noAccount")}{" "}
          <Link href={`/${locale}/register`}>{t("register")}</Link>
        </div>
      </form>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
