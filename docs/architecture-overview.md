# Portal — Architecture Overview

One page. Nine sections. Every claim links to a file you can grep.

For the repo-internal layering rules (which package imports what), see [`docs/architecture.md`](./architecture.md). This page is the answer to the question *"how does an LLM client visit a website using Portal?"*.

---

## 1. Final Architecture Overview

```
Agent → GET /portal              → reads manifest (≤5 KB)
Agent → POST /portal/call        → invokes a tool
Agent ← { ok, result | error }   → uses the result
                                 → leaves (no install, no residue)
```

Three-tier composition (from [README.md §"Three layers"](../README.md#three-layers-of-the-open-agent-web)):

| Tier | Protocol | Use case |
|---|---|---|
| 1 | **Portal** | Drive-by HTTP visits. Stateless. No install. |
| 2 | MCP | Installed stateful tools. |
| 3 | A2A | Multi-agent coordination. |

Portal is **the visitor-side half of the open agent web**. MCP and A2A are not competitors — they cover different lifecycles. An MCP server can be wrapped as a Portal in a thin adapter ([`@visitportal/mcp-adapter`](../packages/mcp-adapter)). A Portal visit can upgrade to an A2A task when a job needs streaming or lifecycles.

---

## 2. Portal Manifest Schema (FINAL)

Normative spec: [`docs/spec-v0.1.7.md §4`](./spec-v0.1.7.md). Machine-readable: [`packages/spec/manifest.schema.json`](../packages/spec/manifest.schema.json).

Required: `portal_version`, `name`, `brief`, `tools`, `call_endpoint`. Optional: `auth`, `pricing`.

Annotated example:

```json
{
  "portal_version": "0.1",
  "name": "Star Screener",
  "brief": "Surface trending GitHub repos and maintainers for an LLM client.",
  "tools": [
    {
      "name": "top_gainers",
      "description": "Repos with the largest 7-day star delta.",
      "params": {
        "limit": { "type": "number", "required": true, "description": "1-50" }
      }
    },
    {
      "name": "search_repos",
      "paramsSchema": {
        "type": "object",
        "properties": { "q": { "type": "string", "minLength": 1 } },
        "required": ["q"]
      }
    }
  ],
  "call_endpoint": "/portal/call",
  "auth": "none",
  "pricing": { "model": "free" }
}
```

Rules (from the schema):

- `portal_version` matches `^0\.1(\.[0-9]+)?$`.
- `name` 1–120 chars; `brief` 1–2000 chars.
- `tools` has ≥1 tool. Tool `name` matches `^[a-z][a-z0-9_]*$`, ≤64 chars.
- `params` is the sugar form (`{type, required?, description?}`); `paramsSchema` is JSON Schema 2020-12 and **takes precedence** when both are present.
- `call_endpoint` is HTTPS or root-relative; plain `http://` is allowed only for `localhost`/`127.0.0.1` (dev).
- `auth ∈ {"none", "api_key", "erc8004"}` (default `"none"`).
- `pricing.model ∈ {"free", "x402"}`; `pricing.rate` is required iff `model != "free"`.
- Unknown top-level fields are **rejected** by the schema (`additionalProperties: false`).

Discovery: `GET /portal` is canonical; `GET /.well-known/portal.json` is an alternate path that MUST be byte-identical when both are served (spec Appendix E, draft in v0.1.7, normative in v0.2). See [`reference/trending-demo/src/server.ts:46-51`](../reference/trending-demo/src/server.ts#L46-L51).

---

## 3. Portal Call API Spec

Normative: [`docs/spec-v0.1.7.md §3.2 + §6`](./spec-v0.1.7.md). Provider helper: [`packages/provider/ts/src/serve.ts`](../packages/provider/ts/src/serve.ts).

**Request**

```json
POST /portal/call
content-type: application/json

{ "tool": "top_gainers", "params": { "limit": 3 } }
```

**Response — success (HTTP 200)**

```json
{ "ok": true, "result": <any JSON> }
```

**Response — handled error (HTTP 200; or 4xx/5xx if your provider prefers transport-level signaling — both shapes are spec-conformant as long as the envelope is present)**

```json
{ "ok": false, "error": "<human-readable, NOT for parsing>", "code": "NOT_FOUND" }
```

**Error codes (normative enum)**

| Code | HTTP suggestion | Meaning |
|---|---:|---|
| `NOT_FOUND` | 404 | Tool name not in manifest |
| `INVALID_PARAMS` | 400 | Params don't satisfy the tool's schema |
| `UNAUTHORIZED` | 401 | Missing/invalid credentials (`auth != "none"`) |
| `RATE_LIMITED` | 429 | Add `Retry-After` (spec Appendix D) |
| `INTERNAL` | 500 | Anything else |

Visitors MUST NOT parse `error`; they SHOULD branch on `code`. Any other shape is malformed.

Conformance vectors covering the 5 success shapes + 5 error codes: [`packages/spec/conformance/vectors.json`](../packages/spec/conformance/vectors.json) (CP-01..CP-10).

---

## 4. Minimal Working Server Examples

Pick a runtime. Every one is two HTTP routes.

| Runtime | Quickstart | Reference |
|---|---|---|
| Express | [docs/quickstart-express.md](./quickstart-express.md) | [`reference/trending-demo`](../reference/trending-demo) (uses Hono on Node) |
| Hono | [docs/quickstart-hono.md](./quickstart-hono.md) | same |
| Next.js App Router | [docs/quickstart-nextjs-app-router.md](./quickstart-nextjs-app-router.md) | [`web/app/api/portal-static-example/call/route.ts`](../web/app/api/portal-static-example/call/route.ts) |
| FastAPI (Python) | [docs/quickstart-fastapi.md](./quickstart-fastapi.md) | — |
| Cloudflare Workers | [docs/quickstart-cloudflare-worker.md](./quickstart-cloudflare-worker.md) | [`reference/portal-cf-worker`](../reference/portal-cf-worker) |
| Static fallback (no backend) | [docs/quickstart-static-fallback.md](./quickstart-static-fallback.md) | [`web/public/portal-static-example.json`](../web/public/portal-static-example.json) + the route handler above |
| MCP server → Portal | [docs/quickstart-mcp-adapter.md](./quickstart-mcp-adapter.md) | [`packages/mcp-adapter`](../packages/mcp-adapter) |

Every quickstart bottoms out at the same provider helper — [`packages/provider/ts/src/serve.ts`](../packages/provider/ts/src/serve.ts) — which:

- Builds and validates the manifest at boot (throws if it doesn't match the JSON Schema)
- Exposes `provider.fetch(request: Request): Promise<Response>` — a Web-standard handler usable in **Node, Edge runtimes, Cloudflare Workers, Deno, Bun**, anywhere `Request`/`Response` exist
- Implements `GET /portal`, `GET /.well-known/portal.json` (byte-identical), `POST /portal/call`, OPTIONS preflight
- Maps thrown `provider.notFound("...")` / `invalidParams("...")` etc. to the right HTTP status + error envelope

Adopters who want to keep dependencies to zero can hand-roll the same shape — [`docs/quickstart-provider.md §2`](./quickstart-provider.md) shows the 12-line pseudocode.

---

## 5. Security Model

Portal is **HTTP-native**. The security model is the assembly of standard HTTP defenses, not a new protocol layer.

### 5.1 Transport

- `call_endpoint` is HTTPS in production. Plain `http://` is allowed only for `localhost` / `127.0.0.1` (loopback dev). Enforced by the schema regex in [`manifest.schema.json:37`](../packages/spec/manifest.schema.json#L37).
- HSTS, CSP, X-Frame-Options, Referrer-Policy on the reference web surface — see [`web/vercel.json`](../web/vercel.json).

### 5.2 CORS (spec Appendix C, normative)

- `GET /portal` and `GET /.well-known/portal.json`: `Access-Control-Allow-Origin: *`, methods `GET, OPTIONS`, max-age 86400.
- `POST /portal/call`: `Access-Control-Allow-Origin: *` for the `auth: "none"` and `pricing: free` case; for credentialed flows (`auth: "api_key" | "erc8004"`, or `pricing.model: "x402"`) echo the `Origin` and add `Access-Control-Allow-Credentials: true` with `Vary: Origin`. Implemented in [`packages/provider/ts/src/serve.ts:220-246`](../packages/provider/ts/src/serve.ts#L220-L246).

### 5.3 Rate-limit (spec Appendix D, SHOULD)

Default suggestion: 30 req/min/IP on `/portal/call`; emit `Retry-After`. Reference Portal does 60 req/min/IP via [`reference/trending-demo/src/rate-limit.ts`](../reference/trending-demo/src/rate-limit.ts). The web `/api/visit` proxy uses Upstash sliding window — see [`web/app/api/visit/rate-limit.ts`](../web/app/api/visit/rate-limit.ts).

### 5.4 SSRF defense (visitors)

Browser-resident visitor SDKs that proxy through a same-origin endpoint MUST resolve hostnames and reject any IP outside the public unicast range. Reference: [`web/app/api/visit/ssrf-guard.ts`](../web/app/api/visit/ssrf-guard.ts) (uses ipaddr.js + `dns.lookup({all: true})` to defeat DNS rebinding).

### 5.5 Auth declaration

The manifest's `auth` field is **a declaration, not a protocol**. The base spec defines three values:

- `"none"` — anonymous reads. Default.
- `"api_key"` — provider expects `Authorization: Bearer <token>` or `X-API-Key: <token>`. Format and rotation are out of base scope.
- `"erc8004"` — verified-agent identity. Documented as Portal Extension PE-001; see [`docs/spec-v0.1.7.md §8`](./spec-v0.1.7.md).

For **protected actions**, declare the appropriate `auth` value and validate the credential in your handler: `throw provider.unauthorized("...")` to get the standard `{ ok: false, code: "UNAUTHORIZED" }` envelope.

> **Project rule**: the auth *protocol* is never added to the base spec. It belongs in Portal Extensions (PE-001 ERC-8004, PE-002 x402, etc.). See [`.claude/CLAUDE.md`](../.claude/CLAUDE.md) "What NOT to do" and [`docs/ROADMAP.md`](./ROADMAP.md) "Explicitly out of scope".

---

## 6. AISO Scoring Integration

Full contract: [`docs/integrations/aiso-readiness-score.md`](./integrations/aiso-readiness-score.md). Output JSON Schema: [`docs/integrations/aiso-readiness-score.schema.json`](./integrations/aiso-readiness-score.schema.json).

AISO (`aiso.tools`) is a **separate codebase**. No AISO code lives in this repo; AISO consumes the public `@visitportal/spec` package only.

The Portal Readiness Score is **0–100, additive across 5 × 20-point dimensions**:

1. **Discoverability** (20) — manifest at `/portal` AND `/.well-known/portal.json`, byte-identical
2. **Schema validity** (20) — `validateManifest()` returns `{ ok: true }`
3. **Conformance** (20) — `runSmokeConformance()` returns `manifestOk: true, notFoundOk: true`
4. **Metadata** (20) — explicit `auth` (10) + explicit `pricing` (10)
5. **Live execution** (20) — synthesized call to `tools[0]` returns `ok: true`

A complete scorer is ~70 LOC on top of `@visitportal/spec`; the [contract doc](./integrations/aiso-readiness-score.md#reference-scan-implementation-typescript) has the reference TS implementation.

---

## 7. TrendingRepo Integration

Full contract: [`docs/integrations/trendingrepo-portal-badge.md`](./integrations/trendingrepo-portal-badge.md).

TrendingRepo (`trendingrepo.com`) is a **separate codebase**. Same rule: contracts in this repo, code in theirs.

The "Portal Ready" badge has four states keyed off the AISO score:

| Score band | Badge | Color |
|---|---|---|
| `≥ 90` | `Portal · 100` | gold |
| `60–89` | `Portal · verified` | emerald |
| `1–59` | `Portal` | slate |
| `0` or no score | (no badge) | — |

The "what agents can do" preview is a 3-line block built from the manifest:

```
{manifest.brief}                          (≤80 chars, "…" if truncated)
N tools — name1, name2, name3 (+M more)
{manifest_url}
```

Discovery: server-side fetch with a 5 s timeout, `/.well-known/portal.json` first then `/portal`. Validate with `leanValidate` from `@visitportal/spec`. Persist the result; the UI reads from the persisted record.

---

## 8. Testing Plan

| Layer | What it tests | Command |
|---|---|---|
| Schema | 36 conformance vectors (13 valid, 13 invalid, 10 call pairs) | `pnpm test --filter @visitportal/spec` |
| Visitor SDK | manifest validation, dispatch, retry, SSRF, onEvent | `pnpm test --filter @visitportal/visit` |
| Provider helper | manifest build, dispatch, error mapping, CORS | `pnpm test --filter @visitportal/provider` |
| Reference Portal | live smoke, /.well-known parity, CORS, rate-limit | `pnpm test --filter trending-demo` |
| CF Worker reference | fetch-handler smoke, CORS, error envelope | `pnpm test --filter portal-cf-worker` |
| Static-fallback (web) | manifest+route parity, dispatcher behaviour | `pnpm test --filter visitportal-web` |
| `/api/visit` proxy | SSRF guard, rate-limit | `pnpm test --filter visitportal-web` |
| Bench harness | RNG determinism, mcp-simulator, token counter | `pnpm test --filter @visitportal/bench` |
| Agent simulation (mocked) | tool_use loop, dispatch, error handling | `pnpm test --filter @visitportal/bench` |
| Live conformance | manifest valid + NOT_FOUND round-trip | `pnpm conformance <url>` |
| Bench (real Anthropic counts) | MCP-vs-Portal token cost matrix | `pnpm bench` |
| Agent simulation (live) | real Claude visits Portal, tool_use → tool_result loop | `ANTHROPIC_API_KEY=... pnpm tsx packages/bench/scripts/agent-sim.ts` |

CI runs build → test → bench → conformance on every push (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)). The live agent-sim is opt-in (requires API key; not gated in CI) — it's the proof-of-life that a real LLM can drive a Portal visit cold.

---

## 9. What NOT to build

Quoted from [`docs/ROADMAP.md`](./ROADMAP.md) "Explicitly out of scope":

- **SSE streaming** — use [A2A](https://a2a-protocol.io)
- **Task lifecycles** — create / poll / cancel — use A2A
- **Multi-agent choreography** — use A2A
- **Per-connection session state** — visitors are fire-and-forget by design
- **Authentication framework** — Portal declares `auth` in the manifest, but the authentication *protocol* belongs in Portal Extensions (PE-001 ERC-8004, PE-002 x402, etc.), never in the base spec

And from project [`.claude/CLAUDE.md`](../.claude/CLAUDE.md):

- No new authentication layers in the base packages — extensions only
- No imports of AISO, TrendingRepo, AGNT, AGP, ClawPulse, ERC-8004 in `packages/` or `reference/` — those are external integrations
- No spec rewrite without a version bump
- No SDK function ships without tests
- No premature abstractions; minimum surface area

If a proposal needs more than two paragraphs to justify, **simplify it**. If a proposal cannot be implemented by a small team in <2–4 weeks, **remove it**.
