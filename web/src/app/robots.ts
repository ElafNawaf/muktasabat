import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/cms";

const PORTAL = ["dashboard", "properties", "owners", "agents", "tenants", "contracts", "management-contracts", "payments", "expenses", "users", "website", "owner", "login", "register", "forgot-password", "reset-password", "verify-email", "owner-access"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", ...PORTAL.flatMap((p) => [`/ar/${p}`, `/en/${p}`])],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
