# Quickstart — Ship a Portal in 10 minutes

You are building a Portal: one manifest at `GET /portal`, one dispatcher at `POST /portal/call`. Any LLM client with function-calling can visit cold, read the manifest, invoke a tool, and leave. No install. No residue. Portal is a complement to MCP — use it for drive-by visits, not long-running installed tool sets.

## Requirements

- Node 22+ and pnpm 10+ (only needed if you want to use our reference in TypeScript — Portal itself is language-agnostic).
- Ability to serve two HTTP endpoints. Nothing else.

## The 10-minute path

There is nothing published on npm yet (hackathon week). Build a Portal directly against the raw HTTP shape — it is three fields of JSON and one POST handler. The reference implementation in [`reference/trending-demo/src/server.ts`](../reference/trending-demo/src/server.ts) is under 100 lines of Hono and is the canonical pattern.

### 1. Write the manifest

`portal.json` is served verbatim from `GET /portal`. Required fields: `portal_version`, `name`, `brief`, `tools`, `call_endpoint`. See [spec v0.1.1 §4](./spec-v0.1.1.md) for the full schema.

```json
{
  "portal_version": "0.1",
  "name": "My Service",
  "brief": "One sentence describing what the visiting LLM can do here.",
  "tools": [
    {
      "name": "top_items",
      "description": "Return the top N items.",
      "params": {
        "limit": { "type": "number", "required": true, "description": "1-50" }
      }
    }
  ],
  "call_endpoint": "https://my-service.example/portal/call",
  "auth": "none",
  "pricing": { "model": "free" }
}
```

Rules: tool `name` matches `^[a-z][a-z0-9_]*$`. Use `params` (sugar) for 95% of cases; drop down to `paramsSchema` (JSON Schema draft-07) only when you need enums or nested shapes. Unknown top-level fields are rejected.

### 2. Serve the two endpoints

Pseudocode — drop this into Hono, Express, FastAPI, Go's `net/http`, anything:

```ts
// GET /portal — return the manifest, swapping call_endpoint for the live URL.
app.get("/portal", (c) => c.json({ ...manifest, call_endpoint: `${PUBLIC_URL}/portal/call` }));

// POST /portal/call — dispatch { tool, params } to your handlers.
app.post("/portal/call", async (c) => {
  const { tool, params } = await c.req.json();
  const handler = tools[tool];
  if (!handler) return c.json({ ok: false, error: `unknown tool '${tool}'`, code: "NOT_FOUND" });
  try {
    const result = await handler(params ?? {});
    return c.json({ ok: true, result });
  } catch (err) {
    return c.json({ ok: false, error: err.message, code: "INTERNAL" });
  }
});
```

Application errors always return HTTP 200 with `{ ok: false, error, code }`. The `code` is one of `NOT_FOUND | INVALID_PARAMS | UNAUTHORIZED | RATE_LIMITED | INTERNAL` ([spec §6](./spec-v0.1.1.md#6-error-codes-normative)). Transport-level failures (4xx/5xx) are fine too — visitors surface them as `CallFailed`.

### 3. Validate locally against the spec schema

Clone this repo, then run the conformance suite against your running Portal:

```sh
git clone https://github.com/visitportal/visitportal.dev   # public repo, hackathon build
cd visitportal.dev && pnpm install

# Start your Portal in another terminal, then:
pnpm conformance http://localhost:PORT/portal
```

Expected output:

```
portal-conformance · live · http://localhost:PORT/portal
  ✓ manifest valid
  ✓ NOT_FOUND round-trip: round-trip produced NOT_FOUND envelope
```

Exit code is the number of failures (0 = pass). CI-gate on this.

### 4. Smoke-test with the visit-portal CLI

Same cloned repo; no install needed past `pnpm install`:

```sh
pnpm --filter @visitportal/cli exec tsx src/cli.ts info http://localhost:PORT/portal
pnpm --filter @visitportal/cli exec tsx src/cli.ts call http://localhost:PORT/portal top_items --params '{"limit":3}'
pnpm --filter @visitportal/cli exec tsx src/cli.ts conformance http://localhost:PORT/portal
```

See [`packages/cli/README.md`](../packages/cli/README.md) for the full CLI reference.

## Deploying

- **Fly.io** — the reference Portal ships on Fly with `reference/trending-demo/fly.toml` + `Dockerfile`. Run `flyctl launch --no-deploy --copy-config --config fly.toml` then `flyctl deploy`. Full walkthrough in [`reference/trending-demo/README.md`](../reference/trending-demo/README.md).
- **Vercel** — Portal is just two HTTP handlers; any serverless runtime works. Expose `GET /portal` and `POST /portal/call` as two Edge functions and set `PORTAL_PUBLIC_URL` to the deployment URL so the manifest rewrites `call_endpoint` correctly.
- **Cloudflare Workers** — identical shape to Vercel. One Worker, two routes. Return the manifest as JSON, dispatch by `tool` field.

Set `PORTAL_PUBLIC_URL` in production so the served manifest advertises the public `call_endpoint`, not `http://localhost`.

## Extensions

v0.1 is deliberately small. For verified-agent identity, per-call micropayments, stateful sessions, or registry discovery, see [`docs/spec-v0.1.1.md` §8](./spec-v0.1.1.md#8-optional-extensions-non-normative). Extensions (PE-001 ERC-8004, PE-002 x402, PE-003 AGP, PE-004 ClawPulse) layer on top of the base — a Portal that uses them MUST still be valid under v0.1.1.
