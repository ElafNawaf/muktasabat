import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Muktasabat — Real Estate",
  description: "Property management for Saudi real estate operators.",
};

// The visible <html> wrapper lives in [locale]/layout.tsx so we can set lang & dir
// per-locale. This root layout is required by Next but stays minimal.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children as React.ReactElement;
}
