# TrendingRepo — "Portal Ready" badge (integration contract)

This document is the producer-consumer contract between **TrendingRepo** (`trendingrepo.com`, internal name `starscreener`) and Portal. TrendingRepo is a separate codebase. No TrendingRepo code or imports live in `packages/` or `reference/` of this repo — that is a [project rule](../../.claude/CLAUDE.md). TrendingRepo consumes the public `@visitportal/spec` package; nothing else crosses the boundary.

## What TrendingRepo displays

For every repository in its index whose homepage exposes a Portal manifest, TrendingRepo shows:

1. A **Portal Ready badge** — one of four states based on the [AISO readiness score](./aiso-readiness-score.md).
2. A **"What agents can do" preview** — three lines built from the manifest itself.
3. A **deep link** to the manifest and to the visitor SDK quickstart.

## Data shape consumed

```json
{
  "repo_id": "0motionguy/portal",
  "portal_url": "https://www.visitportal.dev/portal",
  "manifest": { /* ...validated v0.1.7 manifest... */ },
  "readiness_score": { /* ...AISO score v1, optional... */ },
  "last_checked": "2026-04-30T13:00:00Z"
}
```

`manifest` MUST validate against the v0.1.7 schema (use `validateManifest` from `@visitportal/spec`). `readiness_score` is the [AISO score envelope](./aiso-readiness-score.md) — optional; when absent, badge state is computed from `manifest` alone.

## Discovery

TrendingRepo polls the repo's homepage URL (resolved from the GitHub `homepage` field, falling back to README links). Order:

1. `<homepage>/.well-known/portal.json` (preferred, per [spec Appendix E](../spec-v0.1.7.md))
2. `<homepage>/portal`
3. Give up after both fail with a 5 s timeout each

Server-side only. Do not browser-fetch — credentials/CORS make in-page detection unreliable.

```ts
import { validateManifest } from "@visitportal/spec";

async function detect(homepage: string): Promise<{ url: string; manifest: unknown } | null> {
  for (const path of ["/.well-known/portal.json", "/portal"]) {
    const url = new URL(path, homepage).toString();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const body = await res.json();
      const v = validateManifest(body);
      if (v.ok) return { url, manifest: body };
    } catch {
      // try next path
    }
  }
  return null;
}
```

## Badge states

Four states. Threshold table is the **same** as the AISO score doc — keep them in sync if either changes.

| State | Trigger | Badge text | Color |
|---|---|---|---|
| `none` | No manifest detected | (no badge) | — |
| `detected` | Manifest validates, no AISO score, OR score 1–59 | `Portal` | slate-500 |
| `verified` | AISO score 60–89 | `Portal · verified` | emerald-500 |
| `gold` | AISO score 90–100 | `Portal · 100` (or actual score) | amber-500 |

The `gold` badge prints the numeric score; the others do not. Click target is the manifest URL.

ASCII renders for the spec — the actual UI is TrendingRepo's job:

```
┌────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────┐
│ ◍ Portal               │  │ ✓ Portal · verified      │  │ ★ Portal · 100           │
└────────────────────────┘  └──────────────────────────┘  └──────────────────────────┘
       (detected)                  (verified)                       (gold)
```

## "What agents can do" preview

Three lines, ≤ 80 chars per line:

```
Line 1:  manifest.brief                       (truncate to 80 chars + "…")
Line 2:  N tools — first three by name, comma-separated, "+M more" if N>3
Line 3:  GET /portal · POST /portal/call      (or actual manifest_url)
```

Worked example for the reference Star Screener Portal:

```
Surface trending GitHub repos and maintainers for an LLM client to read.
3 tools — top_gainers, search_repos, maintainer_profile
demo.visitportal.dev/portal
```

Truncation: replace the last character with `…` when over 80. Never truncate mid-word in `manifest.brief` — find the previous space.

## Refresh cadence

| Trigger | Recompute |
|---|---|
| Repo enters TrendingRepo index | Detect immediately; if found, persist |
| Hourly background sweep | Re-detect for every repo with a known Portal URL |
| AISO webhook on score change | Update `readiness_score` field |
| User clicks "re-check" | Re-detect, rate-limited 1/hour/IP |

Persist the manifest payload (compressed). The badge UI reads from the persisted record, never live-fetches.

## Failure modes

| Cause | Badge | Preview |
|---|---|---|
| Homepage 404s | `none` | not shown |
| Both `/portal` and `/.well-known/portal.json` 404 | `none` | not shown |
| Manifest fetched but JSON invalid | `none` | not shown |
| Manifest valid but `validateManifest()` fails | `none` (do NOT show `detected` for invalid) | not shown |
| Manifest valid, AISO not yet computed | `detected` | shown |
| Manifest valid, score 0 from AISO | `none` | not shown |

Never show a `detected` badge for an invalid manifest — it would mislead agents.

## Why no `gold` without an AISO score?

Without a score, TrendingRepo cannot tell a hand-rolled manifest with broken endpoints from a fully conformant one. The `detected` state means "the manifest parses;" `verified` and `gold` mean "AISO ran the smoke test and it passed." Treat them as orthogonal signals.

## Versioning

This contract is `v1`. Any change to badge thresholds or preview shape requires bumping. The Portal spec version (manifest's `portal_version`) is independent — TrendingRepo MUST handle the exact `portal_version` it sees, never normalize.

## Changelog

- **1.0.0 (2026-04-30)** — initial 4-state badge + 3-line preview. Aligned to spec v0.1.7 and AISO readiness-score v1.0.0.
