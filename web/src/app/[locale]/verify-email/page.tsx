import type { Metadata } from "next";
import { VerifyEmailScreen } from "./VerifyEmailScreen";

/** Private screen: keep it out of search results (the public website is what should rank). */
export const metadata: Metadata = { robots: { index: false, follow: false } };


export default function VerifyEmailPage() {
  return <VerifyEmailScreen />;
}
