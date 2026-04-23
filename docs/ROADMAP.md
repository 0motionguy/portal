# Portal Roadmap

## Shipped in v0.1.5 (current)

Small adopter-ergonomics release. Spec bumped v0.1.4 → v0.1.5 with additive manifest relaxations; no endpoint or envelope changes.

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

- **PE-002 paid tools** — implementation (draft exists in [`docs/pe-002-paid-tools-draft.md`](pe-002-paid-tools-draft.md))
- **`@visitportal/provider`** — one-line provider helper
- **`@visitportal/x402-adapter`** — make any x402 provider Portal-discoverable in 50 LOC
- **MCP → Portal adapter** — implementation of the stub at `packages/mcp-adapter`
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
