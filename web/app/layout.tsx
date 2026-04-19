import type { Metadata } from "next";
import "../src/styles.css";
import { ExtensionNoiseSilencer } from "@/components/ExtensionNoiseSilencer";

export const metadata: Metadata = {
  metadataBase: new URL("https://visitportal.dev"),
  title: {
    default: "Portal — The drop-in visit layer for LLM clients",
    template: "%s · Portal",
  },
  description:
    "Portal is an open HTTP standard for drive-by LLM tool use. Two endpoints, one manifest. 81× less schema overhead than preloaded MCP at 100 tools (measured).",
  openGraph: {
    title: "Portal — The drop-in visit layer for LLM clients",
    description:
      "Two endpoints, one manifest. 81× less schema overhead than preloaded MCP at 100 tools (measured on Anthropic count_tokens).",
    type: "website",
    url: "https://visitportal.dev",
  },
  twitter: {
    card: "summary_large_image",
  },
  manifest: "/manifest.json",
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
      </head>
      <body>
        <ExtensionNoiseSilencer />
        {children}
      </body>
    </html>
  );
}
