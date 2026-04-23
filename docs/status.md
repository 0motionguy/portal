# Portal — what's shipped, what's stretch

Derived from the monorepo's git log and the Phase plan in
`docs/CLAUDE.md`. Every row cites a commit or an artifact path.

## Shipped

| Phase | Scope | Status | Commit | Artifact |
|---|---|---|---|---|
| 0 | Empty monorepo scaffold (pnpm workspace, biome, tsconfig) | done | `c82c882` | `pnpm-workspace.yaml`, `biome.json` |
| 1 | Spec v0.1.0 frozen · schema + 30 conformance vectors · lean validator in parity | done | `98ec8d9` | `docs/spec-v0.1.0.md`, `packages/spec/manifest.schema.json`, `packages/spec/conformance/vectors.json` |
| 2 | `reference/trending-demo` — Hono server, 3 tools, 30-repo snapshot, 12-maintainer roster, Fly-ready | done | `d1c40ba` | `reference/trending-demo/src/server.ts`, `reference/trending-demo/portal.json` |
| 3 | `@visitportal/visit` — TS visitor SDK, 14 vitest cases, ~2.25 kB gzipped | done | `272cd53` | `packages/visit/ts/src/index.ts`, `packages/visit/ts/test/visit.test.ts` |
| 5 | `@visitportal/bench` — 48-cell `count_tokens` matrix, measured 81× less overhead than MCP at 100 tools | done | `f6c8b32` | `packages/bench/src/run.ts`, `packages/bench/results/tokens-matrix-v1.md` |
| v0.1.6 | `@visitportal/provider` and `@visitportal/mcp-adapter` published to npm | done | this release | `packages/provider/ts`, `packages/mcp-adapter` |

## Phase 6 — in progress

| Scope | Status | Artifact |
|---|---|---|
| `@visitportal/cli` — `visit-portal info \| call \| conformance`, 6 vitest cases | done (not yet commited) | `packages/cli/src/cli.ts` |
| Root README, LICENSE, CONTRIBUTING, SECURITY, architecture, `.editorconfig`, PR + issue templates | done (this commit) | `README.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/architecture.md`, `.github/` |
| `docs/quickstart-provider.md`, `docs/quickstart-visitor.md`, `docs/demo-script.md`, `scripts/demo.sh`, CLI README | in progress | `docs/quickstart-*.md`, `scripts/demo.sh`, `packages/cli/README.md` |
| `web/public/index.html`, `web/public/install`, `web/public/directory.json`, `web/vercel.json` | in progress | `web/public/*` |

## Stretch (held for Phase 7+ or v0.2)

| Scope | Why it's stretch |
|---|---|
| `visitportal` Python SDK | TS surface was first; Python mirrors v0.2 once the TS API is proven. |
| Cold-start latency + concurrent-visits benches | Token-cost matrix is the headline number; extra scenarios ride on the same harness when added. |
| Public directory / discovery service | Single-URL visits work fine today; discovery is a follow-on product. |

## Cut (deliberately, for this hackathon)

| Scope | Why |
|---|---|
| Live `starscreener.xyz` deployment | Demo is local-first — `bash scripts/demo.sh` spins the reference Portal on port 3075. A live Fly/Vercel deploy is nice-to-have, not verification-critical. |
| Server-initiated messages, streaming, multi-step task lifecycles | Spec §7 non-goals. Use MCP (installed) or A2A (lifecycled) for those. |
| Auth beyond `"none"` / `"api_key"` | `erc8004` is extension PE-001, x402 is PE-002. Base stays neutral. |

## Test count baseline

```
packages/spec            30 vectors OK
packages/bench           65 tests  (3 files)
packages/visit/ts        14 tests  (1 file)
packages/cli              6 tests  (1 file)
reference/trending-demo   6 tests  (1 file)
----------------------------------
                        121 tests  (10 files + spec vectors)
```

Re-derive any time with `pnpm -r --if-present test`.
