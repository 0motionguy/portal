# Quickstart — Portal on Cloudflare Workers

A Portal is two HTTP routes. A Cloudflare Worker is a single `fetch(request)` handler. The whole adapter is `@visitportal/provider`'s `serve()` plus three lines of glue.

Working reference: [`reference/portal-cf-worker/`](../reference/portal-cf-worker/) — copy it, change the manifest, deploy.

## Requirements

- Cloudflare account (free tier works)
- Node 22+ and pnpm 10+ (or npm 10+)
- `wrangler` ≥ 3.114

## 1. Install

```sh
mkdir my-portal && cd my-portal
npm init -y
npm i @visitportal/provider
npm i -D wrangler @cloudflare/workers-types typescript
```

## 2. Write the worker

`src/worker.ts`:

```ts
import { invalidParams, serve } from "@visitportal/provider";

const portal = serve({
  name: "My Portal",
  brief: "One sentence describing what the visiting LLM can do here.",
  call_endpoint: "/portal/call",
  tools: [
    {
      name: "echo",
      description: "Echo a string back.",
      params: { text: { type: "string", required: true } },
      handler: (params) => {
        if (typeof params.text !== "string") throw invalidParams("'text' must be a string");
        return { echoed: params.text };
      },
    },
  ],
});

const PORTAL_ROUTES = new Set(["/portal", "/.well-known/portal.json", "/portal/call"]);

export default {
  fetch: async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (PORTAL_ROUTES.has(pathname)) return portal.fetch(request);
    return Response.json(
      { ok: false, error: `route '${pathname}' not found`, code: "NOT_FOUND" },
      { status: 404 },
    );
  },
};
```

That is the entire Worker. `provider.serve()` handles:

- `GET /portal` (and the `/.well-known/portal.json` alias from spec Appendix E, byte-identical)
- `POST /portal/call` with the `{ ok, error, code }` error envelope and HTTP status mapping (`NOT_FOUND` → 404, `INVALID_PARAMS` → 400, `RATE_LIMITED` → 429, `INTERNAL` → 500)
- CORS preflight (`OPTIONS`) per spec Appendix C
- Method-not-allowed responses
- Manifest validation against the JSON Schema before the Worker even starts

You only have to write the tool handlers.

## 3. Configure wrangler

`wrangler.toml`:

```toml
name = "my-portal"
main = "src/worker.ts"
compatibility_date = "2026-04-01"
workers_dev = true
```

## 4. Run locally

```sh
npx wrangler dev    # http://localhost:8787
```

Smoke-test:

```sh
curl -s http://localhost:8787/portal | jq
curl -s -X POST http://localhost:8787/portal/call \
  -H 'content-type: application/json' \
  -d '{"tool":"echo","params":{"text":"hi"}}' | jq
```

## 5. Validate against the spec

From a clone of [visitportal.dev](https://github.com/0motionguy/portal):

```sh
pnpm install
pnpm conformance http://localhost:8787/portal
```

Expected:

```
portal-conformance · live · http://localhost:8787/portal
  ✓ manifest valid
  ✓ NOT_FOUND round-trip: round-trip produced NOT_FOUND envelope
```

CI-gate on this. Exit code is the number of failures (0 = pass).

## 6. Deploy

```sh
npx wrangler deploy
```

Wrangler prints the public URL (`<name>.<account>.workers.dev`). Bind a custom domain via [routes](https://developers.cloudflare.com/workers/configuration/routing/) and set `call_endpoint` to its absolute HTTPS URL — or keep the root-relative `"/portal/call"` and the manifest URL resolves it correctly either way.

## Rate-limiting + auth

`provider.serve()` does NOT include rate-limiting. For Cloudflare Workers, the idiomatic path is to add a [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) binding in `wrangler.toml` and gate `/portal/call` before delegating to `portal.fetch(request)`. Spec Appendix D recommends 30 req/min/IP and a `Retry-After` header on 429 responses; emit `provider.rateLimited("...", { retryAfter: 60 })` from your gate.

For protected actions, declare `auth: "api_key"` in the manifest and validate the `Authorization` or `X-API-Key` header in your handler before doing work — throw `provider.unauthorized("missing or invalid api key")` to get the standard envelope.

## What's NOT covered here

- SSE / streaming — out of scope; use [A2A](https://a2a-protocol.io)
- Per-connection session state — visitors are fire-and-forget
- Multi-Worker orchestration — one Worker, two routes is the contract

See [`docs/ROADMAP.md`](./ROADMAP.md) for the explicit out-of-scope list.
