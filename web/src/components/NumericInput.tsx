"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";

type NumericInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value: number | string | null | undefined;
  onValueChange: (value: number | null) => void;
  /** Allow decimal point (amounts, percentages, coordinates). Default true. */
  decimal?: boolean;
  /** When empty, emit null instead of min/0. */
  emptyAsNull?: boolean;
  min?: number;
  max?: number;
  step?: string | number;
};

/**
 * Text input that only accepts numeric characters (optional decimal).
 * Replaces `<input type="number">` so browser spinners are gone.
 */
export function NumericInput({
  value,
  onValueChange,
  decimal = true,
  emptyAsNull = false,
  min,
  max,
  className = "input",
  step: _step,
  onBlur,
  onFocus,
  ...rest
}: NumericInputProps) {
  const toDisplay = (v: number | string | null | undefined) => {
    if (v === null || v === undefined || v === "") return "";
    const n = Number(v);
    return Number.isNaN(n) ? "" : String(v);
  };

  const [text, setText] = useState(() => toDisplay(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(toDisplay(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    if (raw === "" || raw === "." || raw === "-" || raw === "-.") {
      if (emptyAsNull) {
        onValueChange(null);
        return;
      }
      onValueChange(min ?? 0);
      return;
    }
    let n = Number(raw);
    if (Number.isNaN(n)) return;
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    onValueChange(n);
  };

  return (
    <input
      {...rest}
      className={className}
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        commit(text);
        if (text === "" || text === "." || text === "-" || text === "-.") {
          setText(emptyAsNull ? "" : toDisplay(min ?? 0));
        } else {
          let n = Number(text);
          if (!Number.isNaN(n)) {
            if (min != null && n < min) n = min;
            if (max != null && n > max) n = max;
            setText(String(n));
          }
        }
        onBlur?.(e);
      }}
      onChange={(e) => {
        let raw = e.target.value;
        if (decimal) {
          const neg = raw.startsWith("-");
          raw = raw.replace(/[^\d.]/g, "");
          if (neg && (min == null || min < 0)) raw = "-" + raw;
          const signed = raw.startsWith("-");
          const unsigned = raw.replace(/^-/, "");
          const parts = unsigned.split(".");
          const body =
            parts.length > 1 ? parts[0] + "." + parts.slice(1).join("") : parts[0];
          raw = (signed ? "-" : "") + body;
        } else {
          raw = raw.replace(/[^\d]/g, "");
        }
        setText(raw);
        if (raw !== "" && raw !== "." && raw !== "-" && raw !== "-.") {
          commit(raw);
        } else if (emptyAsNull && raw === "") {
          onValueChange(null);
        }
      }}
    />
  );
}
