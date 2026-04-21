# Changelog

All notable changes to Portal are recorded here. The specification is versioned independently in `docs/spec-v*.md`; npm packages track the spec version, except where noted.

## [0.1.4] — 2026-04-21

### Changed

- **Positioning reframed to HTTP-native.** Portal is now explicitly positioned as "the minimal HTTP contract for agent-accessible services," not "an LLM client visit layer." Landing page, docs, READMEs, OG images, and all web copy updated. **No spec or code changes.**
- **Docs restructured to flow-first.** Curl examples lead every adopter page; the SDK is positioned as optional convenience, not prerequisite.

### Added

- **Spec Appendix E — alternate discovery (draft).** Providers MAY serve the manifest at `/.well-known/portal.json` in addition to `/portal`. Both MUST return byte-identical manifests. Aligns Portal with the `.well-known/` convention used by x402, security.txt, and OpenID Connect. Status: v0.1 draft; will promote to normative in v0.2 after ecosystem feedback.
- **PE-002 Paid Tools draft.** HTTP 402 payment handoff for paid tools, x402-compatible. Opt-in extension, declared via manifest `extensions` array. Non-normative in base v0.1 spec. See `docs/pe-002-paid-tools-draft.md`.
- **Three-layer positioning documented** across landing, docs, and READMEs: Portal for drive-by HTTP visits (tier 1), MCP for installed stateful tools (tier 2), A2A for multi-agent coordination (tier 3). They compose.
- **Reference Portal serves `/.well-known/portal.json`** alongside `/portal`. Both paths return byte-identical JSON; smoke test asserts parity.

### Version

- All monorepo packages bumped 0.1.3 → 0.1.4.
- Install scripts pinned to `v0.1.4` tag.

### Not changed

- **Normative spec** remains v0.1.1 (`docs/spec-v0.1.1.md`). No schema changes. No endpoint changes. No envelope changes.
- **Sev-1 hardening from v0.1.3** (Upstash rate limit, reference Portal rate limit + CORS + status codes, defensive security headers, Fly scaling, SSRF guard, visitor-SDK hardening) unchanged.
- **All 164 tests still green.**

## [0.1.3] — 2026-04-20

Second-wave hardening pass — five Sev-level fixes across the stack. No spec change; the normative spec stays at v0.1.1 (`docs/spec-v0.1.1.md`). All five items are additive or defensive; no breaking API.

### Added

- **Rate limit on `/api/visit` (Sev-1)** — sliding-window 10 req/min/IP backed by Upstash Redis (`@upstash/ratelimit` + `@upstash/redis`). Lazy-init: when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are unset the module warns once and fails-open so local dev keeps working. Allowed responses carry `X-RateLimit-Limit/Remaining/Reset`; blocked responses return 429 with `Retry-After` and the existing `VisitResponse` error shape. See `web/README.md` for env-var setup.
- **Rate limit on reference Portal `/portal/call` (Sev-1)** — in-memory 60 req/min/IP fixed window, keyed by `fly-client-ip` → `x-forwarded-for[0]` → `unknown`. Self-cleaning above 10k buckets. The manifest endpoint (`GET /portal`) is deliberately NOT limited at origin — that's CDN / edge territory.
- **Full defensive security headers on visitportal.dev (Sev-1)** — HSTS (2 years + preload), `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/microphone/geolocation/interest-cohort denied), and a CSP with `default-src 'self'` plus narrow allowances for Google Fonts + inline styles/scripts that Next.js 15 still emits. Mirrored in `next.config.mjs` (for local `next start`) and `vercel.json` catch-all (edge defense in depth).
- **Visitor SDK `onEvent` hook (Sev-2)** — four structured events: `visit.start`, `visit.end` (with `ms` + `bytes`), `call.start`, `call.end` (with `ok`). User callbacks wrapped in try/catch — a throwing hook can't break the SDK. New `VisitEvent` type in the public barrel.

### Changed

- **Reference Portal status codes (Sev-1)** — every error envelope now carries the correct HTTP status (`NOT_FOUND:404`, `INVALID_PARAMS:400`, `UNAUTHORIZED:401`, `RATE_LIMITED:429`, `INTERNAL:500`). Body shape unchanged. `@visitportal/spec/runner` and the CLI both now accept 4xx as well as 200 for the NOT_FOUND envelope per the convention.
- **Reference Portal CORS (Sev-1)** — normative `hono/cors` wired on both `/portal` and `/portal/call` per spec v0.1.1 Appendix C. Replaces the old `TODO: add CORS middleware` placeholder.
- **Fly.io scaling (Sev-1)** — `min_machines_running: 1` (no cold start for first visitor), `memory_mb: 512` (was 256, headroom for bursty load), and a new `[http_service.concurrency]` block with `soft_limit: 50` / `hard_limit: 100` requests. Secondary-region scaffolding committed as comments; uncomment + `flyctl scale count 2 --region lhr` when traffic justifies the cost.
- **Visitor SDK hardening (Sev-2)** — `@visitportal/visit` now enforces `https://` on both the fetched URL and `manifest.call_endpoint`. Plain `http://` is rejected unless `allowInsecure:true` AND the hostname is loopback (`localhost` / `127.0.0.1` / `::1`). Cross-origin `call_endpoint` triggers a one-shot `console.warn`; `strictSameOrigin:true` upgrades to a thrown `ManifestInvalid`. Response body capped at 1 MB by default (streaming reader), configurable via `maxBytes`. Automatic retry (once, with 100ms + 0–200ms jitter) on transport errors and 5xx responses — 4xx and successful parses are never retried. Real `AbortController`-based timeout replaces the old race-based one (which leaked the fetch on expiry). Bundle size: 2.25 kB → 3.14 kB gzipped (+890 bytes; 15 kB ceiling unchanged).

### Fixed

- **CLI conformance probe accepts 4xx (Sev-2 follow-up)** — the reference's switch to HTTP 404 for NOT_FOUND broke the CLI's probe, which required HTTP 200. Now matches `@visitportal/spec/runner`'s convention: 200 OR 4xx, gated on envelope shape.
- **CLI `visit-portal <cmd> http://localhost:...` keeps working** — CLI passes `allowInsecure:true` so the user doesn't have to remember a flag for local development. Non-loopback `http://` URLs are still rejected by the SDK guard even with the flag set.

### Packages

- `@visitportal/spec`: 0.1.2 → 0.1.3 (republished to npm; spec content unchanged, version bump tracks the release)
- `@visitportal/visit`: 0.1.1 → 0.1.3 (private, hardening changes)
- `@visitportal/cli`: 0.1.1 → 0.1.3 (private, probe + HTTPS flag)
- Install scripts `VERSION`: 0.1.1 → 0.1.3

### Tests

- Spec: 32 vectors (unchanged)
- Visit SDK: 14 → **28** (+14 hardening cases: size cap, HTTPS enforcement, same-origin, retry-on-5xx-not-4xx, onEvent order, throwing-hook isolation)
- CLI: 6 → **8** (+2 regression cases for probe false-pass)
- Reference Portal: 6 → **10** (+4: malformed JSON 400, OPTIONS preflight on both endpoints, 70-request rate-limit burst)
- Web app (`/api/visit`): 16 → **19** (+3: rate-limit no-env fallback, single-warn, partial-env-not-throw)
- Bench: 65 (unchanged)
- **Total: 162** (up from 141)

## [0.1.2] — 2026-04-20

### Fixed

- **`@visitportal/spec@0.1.1` was published with no `"license"` field**, causing the npm registry page to show "License: not specified". Every `package.json` in the monorepo now declares `"license": "Apache-2.0"` to match the root `LICENSE` file.

### Notes

- **Package-metadata-only release.** No normative spec change — the spec document remains at v0.1.1 (`docs/spec-v0.1.1.md`). The `manifest.schema.json` `$id`, the `conformance/vectors.json` `spec_version`, and all runtime behaviour are identical to 0.1.1.
- Decision captured: Portal stays **Apache 2.0** (code) + **CC0 1.0** (spec documents + `conformance/vectors.json`). Apache's explicit patent grant is load-bearing for a protocol aiming at multi-party adoption; the spec itself is public domain under CC0. See the rationale in `README.md` "License" section.

## [0.1.1] — 2026-04-19

### Added

- **Spec Appendix C — Normative CORS requirements** for browser-resident visitors. Upgrades `OPTIONS` preflight + `Access-Control-Allow-Origin` semantics to MUST on both endpoints, with a per-auth-mode table for credentialed requests.
- **Spec Appendix D — Rate-limit defaults + `Retry-After` guidance.** SHOULD-level recommended defaults per auth mode; visitor SDKs MUST treat `RATE_LIMITED` as recoverable.
- **`validateAgainstVectors(manifest)`** in `@visitportal/spec` — offline full-vector self-check for adopter pre-flight CI.
- **`ipaddr.js`** dependency in the web app for SSRF hostname-resolution checks.
- **Vector MV-11-loopback-http** and **MI-11-plain-http-public-host** exercising the tightened `call_endpoint` pattern.
- **First Adopter Debrief** section in the root README; full debrief in `docs/ADOPTER-DEBRIEF.md`; roadmap in `docs/ROADMAP.md`.
- **Windows-shell requirement** documented for `scripts/demo.sh` (low-severity audit item).

### Changed

- **`call_endpoint` JSON-Schema pattern tightened** to `https://` with explicit `http://localhost` / `http://127.0.0.1` loopback escape hatches. The v0.1.0 prose already required HTTPS; the schema now matches. Non-breaking in practice — no known adopter used plain HTTP against a public host.
- **`runConformance` renamed to `runSmokeConformance`.** The old name overclaimed — it only smoke-checks manifest shape + NOT_FOUND round-trip. Full-suite validation is now `validateAgainstVectors`. Zero external callers existed (package was unpublished), so no alias.
- **`/api/visit` SSRF** now resolves hostnames and rejects any resolved IP outside the `ipaddr.js` unicast range. Closes the DNS-rebinding gap flagged by the external audit. The existing HTTPS-only, 5s timeout, 1 MB cap, and 3-redirect limit stay in place.
- **CLI `conformance` subcommand** now uses raw `fetch()` against the manifest's `call_endpoint`, bypassing `@visitportal/visit`'s client-side tool-name validation. Previous behavior falsely passed against providers that didn't actually emit a `NOT_FOUND` envelope. Audit-flagged HIGH.
- **`reference/star-screener/` → `reference/trending-demo/`.** Folder and pnpm package name changed; the manifest's display name "Star Screener (reference demo)" is unchanged.
- **`packages/visit/ts/scripts/integration.ts` → `reference-demo.ts`.** The old name conflated monorepo-developer tooling with spec conformance. Rename clarifies it's a demo driver, not a conformance tool.
- **Adopter docs** (`/docs`) rewritten to lead with `runSmokeConformance` import-and-go. Monorepo developer tools moved to the bottom under a clearly-labeled section.

### Fixed

- **Stale `.next/` cache** could cause `pnpm --filter visitportal-web start` to return 500 on `/` after certain dev-mode rebuilds. Documented in README; `.gitignore` already covered `.next/`. Clean rebuild resolves the issue. Audit-flagged BLOCKER; confirmed non-reproducible after clean build.

### Attribution

- **External audit** (April 2026): HTTPS mismatch, `runConformance` overclaim, CLI false-pass, `/api/visit` SSRF DNS-rebind gap, Windows-shell documentation, stale `.next/` 500, install-script TODO URLs, deployment.
- **First production adopter debrief** (April 2026): published `@visitportal/spec` to npm, renamed reference/integration scripts, adopter-docs re-lead, First Adopter Debrief README section, normative CORS, SHOULD-level rate-limit defaults.

### Pending (not in this release)

- `npm publish --access public` of `@visitportal/spec@0.1.1` — prepared in this batch, requires 2FA and is executed by the human maintainer.
- `visitportal.dev` public deployment — `vercel --prod` + DNS, requires maintainer auth.
- Install-script real tag + SHA256 pin — requires v0.1.1 GitHub release artifact.

## [0.1.0] — 2026-04-19 (superseded same day)

Initial freeze for the Claude Code hackathon submission. Superseded by v0.1.1 hours later after adopter-debrief findings. Full spec preserved in git history at `docs/spec-v0.1.0.md` (see commit `7ec1138`).
