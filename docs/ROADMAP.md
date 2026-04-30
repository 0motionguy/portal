# Portal Roadmap

## Shipped in v0.1.8 (current) — agent commerce: PE-002 paid tools

Per-call paywall extension graduates from draft to stable. Reference adapter ships as `@visitportal/x402-adapter`. Wire-compatible with both [x402](https://x402.org) (Coinbase, ~75M txns / $24M settled by Dec 2025) and the [MPP](https://mpp.dev) `charge` intent (Cloudflare/Stripe/Tempo, x402-`exact` superset). Base v0.1 wire byte-identical to v0.1.5; PE-002 is opt-in.

- **`@visitportal/x402-adapter`** — `withPayment(handler, { price, facilitator })` wrapper. Throws on unpaid, verifies on `X-Payment`, returns the 402 challenge in the standard Portal envelope. BYO facilitator (Coinbase, self-hosted, mock for tests). [`packages/x402-adapter`](../packages/x402-adapter).
- **PE-002 stabilized** — [`docs/pe-002-paid-tools.md`](./pe-002-paid-tools.md) (was `-draft`). Body shape locked, MPP/AP2 compatibility documented.
- **Provider package extended** — `PaymentRequiredError` class + `STATUS_BY_CODE.PAYMENT_REQUIRED = 402` + `BaseErrorCode` / `ExtensionErrorCode` type split.
- **Reference paid Portal** — [`reference/portal-cf-worker`](../reference/portal-cf-worker) ships `premium_data` (paid) alongside `whoami` and `reverse` (free). 14 smoke tests cover the 402/X-Payment flow.
- **Quickstart** — [`docs/quickstart-paid-tools.md`](./quickstart-paid-tools.md). 10 minutes from clone to a working paid tool.

## Shipped in v0.1.7 — adopter ergonomics + release alignment

Spec doc renamed `v0.1.5 → v0.1.7` and all five npm packages bumped to `0.1.7` together. **Wire protocol byte-identical to v0.1.5** — every v0.1.5-conformant Portal remains v0.1.7-conformant. Plus additive docs + one new reference example + one new test target.

- **Cloudflare Worker reference** — [`reference/portal-cf-worker`](../reference/portal-cf-worker), runs `provider.serve()`'s Web-standard `fetch` handler. ~30 lines of glue. Quickstart: [`docs/quickstart-cloudflare-worker.md`](./quickstart-cloudflare-worker.md).
- **Static-fallback recipe** — for sites that ship as static assets. Static manifest + single serverless function dispatcher. Quickstart: [`docs/quickstart-static-fallback.md`](./quickstart-static-fallback.md). Live example: [`web/public/portal-static-example.json`](../web/public/portal-static-example.json) + [`web/app/api/portal-static-example/call/route.ts`](../web/app/api/portal-static-example/call/route.ts).
- **AISO Portal Readiness Score** — external integration contract. 5×20-point rubric. [`docs/integrations/aiso-readiness-score.md`](./integrations/aiso-readiness-score.md) + JSON Schema.
- **TrendingRepo "Portal Ready" badge** — external integration contract. 4 badge states + 3-line preview. [`docs/integrations/trendingrepo-portal-badge.md`](./integrations/trendingrepo-portal-badge.md).
- **End-to-end agent simulation** — real Claude → Portal tool-use loop. Mocked unit test in CI. [`packages/bench/scripts/agent-sim.ts`](../packages/bench/scripts/agent-sim.ts), [`packages/bench/test/agent-sim.test.ts`](../packages/bench/test/agent-sim.test.ts).
- **Architecture overview** — single-page assembly of "how an agent visits a website" across 9 sections. [`docs/architecture-overview.md`](./architecture-overview.md).
- **Release alignment** — every package, the spec doc, the schema `$id`, and the conformance vectors `spec_version` now read `0.1.7`. No wire change.

## Shipped in v0.1.5 — relative call_endpoint + paramsSchema precedence

Adopter-ergonomics release. Spec bumped v0.1.4 → v0.1.5 with additive manifest relaxations; no endpoint or envelope changes. (Renamed to `v0.1.7` in the v0.1.7 release-alignment pass; wire-identical.)

- **Relative `call_endpoint`** — manifests can declare `"call_endpoint": "/portal/call"` and visitor SDKs resolve against the manifest URL.
- **`paramsSchema` precedence** — JSON Schema 2020-12 accepted alongside the sugar `params` form, with `paramsSchema` taking precedence when both are present.
- **Framework quickstarts** — Next.js App Router, Hono, FastAPI, Express.
- **PowerShell demo script** — native Windows twin for `scripts/demo.sh`.

## Shipped in v0.1.4

HTTP-native positioning reframe. Spec bumped v0.1.1 → v0.1.4 (editorial; Appendix E draft + PE-002 reference added). No wire protocol change.

- **Positioning reframed** — Portal is now explicitly "the minimal HTTP contract for agent-accessible services," not "an LLM client visit layer." Landing page, docs, READMEs, and OG images rewritten; curl-first flow throughout. No spec or code changes.
- **Three-layer positioning** documented across landing + docs + READMEs — Portal (drive-by HTTP visits) / MCP (installed stateful tools) / A2A (multi-agent coordination). They compose.
- **Spec Appendix E — alternate discovery (draft)** — providers MAY also serve the manifest at `/.well-known/portal.json`. If both paths are served, they MUST return byte-identical manifests. Aligns Portal with the `.well-known/` convention (x402, security.txt, OpenID Connect). Will promote to normative in v0.2 after ecosystem feedback.
- **PE-002 Paid Tools (draft)** — HTTP 402 payment handoff for paid tools, x402-compatible. Opt-in extension, non-normative in base v0.1 spec. See [`docs/pe-002-paid-tools-draft.md`](pe-002-paid-tools-draft.md).
- **Reference Portal serves `/.well-known/portal.json`** alongside `/portal` — byte-identical JSON, smoke test asserts parity.
- **All monorepo packages** bumped 0.1.3 → 0.1.4; install scripts pinned to `v0.1.4`.

## Shipped in v0.1.3

Second-wave hardening pass, all Sev-level fixes. No normative spec change (spec stays at v0.1.1).

- **Rate limit on `/api/visit`** — Upstash sliding window, 10 req/min/IP, graceful fallback when unconfigured
- **Rate limit on reference Portal `/portal/call`** — in-memory 60 req/min/IP, Fly-aware IP extraction
- **Reference Portal HTTP status codes** — 4xx/5xx on errors (was always 200); envelope shape unchanged
- **Reference Portal CORS** — normative `hono/cors` per spec Appendix C on both endpoints
- **Fly.io scaling** — warm instance (no cold start), 512 MB memory, 50/100 concurrency config
- **Full defensive security headers on visitportal.dev** — HSTS, CSP, frame-ancestors:none, permissions-policy, referrer-policy
- **Visitor SDK hardening** — 1 MB response cap, HTTPS enforcement with loopback opt-in, same-origin warn + `strictSameOrigin` opt-in, one automatic retry on transport/5xx, `onEvent` observability hook (4 kinds)
- **CLI `visit-portal <cmd> http://localhost:…`** — automatic `allowInsecure` for CLI users; non-loopback http:// still rejected
- **CLI conformance probe accepts 4xx** — matches `@visitportal/spec/runner` convention

## Shipped in v0.1.2 (2026-04-20)

- Every `package.json` declares `"license": "Apache-2.0"` — fixes the `@visitportal/spec@0.1.1` "License: not specified" on npm
- License rationale captured: Apache 2.0 (code) + CC0 1.0 (spec documents) — Apache's patent grant matters for a protocol aiming at multi-party adoption

## Shipped in v0.1.1 (2026-04-19)

- `@visitportal/spec` published on npm (Apache 2.0 + CC0)
- `runConformance` → `runSmokeConformance` rename; `validateAgainstVectors()` added for offline full-suite checking
- Normative CORS appendix (spec Appendix C)
- SHOULD-level rate-limit defaults + `Retry-After` guidance (spec Appendix D)
- `call_endpoint` tightened to HTTPS-only with explicit loopback escape hatch
- Reference demo renamed `reference/star-screener` → `reference/trending-demo` (display name "Star Screener" unchanged)
- `packages/visit/ts/scripts/integration.ts` → `reference-demo.ts`
- CLI `conformance` subcommand bypasses SDK validation (audit fix)
- `/api/visit` SSRF hardened with `ipaddr.js` + DNS resolution (audit fix)
- Web `/docs` rewritten to lead with `runSmokeConformance` (adopter-debrief fix)
- README: First Adopter Debrief section (social proof)
- Windows shell requirement documented for `scripts/demo.sh` (audit low-sev)

## Planned for v0.2

`@visitportal/provider` and `@visitportal/mcp-adapter` have already shipped as npm package release `0.1.6`. The list below reflects the remaining release work unless noted otherwise.

- **PE-002 paid tools** — implementation (draft exists in [`docs/pe-002-paid-tools-draft.md`](pe-002-paid-tools-draft.md))
- **`@visitportal/provider`** — shipped in `0.1.6`; one-line provider helper
- **`@visitportal/x402-adapter`** — make any x402 provider Portal-discoverable in 50 LOC
- **`@visitportal/mcp-adapter`** — shipped in `0.1.6`; wraps MCP stdio servers as Portals
- **Python visitor SDK** (`@visitportal/visit-py`) reaching parity with the TypeScript SDK
- **`@visitportal/cli` GA** — `validate` / `call` / `conformance` subcommands published to npm as a global binary
- **Pagination / cursor envelope** for large responses (`{ ok: true, result, next_cursor }`)
- **Deprecation path for `params` sugar** (paramsSchema-only in v0.2)

## Explicitly out of scope

- **SSE streaming** — use [A2A](https://a2a-protocol.io) for that
- **Task lifecycles** — create / poll / cancel — use A2A
- **Multi-agent choreography** — use A2A
- **Per-connection session state** — visitors are fire-and-forget by design
- **Authentication framework** — Portal declares `auth` in the manifest, but the authentication *protocol* belongs in Portal Extensions (PE-001 ERC-8004, PE-002 x402, etc.), never in the base spec

---

Open a PR against `docs/ROADMAP.md` to propose additions or re-orderings. Every v0.1.x ships in one commit per item; v0.2 will be a coordinated breaking-change release.
