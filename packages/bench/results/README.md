# Bench results — `@visitportal/bench`

This directory holds the benchmark results that back every token-cost claim
on [visitportal.dev](https://visitportal.dev). Per project integrity rule:
**if these numbers disagree with the one-pager, the one-pager updates —
never the other way.**

## How to reproduce

```sh
# From the monorepo root:
export ANTHROPIC_API_KEY=sk-ant-...
pnpm install
BENCH_MODE=count_tokens_only pnpm --filter @visitportal/bench bench
# ~20s, ~$0.10 total API spend
# writes bench-<ISO-timestamp>.{json,md,svg} here

# For the full matrix (includes end-to-end latency + tool-choice fidelity):
pnpm --filter @visitportal/bench bench
# ~240 cells, ~$30-35 on Sonnet+Opus — see packages/bench/METHODOLOGY.md for cost math
```

Smoke (mock, $0, <5s):

```sh
pnpm --filter @visitportal/bench bench:smoke
```

## Canonical v1 result

`tokens-matrix-v1.{json,md,svg}` is the first real-API matrix run that the
one-pager cites. Measured **2026-04-19** against `claude-sonnet-4-5` and
`claude-opus-4-5` via `POST /v1/messages/count_tokens`. Seed `42`.

### Headline table — median input tokens per turn

| Tool count | MCP | Portal | MCP:Portal ratio | % of Sonnet 200k window (MCP) |
|---:|---:|---:|---:|---:|
| 10  | 1,956  | 172 | **11.4×** | 1.0% |
| 50  | 7,343  | 172 | **42.7×** | 3.7% |
| 100 | 13,929 | 172 | **81.0×** | 7.0% |
| 400 | 54,677 | 172 | **317.9×** | 27.3% |

### Observations

- **MCP scales linearly at ~137 tokens per preloaded tool** (from our
  template-based simulator; see `packages/bench/METHODOLOGY.md` for
  representativeness disclosure — real MCP with `$ref`/`oneOf` is likely
  more expensive, so our MCP number is a conservative lower bound).
- **Portal stays flat at ~172 tokens** regardless of tool count. This is
  the architectural property the spec is designed for: the manifest is
  loaded on visit, not preloaded into every turn.
- **Tokenizer parity across Sonnet 4.5 and Opus 4.5** — token counts are
  byte-for-byte identical across the two models for the same prompt +
  tool list, confirming both share a tokenizer.

### Integrity contract

Every per-cell row in `tokens-matrix-v1.md` links to the matching
`runIndex` in `tokens-matrix-v1.json`. The JSON is the raw source of
truth; the Markdown and SVG are derived. Re-running with the same seed
and API key will produce the same token counts (modulo Anthropic-side
pricing/tokenizer updates).

## Naming convention

- `bench-<ISO-timestamp>.{json,md,svg}` — every run writes a new tuple.
- `tokens-matrix-v1.{json,md,svg}` — canonical snapshot the one-pager
  references. Bump to `v2` when material methodology changes (new
  tokenizer, new task set, new tool-count range).
