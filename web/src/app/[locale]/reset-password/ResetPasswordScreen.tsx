"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { BrandLogo } from "@/components/BrandLogo";

export function ResetPasswordScreen() {
  const t = useTranslations("resetPage");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const otherLocale = locale === "en" ? "ar" : "en";

  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) setError(t("invalidToken"));
  }, [token, t]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
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
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || t("failed"));
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push(`/${locale}/login`), 1500);
    } catch {
      setError(t("failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-pattern" />
      <Link className="lang-toggle login-lang" href={`/${otherLocale}/reset-password${token ? `?token=${encodeURIComponent(token)}` : ""}`}>
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

        {success ? (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "var(--color-success)", fontWeight: 600 }}>{t("success")}</p>
            <Link href={`/${locale}/login`}>{t("signIn")}</Link>
          </div>
        ) : !token ? (
          <div style={{ textAlign: "center" }}>
            <p className="badge badge-danger" style={{ justifyContent: "center", padding: "10px 12px" }}>
              {t("invalidToken")}
            </p>
            <div className="login-foot" style={{ marginTop: 16 }}>
              <Link href={`/${locale}/forgot-password`}>{t("requestNew")}</Link>
              {" · "}
              <Link href={`/${locale}/login`}>{t("signIn")}</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem", textAlign: "center" }}>{t("title")}</h2>
            <p style={{ margin: "0 0 16px", color: "var(--color-text-secondary)", fontSize: 14, textAlign: "center" }}>
              {t("subtitle")}
            </p>
            <div className="form-fields">
              <div className="field">
                <label>{t("newPassword")}</label>
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
                  <button type="button" className="eye" onClick={() => setShowPw((s) => !s)} aria-label="toggle">
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
          </form>
        )}

        {!success && token ? (
          <div className="login-foot" style={{ marginTop: 16 }}>
            <Link href={`/${locale}/login`}>{t("signIn")}</Link>
          </div>
        ) : null}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
