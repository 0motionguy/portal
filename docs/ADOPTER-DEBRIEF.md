# Portal — Adopter Debrief

**Read time:** ~8 minutes. **Last updated:** 2026-04-19.

This document is a handoff. If you're a judge reviewing the hackathon entry,
a teammate picking up work, or Mirko returning to the project in three days,
this is the shortest path from zero context to knowing what's built, why it
was built that way, and what's next.

---

## TL;DR — what exists

An open HTTP standard (**Portal v0.1.0**) plus a complete reference
implementation: one frozen spec + conformance vectors, a reference provider,
a TypeScript visitor SDK, a CLI, a reproducible benchmark suite backed by
real Anthropic `count_tokens` measurements, a Next.js web site, and a demo
script that runs end-to-end in under ten seconds.

**The core claim:** Portal loads tool schemas once per visit, not once per
turn. Measured against MCP preloaded schemas on identical tasks:

| Tool count | MCP input tokens | Portal | Ratio |
|---:|---:|---:|---:|
|  10 |  1,956 | 172 |  **11.4×** |
| 100 | 13,929 | 172 |  **81.0×** |
| 400 | 54,677 | 172 | **317.9×** |

Every number above is the output of `pnpm --filter @visitportal/bench bench`
with `BENCH_MODE=count_tokens_only` and an Anthropic API key. Source of
truth: [`packages/bench/results/tokens-matrix-v1.json`](../packages/bench/results/tokens-matrix-v1.json).

---

## The repo in one diagram

```
 /web                        Next.js 15 App Router
   /app/page.tsx             → inlines the one-pager HTML byte-for-byte
   /app/docs /bench /directory
   /app/api/visit            → SSRF-guarded Portal proxy
   /src/components           HeroActionsSlot · LiveVisit · SlotMount · Nav
 ──────────────────────────────────────────────────────────────────────────
 /reference/trending-demo    Hono server, 3 tools, 30 frozen repos
 /packages/cli               visit-portal info|call|conformance
 /packages/bench             Anthropic count_tokens measurement matrix
 ──────────────────────────────────────────────────────────────────────────
 /packages/visit/ts          TS visitor SDK · visit(url) → Portal
 /packages/provider/ts       Optional provider helper (stub)
 /packages/mcp-adapter       Stretch, stub
 ──────────────────────────────────────────────────────────────────────────
 /packages/spec              JSON Schema + 30 conformance vectors + runner
```

Flow rule: upper layers import from lower, never the reverse. Base packages
never pull AGP, ClawPulse, AGNT, or ERC-8004 — those are documented Portal
Extensions (PE-*), not part of the base spec.

---

## The commit log, phase-by-phase

Each commit is reproducible from a clean clone. Running `pnpm install &&
pnpm -r test` after any of these should produce green tests.

| Commit | Phase | What shipped |
|---|---|---|
| `c82c882` | 0 · scaffold | Empty pnpm monorepo (spec, visit/ts, provider/ts, mcp-adapter, bench, reference/trending-demo, web). Placeholder `bench` and `conformance` CLIs. |
| `98ec8d9` | 1 · spec v0.1.0 | Frozen spec + `manifest.schema.json` + 30 conformance vectors + ajv/lean dual-validator. Spec self-test asserts ajv ↔ lean parity. |
| `d1c40ba` | 2 · reference | Hono server at `reference/trending-demo/` with `top_gainers`, `search_repos`, `maintainer_profile` tools, 30-repo frozen snapshot, 12-maintainer roster. Docker + fly.toml ready. |
| `272cd53` | 3 · TS SDK | `@visitportal/visit` with `visit(url)` → `Portal`, typed `.call()`, error taxonomy (`PortalNotFound`, `ManifestInvalid`, `ToolNotInManifest`, `CallFailed`). Bundle: **2.25 kB gzipped** vs 15 kB ceiling. Lean validator kept separate from ajv so SDK doesn't ship ajv to browsers. |
| `f6c8b32` | 5 · benchmark | Harness + MCP simulator + tasks + Anthropic client. 48-cell real-API matrix run; numbers updated the one-pager (claims went UP, 30× → 81×, because measurements were stronger than the conservative pitch). |
| `8f1c997` | 6 · demo+polish | `@visitportal/cli` (`visit-portal info/call/conformance`), `scripts/demo.sh` (7-second end-to-end demo), install script (safety-first POSIX sh + PowerShell variants), root README, LICENSE (Apache 2.0 for code + CC0 for spec), `docs/{quickstart-provider,quickstart-visitor,demo-script,architecture,status}.md`, `.github/` templates. |
| `0c9e1a3` | T1 · one-pager | Added §02b proof & posture dashboard, §06b architecture SVG, §07b who benefits journey table. Fixed quote attribution to "paraphrased", 1,500-tools ceiling relabeled "projected from measured linear fit", aspirational `--visit` disclosure. |
| `bbd4538` | T2 · Next.js | Wrap one-pager in Next.js 15 App Router. Routes: `/`, `/docs`, `/bench`, `/directory`. Top nav, shared styles. Canonical result `/bench` pulls live from `tokens-matrix-v1.json` at build time. |
| `91bd0d4` | 6b · interactive | Hero action bar (install + copy + GitHub link + secondary links), nav integrated into the one-pager's status bar, `/docs` 3-card landing, live visit widget in §06 with same-origin `/api/visit` proxy. Full SSRF hardening. **Hydration-correctness refactor**: single `dangerouslySetInnerHTML` body + `div#anchor` + `<SlotMount>` via `createPortal`. |
| `6e64440` | 6b fix | App Router `icon.svg` eliminates favicon 404. |
| `6dae4f7` | 6b fix | `ExtensionNoiseSilencer` component filters known browser-wallet rejections so Next.js dev overlay stops false-flagging MetaMask/Phantom noise. |
| `5147163` | 6b fix | Removed duplicate `.curl-box` install pill — HeroActionsSlot owns that surface now. |

---

## What works right now (local)

From a clean clone:

```sh
pnpm install                                # links 10 workspaces
pnpm -r build                               # strict tsc across every package
pnpm -r test                                # 121 tests passing:
                                            #   packages/spec       30 vectors
                                            #   packages/bench      65
                                            #   packages/visit/ts   14
                                            #   packages/cli         6
                                            #   reference/star-...   6
bash scripts/demo.sh                        # 7 s end-to-end demo:
                                            #   spins the reference Portal
                                            #   runs 3 CLI commands
                                            #   runs conformance (client + live)
                                            #   cleans up
pnpm --filter visitportal-web dev           # Next.js on :3035
pnpm --filter visitportal-web build         # 7 static + 1 dynamic route
```

Benchmark reproduction:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
BENCH_MODE=count_tokens_only pnpm --filter @visitportal/bench bench
# 48 cells, ~20 s wall clock, ~$0.10 total spend
```

---

## Design decisions worth knowing

### 1. Two validators in the spec package

`@visitportal/spec` exports both an ajv-backed validator (`runner.ts`,
authoritative) and a lean dependency-free validator (`lean-validator.ts`,
browser-safe, shipped into the SDK). The spec self-test asserts they agree
on every one of the 30 vectors. This lets the SDK stay at 2.25 kB gzipped
without sacrificing the ability to be fully schema-compliant.

If the schema changes, **both validators must change together** or CI
fails. Do not skip this.

### 2. Simulated MCP schemas for the benchmark

Real MCP deployments don't publish a 400-tool test matrix. We built
`packages/bench/src/mcp-simulator.ts` to generate plausible schemas from
seed tools in 7 domains (filesystem, github, search, database, http,
communication, knowledge) derived from `modelcontextprotocol/servers`.
Mean description length ~112 chars; 1–6 params per tool.

**This is a conservative lower bound.** Real MCP sometimes uses `$ref`,
`oneOf`, `allOf` JSON Schema constructs we skip. So the MCP numbers are
likely under-estimated; the Portal advantage is likely higher than
measured. Full methodology: [`packages/bench/METHODOLOGY.md`](../packages/bench/METHODOLOGY.md).

### 3. Hydration strategy for the one-pager

The one-pager is a 1,610-line HTML document rendered in Next.js by inlining
its `<style>` + `<body>` into `app/page.tsx` via `dangerouslySetInnerHTML`.
Interactive React widgets (hero action bar, live visit widget) mount into
empty `<div id="portal-slot-*">` anchors via `createPortal` after
hydration completes.

**An earlier design** split the body on marker comments and interleaved
React components between three `dangerouslySetInnerHTML` siblings. This
broke tag balance across fragments (the outer `.wrap` div opened in
fragment 0 and closed in fragment 2), which React 19 correctly flagged
as a hydration mismatch, then regenerated the subtree on the client
— visible as layout stretching on first paint. The current design (one
body, anchors, portal mount) has no SSR/CSR markup to reconcile.

See `web/src/components/SlotMount.tsx` for the pattern if you need to add
more interactive widgets to the one-pager.

### 4. Same-origin API proxy for the live visit widget

Browser → arbitrary Portal URL = CORS wall. Instead, `/api/visit?url=...`
is a same-origin Next.js route that fetches server-side, validates via
`@visitportal/spec/lean-validator`, and returns a discriminated-union
JSON response. This is also closer to the actual deployment model: most
production Portal visits happen from a server (Claude Code CLI, Node
SDKs, agent runtimes), not from a browser.

Security posture in the route:

1. HTTPS or loopback only — plain HTTP to public hosts rejected.
2. IPv4 RFC1918 / 169.254 / 100.64/10 and IPv6 fc00::/7 / fe80::
   rejected even over HTTPS (SSRF defense against literal private IPs).
3. 5 s hard timeout via `AbortController`.
4. 1 MB response body cap (streaming reader).
5. Max 3 redirect hops, each re-guarded.
6. No client request headers forwarded.
7. Error messages sanitized (first line, ≤240 chars).

Full implementation: `web/app/api/visit/route.ts`.

### 5. Integrity rule — one-pager updates when bench disagrees

Stated in `docs/CLAUDE.md` as a non-negotiable project rule. When the
Phase 5 benchmark produced 81× savings at 100 tools instead of the
conservative 30× originally claimed, the one-pager got updated UP to
match. If the bench ever shows a smaller advantage than claimed, the
one-pager gets updated DOWN. The numbers on the marketing page always
match the numbers in `tokens-matrix-v1.json` within 2%.

---

## What's explicitly stretch / cut

Not regressions — documented skip decisions.

- **Python SDK** — `packages/visit/py/` is a stub with the namespace
  reserved on PyPI. TS surface was first; Python mirrors when the TS
  API is proven.
- **MCP adapter** — `packages/mcp-adapter/` is a stub. Wrapping an MCP
  server as a Portal requires stdio introspection + schema translation;
  first-to-cut if Phase 4 slipped. Deferred to v0.2.
- **Live deploy (as of this writing)** — Local-first. `bash scripts/demo.sh`
  is the primary. A Fly / Vercel hookup exists in `reference/trending-demo/fly.toml`
  and `web/vercel.json`; deploy is a one-flag swap when ready.
- **Full `sendMessage` bench matrix** (~$34 in Anthropic API cost) —
  the one-pager's core claim is schema overhead, which `count_tokens_only`
  mode proves for ~$0.10. Latency p50/p95 and tool-choice-fidelity
  measurements are deferred to a Phase 7 polish pass.

---

## Open TODOs visible to a new reader

Grep the repo for `TODO(hackathon)`:

```
web/public/install     TODO: set REPO_URL to the real GitHub URL after push
web/public/install.ps1 TODO: same
web/public/install     TODO: pin REPO_REF to v0.1.0 tag and verify SHA256
web/public/install.ps1 TODO: same
web/app/docs/page.tsx  one link still points at github.com/mbasildolger
web/app/bench/page.tsx one link still points at github.com/mbasildolger
```

All of these flip once the repo is pushed and v0.1.0 is tagged. The
install scripts support `--from-local <path>` so local-dev demos work
without the GitHub URL being live.

---

## If you're picking this up cold

1. **Read this document.** You're in the right place.
2. **Read `docs/spec-v0.1.0.md`** (10 min). It's one printed page of core
   plus three appendices — the smallest useful surface for the whole
   project.
3. **Run `bash scripts/demo.sh`** (7 s). See the thing actually work.
4. **Skim `docs/architecture.md`** (2 min) for package-layer rules.
5. **If you're here to change something**, read `docs/CLAUDE.md` — the
   project operating rules. Integrity > marketing. Strict TS. No `any`.
   Base packages never pull optional extensions. PR ceiling 400 lines.
   Tests required on every SDK / CLI function.

---

## Who built this, when

Phase 0 through Phase 6b shipped across April 19, 2026 using Claude Opus
4.7 (1M context) with parallel subagent orchestration for the
multi-file phases (reference server, benchmark, Phase 6 polish, Phase 6b
interactive). Mirko Basil Dölger reviewed every commit before it landed
and made every scope / cut decision.

The spec is public domain (CC0 1.0). The code is Apache 2.0. See
[`LICENSE`](../LICENSE) for the full text.

---

## Contact

- Issues + PRs: github.com/0motionguy/portal (once pushed)
- Security: see [`SECURITY.md`](../SECURITY.md)
- Hackathon: "Built with Opus 4.7" (Claude Code), April 2026
