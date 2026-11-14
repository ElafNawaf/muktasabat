import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/cms";

/**
 * Only the API is blocked. Portal and sign-in pages are deliberately NOT
 * disallowed here: they answer with `X-Robots-Tag: noindex` (next.config.mjs)
 * and a robots meta tag, and Google can only obey those if it may crawl them.
 * A Disallow would keep the old login URL stuck in search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/uploads/private/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
