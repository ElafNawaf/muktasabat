import type { Metadata } from "next";
import { Suspense } from "react";

import { ConfirmEmailScreen } from "./ConfirmEmailScreen";

/** Private screen: keep it out of search results (the public website is what should rank). */
export const metadata: Metadata = { robots: { index: false, follow: false } };


export default function ConfirmEmailPage() {
  return (
    <Suspense>
      <ConfirmEmailScreen />
    </Suspense>
  );
}
