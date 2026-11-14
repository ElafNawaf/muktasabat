import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LocaleDocument } from "@/components/LocaleDocument";
import { ThemeProvider } from "@/components/ThemeProvider";
import { locales, localeDirections, type Locale } from "@/i18n/config";
import { SITE_URL } from "@/lib/cms";

import "../globals.css";

/* This is the root layout: <html> lives here (not in app/layout.tsx) so the
   server-rendered document already carries the right lang/dir — search
   engines index Arabic pages as Arabic, RTL, without waiting for JS. */

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "شركة مكتسبات العقارية | Muktasabat Real Estate",
  description: "Muktasabat Real Estate — marketing and property management.",
  applicationName: "مكتسبات العقارية",
  formatDetection: { telephone: false },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#7b1a1a",
  width: "device-width",
  initialScale: 1,
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(locales as readonly string[]).includes(locale)) notFound();

  const messages = await getMessages();
  const dir = localeDirections[locale as Locale];

  return (
    <html lang={locale} dir={dir} data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;450;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Reem+Kufi:wght@500;600;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400,0..1,0&display=block"
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var d=document.documentElement;d.classList.add('mk-js');try{var t=localStorage.getItem('theme');if(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)t='dark';if(t)d.setAttribute('data-theme',t);}catch(e){}})();",
          }}
        />
      </head>
      <body>
        <LocaleDocument locale={locale} dir={dir} />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <Suspense>{children}</Suspense>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
