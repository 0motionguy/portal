# Quickstart — Static-fallback Portal

For sites that ship as static assets (Jekyll, Hugo, Astro static export, plain HTML on a CDN) and don't have a backend. The pattern: **host the manifest as a static JSON file, point its `call_endpoint` at one tiny serverless function**. That function is the only dynamic piece.

Working reference (live on visitportal.dev):

- Manifest (static asset): [`web/public/portal-static-example.json`](../web/public/portal-static-example.json) → served as `https://www.visitportal.dev/portal-static-example.json`
- Dispatcher (single Next.js Route Handler — Node runtime): [`web/app/api/portal-static-example/call/route.ts`](../web/app/api/portal-static-example/call/route.ts) → handles `POST /api/portal-static-example/call`
- Smoke tests: [`web/app/api/portal-static-example/call/route.test.ts`](../web/app/api/portal-static-example/call/route.test.ts) — asserts the static JSON validates against the spec and that both halves agree on the tool list.

```sh
curl -s https://www.visitportal.dev/portal-static-example.json | jq
curl -s -X POST https://www.visitportal.dev/api/portal-static-example/call \
  -H 'content-type: application/json' \
  -d '{"tool":"posts","params":{"limit":2}}' | jq
```

## When this pattern fits

- Your site is a static export (Astro, Hugo, Jekyll, 11ty, Eleventy, plain HTML).
- You have at most one tiny serverless platform you're willing to use (Vercel Edge Functions, Netlify Functions, Cloudflare Workers, Deno Deploy).
- Your tools are read-only or do simple side effects — no long-running jobs.

If you have no backend at all and no serverless platform: a Portal manifest declares `tools` with `minItems: 1` and the spec mandates that `POST /portal/call` works. There is no "manifest-only Portal" — `tools` cannot be empty. The minimum dynamic piece is a single fetch handler.

## How it works

1. **Manifest as a static asset.** Put `portal.json` (or any name) anywhere your CDN/static host serves it. CORS-friendly: `Access-Control-Allow-Origin: *` so visitor SDKs running in a browser can fetch it. See the `vercel.json` rule for [`/portal-static-example.json`](../web/vercel.json) — `cache-control: public, max-age=300, must-revalidate`.
2. **`call_endpoint` is root-relative or absolute HTTPS.** Point at the dispatcher you control. In our example: `"/api/portal-static-example/call"`. Visitors resolve it against the manifest URL.
3. **Single dispatcher.** One function. Mounted as a Next.js Route Handler, a Vercel Edge Function, a Netlify Function, or a Cloudflare Worker. Use `@visitportal/provider`'s `serve()` to avoid hand-rolling the envelope shape.
4. **Keep both halves in sync.** The static JSON manifest and the dispatcher's manifest config MUST declare the same tool set, params, and `call_endpoint`. Add a smoke test that diffs them — the reference [`route.test.ts`](../web/app/api/portal-static-example/call/route.test.ts) does this.

## Example: Vercel + Next.js (the reference above)

`public/portal.json`:

```json
{
  "portal_version": "0.1",
  "name": "My Static Site",
  "brief": "What an agent can do here.",
  "tools": [
    { "name": "search", "params": { "q": { "type": "string", "required": true } } }
  ],
  "call_endpoint": "/api/portal/call"
}
```

`app/api/portal/call/route.ts`:

```ts
import { serve } from "@visitportal/provider";

const portal = serve({
  manifest: {
    portal_version: "0.1",
    name: "My Static Site",
    brief: "What an agent can do here.",
    tools: [
      { name: "search", params: { q: { type: "string", required: true } } },
    ],
    call_endpoint: "/api/portal/call",
  },
  handlers: {
    search: async (params) => {
      const q = params.q as string;
      // ...your search...
      return { hits: [] };
    },
  },
});

export const runtime = "edge";
export const POST = (req: Request) => portal.fetch(req);
export const OPTIONS = (req: Request) => portal.fetch(req);
```

Add a Cache-Control header for `public/portal.json` in `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/portal.json",
      "headers": [
        { "key": "content-type", "value": "application/json; charset=utf-8" },
        { "key": "cache-control", "value": "public, max-age=300, must-revalidate" },
        { "key": "access-control-allow-origin", "value": "*" }
      ]
    }
  ]
}
```

## Example: Cloudflare Pages + a single Worker

Put `portal.json` in Pages' output directory. Add a Worker with one route at `/api/portal/call`. The Worker is identical to the [Cloudflare Workers quickstart](./quickstart-cloudflare-worker.md) — only the route prefix changes.

## Example: Netlify

`netlify.toml`:

```toml
[[redirects]]
  from = "/api/portal/call"
  to = "/.netlify/functions/portal-call"
  status = 200
```

`netlify/functions/portal-call.ts`:

```ts
import { serve } from "@visitportal/provider";
const portal = serve({ /* same shape as the Vercel example */ });
export default { fetch: (req: Request) => portal.fetch(req) };
```

## What's missing in the static-fallback shape

- **No rate limit out of the box.** Add one at the dispatcher (Upstash, Cloudflare Rate Limiting, Vercel WAF). Spec Appendix D suggests 30 req/min/IP and a `Retry-After` header on 429s; emit `provider.rateLimited("...", { retryAfter: 60 })`.
- **No auth out of the box.** Declare `auth: "api_key"` in the manifest and validate the `Authorization`/`X-API-Key` header in the dispatcher; throw `provider.unauthorized("...")`.
- **No streaming.** Static fallback fits drive-by reads. Long-running jobs belong in [A2A](https://a2a-protocol.io).

## Validate against the spec

```sh
git clone https://github.com/0motionguy/portal && cd portal
pnpm install
pnpm conformance https://your-site.example/portal.json
```

Or use `/.well-known/portal.json` if you serve the manifest there too — both paths are documented in [spec Appendix E](./spec-v0.1.7.md).
