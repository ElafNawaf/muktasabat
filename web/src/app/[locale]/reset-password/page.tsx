import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetPasswordScreen } from "./ResetPasswordScreen";
import { LoginSky } from "@/components/LoginSky";

/** Private screen: keep it out of search results (the public website is what should rank). */
export const metadata: Metadata = { robots: { index: false, follow: false } };


function Fallback() {
  return (
    <div className="login-page">
      <LoginSky />
      <div className="login-card screen-enter" style={{ padding: 40 }}>
        <p style={{ textAlign: "center", color: "var(--color-text-secondary)" }}>…</p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <ResetPasswordScreen />
    </Suspense>
  );
}
