import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/"] },
      // Named AI crawlers — explicit allow for discoverability.
      { userAgent: ["GPTBot", "ChatGPT-User", "Google-Extended", "PerplexityBot", "ClaudeBot", "anthropic-ai"], allow: "/" },
    ],
    sitemap: "https://visitportal.dev/sitemap.xml",
    host: "https://visitportal.dev",
  };
}
