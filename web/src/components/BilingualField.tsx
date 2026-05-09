"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { translateText } from "@/lib/actions";

/**
 * Two side-by-side inputs for English + Arabic data with auto-translation.
 *
 * - On blur of either field, if the *other* field is empty, fills it via
 *   Amazon Translate (best-effort; failures leave the other field empty).
 * - A small "translate" icon button between the inputs forces translation
 *   from whichever side has content (manual override).
 * - Never overwrites an already-typed value — the user's manual input wins.
 *
 * Backend gracefully no-ops when TRANSLATE_REGION/SES_REGION aren't set, so
 * forms still work in local dev without an AWS account.
 */
export function BilingualField({
  label,
  required = false,
  valueEn,
  valueAr,
  onChangeEn,
  onChangeAr,
  multiline = false,
  rows = 3,
  maxLength,
  placeholderEn,
  placeholderAr,
}: {
  label: string;
  required?: boolean;
  valueEn: string;
  valueAr: string;
  onChangeEn: (v: string) => void;
  onChangeAr: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  placeholderEn?: string;
  placeholderAr?: string;
}) {
  const t = useTranslations("common");
  const [busy, setBusy] = useState<"en" | "ar" | null>(null);
  const [, start] = useTransition();

  const fillEnFromAr = () => {
    const src = valueAr.trim();
    if (!src) return;
    setBusy("en");
    start(async () => {
      const res = await translateText(src, "ar", "en");
      setBusy(null);
      if (res.ok && res.data) onChangeEn(res.data);
    });
  };

  const fillArFromEn = () => {
    const src = valueEn.trim();
    if (!src) return;
    setBusy("ar");
    start(async () => {
      const res = await translateText(src, "en", "ar");
      setBusy(null);
      if (res.ok && res.data) onChangeAr(res.data);
    });
  };

  const onBlurEn = () => {
    if (valueEn.trim() && !valueAr.trim()) fillArFromEn();
  };
  const onBlurAr = () => {
    if (valueAr.trim() && !valueEn.trim()) fillEnFromAr();
  };

  const Input = multiline ? "textarea" : "input";

  return (
    <div className="field">
      <label>
        {label}
        {required && <span className="req">*</span>}
        <button
          type="button"
          onClick={() => (valueEn.trim() ? fillArFromEn() : fillEnFromAr())}
          title={t("translate") + (busy ? " …" : "")}
          aria-label={t("translate")}
          disabled={busy !== null || (!valueEn.trim() && !valueAr.trim())}
          style={{
            marginInlineStart: 8,
            background: "transparent",
            border: 0,
            color: "var(--color-text-secondary)",
            cursor: busy ? "wait" : "pointer",
            verticalAlign: "middle",
            padding: "2px 4px",
          }}
        >
          <span
            className="ms ms-sm"
            style={busy ? { animation: "spin 0.8s linear infinite" } : undefined}
          >
            {busy ? "progress_activity" : "translate"}
          </span>
        </button>
      </label>
      <div className="field-row" style={{ gap: 8 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Input
            className={multiline ? "textarea" : "input"}
            value={valueEn}
            onChange={(e) => onChangeEn(e.target.value)}
            onBlur={onBlurEn}
            dir="ltr"
            placeholder={placeholderEn ?? "English"}
            maxLength={maxLength}
            {...(multiline ? { rows } : {})}
          />
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <Input
            className={multiline ? "textarea" : "input"}
            value={valueAr}
            onChange={(e) => onChangeAr(e.target.value)}
            onBlur={onBlurAr}
            dir="rtl"
            placeholder={placeholderAr ?? "العربية"}
            maxLength={maxLength}
            {...(multiline ? { rows } : {})}
          />
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
