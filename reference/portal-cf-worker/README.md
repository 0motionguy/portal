# Portal CF Worker — reference demo

A two-route Portal as a single Cloudflare Worker. ~30 lines of handler code. Companion to the [Cloudflare Workers quickstart](../../docs/quickstart-cloudflare-worker.md).

## What it serves

- `GET /portal` — manifest (also at `/.well-known/portal.json`, byte-identical, spec Appendix E)
- `POST /portal/call` — dispatcher with two tools: `whoami`, `reverse`
- `GET /healthz` — `{ ok: true }`

## Run locally

```sh
pnpm install
pnpm --filter portal-cf-worker dev   # wrangler dev on http://localhost:8787
```

Smoke-test it from another terminal:

```sh
curl -s http://localhost:8787/portal | jq
curl -s -X POST http://localhost:8787/portal/call \
  -H 'content-type: application/json' \
  -d '{"tool":"reverse","params":{"text":"hello"}}' | jq

# Conformance (from repo root)
pnpm conformance http://localhost:8787/portal
```

## Run tests

```sh
pnpm --filter portal-cf-worker test
```

The smoke suite drives the worker's `fetch` handler directly with `new Request(...)` — no wrangler runtime needed for unit tests.

## Deploy

```sh
pnpm --filter portal-cf-worker deploy
```

`workers_dev = true` in `wrangler.toml` will publish to `<name>.<account>.workers.dev`. To bind a custom domain, edit `wrangler.toml` per [Cloudflare's docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
