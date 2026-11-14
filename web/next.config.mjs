import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");


// Security headers for the public site and the portal.
const csp = [
  "default-src 'self'",
  // Next.js inlines bootstrapping scripts; Turnstile is the only third-party script.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  // Hero background video (Website → Settings → Hero video) may be hosted on a CDN/S3.
  "media-src 'self' blob: https:",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com https://www.google.com https://maps.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

// Logged-in / auth areas (not the public website).
const PRIVATE_SECTIONS = [
  "login", "register", "forgot-password", "reset-password", "verify-email", "confirm-email",
  "dashboard", "properties", "owners", "agents", "tenants", "contracts", "management-contracts",
  "payments", "expenses", "users", "website", "owner", "owner-access", "account", "support",
  "data-management", "employees", "roles", "reports", "settings", "maintenance",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Portal, owner portal and sign-in screens must never appear in search
      // results — only the public website should. A header (not robots.txt
      // Disallow) lets Google crawl these URLs, see "noindex" and drop the
      // old login page it indexed before the website existed.
      {
        source: `/:locale(ar|en)/:section(${PRIVATE_SECTIONS.join("|")})/:rest*`,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: `/:locale(ar|en)/:section(${PRIVATE_SECTIONS.join("|")})`,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  async redirects() {
    // Permanent (308) so Google treats /ar as the one home page for the domain.
    return [{ source: "/", destination: "/ar", permanent: true }];
  },
};

export default withNextIntl(nextConfig);
