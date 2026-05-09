import createMiddleware from "next-intl/middleware";

import { defaultLocale, locales } from "./i18n/config";

export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
});

export const config = {
  // Skip Next internals & static files; everything else flows through i18n routing
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
