# Changelog

All notable changes to Portal are recorded here. The specification is versioned independently in `docs/spec-v*.md`; npm packages track the spec version, except where noted.

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
