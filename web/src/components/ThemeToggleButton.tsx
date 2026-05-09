"use client";

import { useTheme } from "./ThemeProvider";

/**
 * Theme toggle pill for public pages (login/register/forgot/reset/verify).
 * Uses .lang-toggle styling so it sits next to the language switcher.
 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className={"lang-toggle " + (className ?? "login-lang")}
      onClick={toggle}
      title={theme === "light" ? "Dark mode" : "Light mode"}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      style={{ insetInlineEnd: 100 }}
    >
      <span className="ms ms-sm" style={{ verticalAlign: "middle" }}>
        {theme === "light" ? "dark_mode" : "light_mode"}
      </span>
    </button>
  );
}
