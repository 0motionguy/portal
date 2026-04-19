# Portal

> Two endpoints. One manifest. Any LLM client can visit cold.

**Built with Opus 4.7** · Portal v0.1.1 · Claude Code hackathon, Apr 2026

Portal is an open HTTP standard — two endpoints, one manifest, fire-and-forget — that lets any LLM client with function-calling discover and invoke a service's tools without pre-configuration. It is a complement to MCP, not a replacement: MCP = installed tools (trusted, daily), Portal = drive-by visits (long tail, zero residue).

This repo contains the v0.1.1 spec, a conformance runner, a TypeScript visitor SDK, a CLI, a reference Portal, and a reproducible MCP-vs-Portal benchmark.

## See it in 30 seconds

```sh
pnpm install
bash scripts/demo.sh          # ~6 s end-to-end: starts a Portal, visits it, leaves
```

Or break it apart:

```sh
# Terminal 1 — run the reference Portal
PORT=3075 PORTAL_PUBLIC_URL=http://localhost:3075 pnpm --filter trending-demo start

# Terminal 2 — visit it
pnpm --filter @visitportal/cli exec tsx src/cli.ts info http://localhost:3075/portal
pnpm --filter @visitportal/cli exec tsx src/cli.ts call http://localhost:3075/portal top_gainers --params '{"limit":3}'
pnpm conformance http://localhost:3075/portal
```

Reproduce the benchmark claims (requires an `ANTHROPIC_API_KEY`):

```sh
export ANTHROPIC_API_KEY=sk-ant-...
BENCH_MODE=count_tokens_only pnpm --filter @visitportal/bench bench
# 48 cells against Anthropic's count_tokens API in ~20 s, ~$0.10 total
```

## The measured numbers

Source of truth: [`packages/bench/results/tokens-matrix-v1.md`](packages/bench/results/tokens-matrix-v1.md). Every cell writes to [tokens-matrix-v1.json](packages/bench/results/tokens-matrix-v1.json).

| Tool count | MCP (median input tokens) | Portal | MCP : Portal |
|---:|---:|---:|---:|
|  10 |  1,956 | 172 |  **11.4×** |
|  50 |  7,343 | 172 |  **42.7×** |
| 100 | 13,929 | 172 |  **81.0×** |
| 400 | 54,677 | 172 | **317.9×** |

MCP scales linearly at ~137 tokens per preloaded tool. Portal stays flat at 172 tokens regardless of tool count — the manifest is loaded on visit, not preloaded into every turn. Sonnet 4.5 and Opus 4.5 produce byte-identical token counts (same tokenizer).

## Architecture

```
 /web/public                 visitportal.dev · one-pager, install, directory
 ─────────────────────────────────────────────────────────────────────────
 /reference/trending-demo    demo Portal (Hono, 3 tools, 30 repos seeded) — "Star Screener"
 /packages/cli               visit-portal info|call|conformance
 /packages/bench             measured MCP-vs-Portal (Anthropic count_tokens)
 ─────────────────────────────────────────────────────────────────────────
 /packages/visit/ts          TS visitor SDK — visit(url) → Portal
 /packages/visit/py          Python SDK (stub, v0.2)
 /packages/provider/ts       optional provider helper
 /packages/mcp-adapter       wrap MCP as Portal (stub, v0.2)
 ─────────────────────────────────────────────────────────────────────────
 /packages/spec              JSON Schema + 30 conformance vectors + runner
```

Flow is strictly downhill: upper layers import from lower, never the other way. Base packages never pull AGP / ClawPulse / AGNT / ERC-8004 — those are Portal Extensions (see [`docs/extensions/`](docs/extensions/)). Full details in [`docs/architecture.md`](docs/architecture.md).

## Repo layout

```
docs/
  spec-v0.1.1.md                the current spec (supersedes v0.1.0)
  one-pager.html                the pitch (rendered at web/public/index.html)
  quickstart-provider.md        ship a Portal in 10 min
  quickstart-visitor.md         visit a Portal in 10 lines
  demo-script.md                the human-runnable demo
  architecture.md               package layering + import rules
  status.md                     shipped / stretch / cut, with commits

packages/
  spec/          manifest.schema.json, conformance/vectors.json, runner.ts, lean-validator.ts
  visit/ts/      src/{visit,errors,types,validate,index}.ts + test + scripts/size.ts
  visit/py/      stub (stretch)
  provider/ts/   stub
  mcp-adapter/   stub (stretch)
  bench/         src/{harness,tasks,templates}, scripts/{run,smoke}.ts, results/, METHODOLOGY.md
  cli/           src/{cli,commands}.ts + test

reference/
  trending-demo/ Hono server, portal.json, tools/{top_gainers,search_repos,maintainer_profile}.ts,
                 frozen 30-repo + 12-maintainer snapshot, Dockerfile, fly.toml.
                 Manifest display name: "Star Screener (reference demo)".

web/
  public/        index.html, install, install.ps1, directory.json, manifest.json
  vercel.json    clean URLs, content-type headers

scripts/
  bench.ts       `pnpm bench` entry (delegates to packages/bench)
  conformance.ts `pnpm conformance` entry (delegates to packages/spec)
  demo.sh        one-click demo runner (~6 s end-to-end)
```

## Quickstarts

- **Provider:** [`docs/quickstart-provider.md`](docs/quickstart-provider.md) — ship a Portal in 10 minutes.
- **Visitor:** [`docs/quickstart-visitor.md`](docs/quickstart-visitor.md) — visit a Portal in 10 lines.
- **CLI:** [`packages/cli/README.md`](packages/cli/README.md) — `visit-portal` reference.
- **Demo:** [`docs/demo-script.md`](docs/demo-script.md) — the human-runnable script behind `scripts/demo.sh`.

## Spec — v0.1.1

The [spec](docs/spec-v0.1.1.md) is one printed page of core + three appendices (plus CORS and rate-limit appendices added in v0.1.1). Two endpoints (`GET /portal`, `POST /portal/call`), one manifest, a five-code error enum (`NOT_FOUND`, `INVALID_PARAMS`, `UNAUTHORIZED`, `RATE_LIMITED`, `INTERNAL`), dual params form (simple sugar + JSON Schema escape hatch).

Explicit non-goals for v0.1: no task lifecycles, no stateful sessions, no server-initiated messages, no streaming, no multi-agent choreography. Those either live in MCP or A2A, or arrive as Portal Extensions (PE-001 verified identity, PE-002 x402 micropayments, etc.).

## Status

| Phase | Status |
|---|---|
| 0 · scaffold | shipped (`c82c882`) |
| 1 · spec v0.1.0 | shipped (`98ec8d9`) |
| 2 · reference Portal | shipped (`d1c40ba`) |
| 3 · TS visitor SDK | shipped (`272cd53`) |
| 5 · benchmark | shipped (`f6c8b32`) |
| 6 · demo + polish | in progress |
| 3b · Python SDK | stretch (stub present) |
| 4 · MCP adapter | stretch (stub present) |

Full table with artifacts in [`docs/status.md`](docs/status.md).

**Deliberately cut for the hackathon:** a live public deploy. The demo is local-first. `bash scripts/demo.sh` spins the reference Portal on port 3075 and exits clean in ~6 s. A Fly/Vercel hookup is documented in [`reference/trending-demo/README.md`](reference/trending-demo/README.md) and [`web/README.md`](web/README.md) for when DNS is ready.

## Reproducibility

Every number on [visitportal.dev](https://visitportal.dev) is traceable to a JSON file in [`packages/bench/results/`](packages/bench/results/). The integrity rule (see [`docs/CLAUDE.md`](docs/CLAUDE.md)): if a measurement disagrees with the one-pager, the one-pager updates — not the measurement. Phase 5 tightened the claimed 30× ratio at 100 tools to the measured 81×.

Tests, types, sizes, and bench numbers are all re-derivable from a clean clone:

```sh
pnpm -r build              # strict tsc across every package
pnpm -r test               # 121 tests (spec 30 + bench 65 + visit 14 + cli 6 + ref 6)
pnpm --filter @visitportal/visit size    # SDK bundle size (limit 15 kB gzipped)
pnpm conformance <url>     # validate any v0.1 Portal
```

## License

Dual-licensed. Code under Apache 2.0, spec under public domain (CC0 1.0). See [LICENSE](LICENSE).

## Credits

Built with Opus 4.7 for the Claude Code "Built with Opus 4.7" hackathon, April 2026, by Mirko Basil Dölger. The spec is open, unowned, and designed to complement MCP / A2A / Skills, not compete with them.
