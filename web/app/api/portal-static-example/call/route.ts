// Static-fallback Portal — companion to docs/quickstart-static-fallback.md.
// The manifest lives at /portal-static-example.json (static asset). This
// Route Handler is the only dynamic piece — it dispatches POST /portal/call.
// The two halves MUST stay in sync; route.test.ts asserts byte-equivalence.

import { type Manifest, invalidParams, serve } from "@visitportal/provider";

const manifest: Manifest = {
  portal_version: "0.1",
  name: "Static Fallback (reference)",
  brief:
    "A Portal hosted as a static JSON file plus a single serverless function dispatcher. Demonstrates the pattern for sites that ship as static assets (Jekyll, Hugo, Astro) and only have one tiny serverless function for /portal/call.",
  tools: [
    {
      name: "whoami",
      description: "Return a fixed self-description.",
      params: {},
    },
    {
      name: "posts",
      description:
        "Return up to N hardcoded posts. Demonstrates a read-only tool driven by static data.",
      params: {
        limit: {
          type: "number",
          required: false,
          description: "1-3, default 3",
        },
      },
    },
  ],
  call_endpoint: "/api/portal-static-example/call",
  auth: "none",
  pricing: { model: "free" },
};

const POSTS: ReadonlyArray<{ slug: string; title: string; published_at: string }> = [
  { slug: "hello-portal", title: "Hello, Portal", published_at: "2026-04-21" },
  { slug: "static-fallback", title: "Why a static fallback Portal", published_at: "2026-04-25" },
  { slug: "two-routes", title: "Two routes, no install", published_at: "2026-04-29" },
];

const portal = serve({
  manifest,
  handlers: {
    whoami: () => ({
      pattern: "static-fallback",
      hosted_at: "/portal-static-example.json",
      dispatched_by: "/api/portal-static-example/call",
      message: "manifest is a static asset; only this serverless function is dynamic",
    }),
    posts: (params) => {
      const raw = params.limit;
      let limit = 3;
      if (raw !== undefined) {
        if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 3) {
          throw invalidParams("'limit' must be an integer between 1 and 3");
        }
        limit = raw;
      }
      return POSTS.slice(0, limit);
    },
  },
});

export const runtime = "nodejs";

export const POST = (req: Request) => portal.fetch(req);
export const OPTIONS = (req: Request) => portal.fetch(req);
