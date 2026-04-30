// Security response headers.
//
// Mirrored in vercel.json so the same defensive set applies at the Vercel
// edge and when running next start locally (which doesn't read vercel.json).
// Same values in both places → no conflict / no duplication at runtime.
//
// CSP note: 'unsafe-inline' on script-src / style-src is kept deliberately
// because Next.js 15 still inlines hydration scripts and some styles. A
// strict-CSP migration (nonces or hashes per build) is a separate refactor.
// fonts.googleapis.com is in style-src to allow the Google Fonts stylesheet
// <link> in app/layout.tsx; the font files themselves load from
// fonts.gstatic.com via font-src.

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "x-content-type-options", value: "nosniff" },
          {
            key: "strict-transport-security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "x-frame-options", value: "DENY" },
          { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
          {
            key: "permissions-policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "content-security-policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
