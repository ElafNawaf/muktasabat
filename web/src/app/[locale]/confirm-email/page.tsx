import { Suspense } from "react";

import { ConfirmEmailScreen } from "./ConfirmEmailScreen";

export default function ConfirmEmailPage() {
  return (
    <Suspense>
      <ConfirmEmailScreen />
    </Suspense>
  );
}
