import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LocaleDocument } from "@/components/LocaleDocument";
import { ThemeProvider } from "@/components/ThemeProvider";
import { locales, localeDirections, type Locale } from "@/i18n/config";

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
    <>
      <LocaleDocument locale={locale} dir={dir} />
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ThemeProvider>
          <Suspense>{children}</Suspense>
        </ThemeProvider>
      </NextIntlClientProvider>
    </>
  );
}
