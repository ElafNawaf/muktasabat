import type { Metadata } from "next";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";

/** Private screen: keep it out of search results (the public website is what should rank). */
export const metadata: Metadata = { robots: { index: false, follow: false } };


export default function ForgotPasswordPage() {
  return <ForgotPasswordScreen />;
}
