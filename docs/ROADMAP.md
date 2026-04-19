# Portal Roadmap

## Shipped in v0.1.1 (current)

- `@visitportal/spec` prepped for first public npm publish (Apache 2.0 + CC0)
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

## Planned for v0.1.2 (next week)

- Relative `call_endpoint` — let manifests declare `"call_endpoint": "/portal/call"` and have visitor SDKs resolve against the manifest URL (removes a class of copy-paste bugs)
- `paramsSchema` (JSON Schema draft-07/2020-12) accepted alongside the sugar `params` form, with `paramsSchema` taking precedence when both are present
- Framework quickstarts: Next.js App Router, Hono, FastAPI, Express

## Planned for v0.2

- `@visitportal/cli` GA with `validate` / `call` / `conformance` subcommands published to npm as a global binary
- Pagination / cursor envelope for large responses (`{ ok: true, result, next_cursor }`)
- Deprecation path for `params` sugar (paramsSchema-only in v0.2)

## Explicitly out of scope

- SSE streaming (use [A2A](https://a2a-protocol.io) for that)
- Task lifecycles — create / poll / cancel (use A2A)
- Multi-agent choreography (use A2A)
- Per-connection session state — visitors are fire-and-forget by design

---

Open a PR against `docs/ROADMAP.md` to propose additions or re-orderings. Every Bucket 1 item ships in v0.1.1; Bucket 2 ships in v0.1.2 unless flagged otherwise; Bucket 3 is scoped for v0.2.
