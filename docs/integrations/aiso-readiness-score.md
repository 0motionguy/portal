# AISO — Portal Readiness Score (integration contract)

This document is the producer-consumer contract between **AISO** (`aiso.tools`) and Portal. AISO is a separate codebase. No AISO code or imports live in `packages/` or `reference/` of this repo — that is a [project rule](../../.claude/CLAUDE.md). Portal exports the public `@visitportal/spec` package; AISO consumes it. Nothing else crosses the boundary.

The score is **0–100, additive across 5 × 20-point dimensions**. AISO emits one score per scanned Portal URL.

## Score JSON shape

```json
{
  "portal_url": "https://www.visitportal.dev/portal-static-example.json",
  "aiso_version": "1.0.0",
  "last_checked": "2026-04-30T13:00:00Z",
  "score": 100,
  "dimensions": {
    "discoverability": { "points": 20, "max": 20, "detail": "manifest at /portal AND /.well-known/portal.json" },
    "schema_validity": { "points": 20, "max": 20, "detail": "validateManifest ok" },
    "conformance":     { "points": 20, "max": 20, "detail": "NOT_FOUND round-trip clean" },
    "metadata":        { "points": 20, "max": 20, "detail": "auth=none, pricing.model=free" },
    "live_execution":  { "points": 20, "max": 20, "detail": "tools[0]='whoami' returned ok:true in 142ms" }
  }
}
```

The shape is normative: AISO output MUST validate against [`aiso-readiness-score.schema.json`](./aiso-readiness-score.schema.json).

## The 5 dimensions

### 1. Discoverability (20 pts)

| Condition | Points |
|---|---:|
| Manifest fetched at `/portal` AND `/.well-known/portal.json` (byte-identical) | 20 |
| Manifest fetched at exactly one of the two paths | 15 |
| Manifest fetched at a non-standard path declared in a homepage `<link rel="portal" href="...">` | 10 |
| No manifest discoverable | 0 |

The `.well-known` path is per [spec v0.1.5 Appendix E](../spec-v0.1.5.md). Byte-parity is asserted by string-equality on the response body.

### 2. Schema validity (20 pts)

| Condition | Points |
|---|---:|
| `validateManifest()` returns `{ok: true}` | 20 |
| `validateManifest()` returns `{ok: false}` | 0 |

Use [`validateManifest`](../../packages/spec/conformance/runner.ts) from `@visitportal/spec`. No partial credit — the schema is a binary gate.

### 3. Conformance smoke (20 pts)

| Condition | Points |
|---|---:|
| `runSmokeConformance(url)` returns `{manifestOk: true, notFoundOk: true}` | 20 |
| Manifest valid but NOT_FOUND probe fails | 10 |
| Manifest invalid OR fetch failed | 0 |

Use [`runSmokeConformance`](../../packages/spec/conformance/runner.ts) from `@visitportal/spec`. The smoke test is exactly what `pnpm conformance <url>` runs in CI.

### 4. Metadata (20 pts)

| Condition | Points |
|---|---:|
| `manifest.auth` declared (any value, including `"none"`) | 10 |
| `manifest.pricing` declared (any value, including `{model: "free"}`) | 10 |

Both fields are optional in the schema, but declaring them explicitly is a strong signal that the provider thought through the access model. Default omission → 0 points for that sub-dimension.

### 5. Live execution (20 pts)

AISO picks `tools[0]` (the first declared tool) and constructs a minimal valid `params` object from its `params` sugar form (or `paramsSchema`):

| Condition | Points |
|---|---:|
| `POST /portal/call` with synthesized params returns `{ok: true, result: ...}` | 20 |
| Returns `{ok: false}` with a documented error code | 10 |
| Returns malformed envelope or transport error | 0 |

If `tools[0].params.required` is non-empty and AISO cannot synthesize values (e.g. an opaque `paramsSchema` requiring domain knowledge), score 10 — the manifest is callable but AISO cannot prove a green path.

Synthesis rules: `string` → `"test"`, `number` → `1`, `boolean` → `true`, `object` → `{}`, `array` → `[]`. Required fields only.

## Reference scan implementation (TypeScript)

```ts
import { runSmokeConformance, validateManifest } from "@visitportal/spec";

interface DimensionScore {
  points: number;
  max: number;
  detail: string;
}

interface ReadinessScore {
  portal_url: string;
  aiso_version: string;
  last_checked: string;
  score: number;
  dimensions: {
    discoverability: DimensionScore;
    schema_validity: DimensionScore;
    conformance: DimensionScore;
    metadata: DimensionScore;
    live_execution: DimensionScore;
  };
}

export async function scorePortal(portalUrl: string): Promise<ReadinessScore> {
  const dims = {
    discoverability: { points: 0, max: 20, detail: "" },
    schema_validity: { points: 0, max: 20, detail: "" },
    conformance: { points: 0, max: 20, detail: "" },
    metadata: { points: 0, max: 20, detail: "" },
    live_execution: { points: 0, max: 20, detail: "" },
  };

  // 1. Discoverability — try /.well-known first, then the canonical path
  const wellKnown = await safeFetch(new URL("/.well-known/portal.json", portalUrl));
  const canonical = await safeFetch(portalUrl);
  if (wellKnown && canonical && wellKnown.text === canonical.text) {
    dims.discoverability = { points: 20, max: 20, detail: "byte-identical at both paths" };
  } else if (canonical) {
    dims.discoverability = { points: 15, max: 20, detail: "canonical only" };
  } else if (wellKnown) {
    dims.discoverability = { points: 15, max: 20, detail: ".well-known only" };
  } else {
    dims.discoverability.detail = "no manifest discoverable";
  }

  const manifestText = canonical?.text ?? wellKnown?.text;
  if (!manifestText) return finalize(portalUrl, dims);

  // 2. Schema validity
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    dims.schema_validity.detail = "invalid JSON";
    return finalize(portalUrl, dims);
  }
  const schema = validateManifest(manifest);
  if (schema.ok) {
    dims.schema_validity = { points: 20, max: 20, detail: "validateManifest ok" };
  } else {
    dims.schema_validity.detail = schema.errors.map((e) => e.message).join("; ");
    return finalize(portalUrl, dims);
  }

  // 3. Conformance smoke
  const live = await runSmokeConformance(portalUrl);
  if (live.manifestOk && live.notFoundOk) {
    dims.conformance = { points: 20, max: 20, detail: "NOT_FOUND round-trip clean" };
  } else if (live.manifestOk) {
    dims.conformance = { points: 10, max: 20, detail: live.notFoundDetail };
  } else {
    dims.conformance.detail = "manifest invalid at fetch time";
  }

  // 4. Metadata
  const authPts = "auth" in manifest ? 10 : 0;
  const pricingPts = "pricing" in manifest ? 10 : 0;
  dims.metadata = {
    points: authPts + pricingPts,
    max: 20,
    detail: `auth=${manifest.auth ?? "(omitted)"}, pricing=${
      manifest.pricing ? JSON.stringify(manifest.pricing) : "(omitted)"
    }`,
  };

  // 5. Live execution
  const tools = manifest.tools as Array<Record<string, unknown>>;
  const first = tools[0];
  const params = synthesizeParams(first);
  if (params === null) {
    dims.live_execution = { points: 10, max: 20, detail: "could not synthesize params" };
  } else {
    const callUrl = resolveCallEndpoint(manifest.call_endpoint as string, portalUrl);
    const callResult = await safePost(callUrl, { tool: first.name, params });
    if (callResult?.ok === true) {
      dims.live_execution = {
        points: 20,
        max: 20,
        detail: `tools[0]='${first.name}' returned ok:true`,
      };
    } else if (callResult && typeof callResult.code === "string") {
      dims.live_execution = {
        points: 10,
        max: 20,
        detail: `documented error: ${callResult.code}`,
      };
    } else {
      dims.live_execution.detail = "malformed envelope or transport error";
    }
  }

  return finalize(portalUrl, dims);
}

// helpers (safeFetch, safePost, synthesizeParams, resolveCallEndpoint, finalize)
// — straightforward; see the live AISO codebase for the production version
// with timeouts, redirect handling, and error sanitisation.
```

The full reference is intentionally not committed to this repo — AISO owns its scanning logic. This snippet shows that **a complete scorer is `~70 LOC` on top of `@visitportal/spec`**. AISO devs wire this into their existing scan pipeline and persist the result.

## How TrendingRepo and other consumers use the score

A `ReadinessScore` is the signal that gates the [TrendingRepo Portal Ready badge](./trendingrepo-portal-badge.md):

| Score band | Badge state |
|---|---|
| `≥ 90` | `gold` |
| `60–89` | `verified` |
| `1–59` | `detected` |
| `0` or no score | `none` |

Same threshold table is reproduced in the TrendingRepo doc — keep them in sync if either changes.

## Recompute cadence

| Trigger | Recompute |
|---|---|
| Manifest URL added to AISO's index | Immediate |
| Provider pushes a new commit (webhook) | Within 5 min |
| Background sweep | Daily |
| User-requested re-check (UI button) | Immediate, rate-limited 1/hour/IP |

Persist the score keyed by `portal_url`. AISO's storage layer is its own concern.

## Versioning

`aiso_version` is AISO's own SemVer string. When dimensions or thresholds change, bump the major. The Portal spec version is implicit in the manifest's `portal_version`; AISO MUST score against the exact version it fetched, never normalize to a target version.

## Changelog

- **1.0.0 (2026-04-30)** — initial 5×20 rubric. Aligned to spec v0.1.5.
