import type { Metadata } from "next";
import "../src/styles.css";
import { ExtensionNoiseSilencer } from "@/components/ExtensionNoiseSilencer";

const SITE_URL = "https://visitportal.dev";
const SITE_NAME = "Portal";
const TITLE = "Portal — The drop-in visit layer for LLM clients";
const DESCRIPTION =
  "Portal is an open HTTP standard for drive-by LLM tool use. Two endpoints, one manifest, zero install on the visitor side. 81× less schema overhead than preloaded MCP at 100 tools (measured on Anthropic count_tokens).";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · Portal" },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Mirko Basil Dölger", url: "https://x.com/0motionguy" }],
  creator: "Mirko Basil Dölger (@0motionguy)",
  publisher: "Portal — open standard",
  category: "technology",
  keywords: [
    "Portal",
    "visitportal",
    "visit-portal",
    "LLM",
    "large language models",
    "agent protocol",
    "agent web",
    "tool calling",
    "function calling",
    "MCP",
    "Model Context Protocol",
    "A2A",
    "Agent-to-Agent",
    "Claude",
    "Claude Code",
    "Anthropic",
    "Opus 4.7",
    "open standard",
    "HTTP API",
    "JSON Schema",
    "conformance",
    "TypeScript",
    "open source",
    "AI agents",
    "AI infrastructure",
    "tool integration",
    "zero install",
    "drive-by tools",
  ],
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    site: "@0motionguy",
    creator: "@0motionguy",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/icon.svg" }],
  },
  manifest: "/manifest.json",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": SITE_NAME,
    "format-detection": "telephone=no",
  },
};

// JSON-LD structured data for Google rich results + AI-crawler discoverability.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: DESCRIPTION,
      inLanguage: "en-US",
      publisher: {
        "@type": "Person",
        name: "Mirko Basil Dölger",
        url: "https://x.com/0motionguy",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: "@visitportal/spec",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Cross-platform",
      description:
        "Portal specification artifacts — JSON Schema, conformance vectors, and a zero-dependency lean validator for any LLM visitor SDK.",
      url: "https://www.npmjs.com/package/@visitportal/spec",
      softwareVersion: "0.1.1",
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      author: {
        "@type": "Person",
        name: "Mirko Basil Dölger",
        url: "https://x.com/0motionguy",
      },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@type": "TechArticle",
      "@id": `${SITE_URL}/docs/#article`,
      headline: "Portal v0.1.1 — adopter quickstart",
      description:
        "Two endpoints, one manifest. 30-second conformance check via runSmokeConformance. Ship a Portal in 10 minutes.",
      url: `${SITE_URL}/docs`,
      inLanguage: "en-US",
      author: {
        "@type": "Person",
        name: "Mirko Basil Dölger",
        url: "https://x.com/0motionguy",
      },
      about: ["MCP", "A2A", "LLM", "Claude", "tool calling", "agent protocol"],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body>
        <ExtensionNoiseSilencer />
        {children}
      </body>
    </html>
  );
}
