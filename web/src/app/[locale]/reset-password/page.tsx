import { Suspense } from "react";

import { ResetPasswordScreen } from "./ResetPasswordScreen";

function Fallback() {
  return (
    <div className="login-page">
      <div className="login-pattern" />
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
