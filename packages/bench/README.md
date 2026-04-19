# @visitportal/bench

Reproducible MCP-vs-Portal benchmark. Source of truth for every number on [visitportal.dev](https://visitportal.dev).

**Status:** stub — Phase 5 (Fri–Sat) lands:
- `scenarios/token-cost-by-tool-count.ts` — MCP-preloaded vs Portal-on-visit, at 10 / 100 / 400 / 1000 tools.
- `scenarios/cold-start-latency.ts` — time from `visit()` to first result.
- `scenarios/adversarial-large-manifest.ts` — worst-case deeply nested 1000-tool manifest.
- `scenarios/adversarial-concurrent-visits.ts` — 50 concurrent visits, p50/p95/p99.

Runs deterministically (seeded RNG) so `pnpm bench` twice in a row yields byte-identical results under `results/`. If numbers disagree with the one-pager, the one-pager updates — never the other way.

See [docs/bench-methodology.md](../../docs/bench-methodology.md) *(lands Phase 5)*.
