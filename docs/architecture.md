# Portal architecture

One page. One diagram. Six packages, one reference service, one web
surface. Everything else is a rule.

## Layer diagram

```
+---------------------------------------------------------------+
|  /web/public                                                  |
|    visitportal.dev — the one-pager, install curl, directory   |
+---------------------------------------------------------------+
|  /reference/trending-demo         (demo Portal — 3 tools)     |
|  /packages/cli                    (visit-portal CLI)          |
|  /packages/bench                  (measured MCP vs Portal)    |
+---------------------------------------------------------------+
|  /packages/visit/ts               (TS visitor SDK, ~2.25 kB)  |
|  /packages/visit/py               (Python visitor SDK — stub) |
|  /packages/provider/ts            (optional provider helper)  |
|  /packages/mcp-adapter            (wrap MCP as Portal — stub) |
+---------------------------------------------------------------+
|  /packages/spec                   (JSON Schema + vectors)     |
+---------------------------------------------------------------+
```

**Rule 1 — flow is downhill.** Anything in an upper layer may import
from a lower layer. Nothing in a lower layer may import from an upper
one. `@visitportal/spec` imports from no one.

**Rule 2 — base stays neutral.** Base Portal packages
(`spec`, `visit`, `provider`, `mcp-adapter`, `bench`, `cli`) **must
not** import AGP, ClawPulse, AGNT, or ERC-8004 code. Those are Portal
Extensions — `docs/extensions/` — and ship separately.

**Rule 3 — the spec is the contract.** If the code disagrees with
`docs/spec-v0.1.1.md`, one of them is wrong. We fix the mismatch
intentionally and bump `portal_version` if the spec moves.

## Package responsibilities

- **`@visitportal/spec`** — owns `manifest.schema.json`, the 30
  conformance vectors under `conformance/vectors.json`, a Node-native
  lean validator, and an ajv-backed authoritative validator that
  cross-checks it. Zero dependencies on any other Portal package.

- **`@visitportal/visit` (TypeScript)** — the drive-by visitor SDK.
  Exposes `visit(url)` → `Portal` handle with `.call(tool, params)`.
  Hand-rolled dependency-free manifest validator stays in parity with
  the spec's ajv validator via a self-test. Bundle target: under 15 kB
  gzipped; currently ~2.25 kB.

- **`visitportal` (Python)** — stub; stretch for v0.2. Namespace
  reserved on PyPI.

- **`@visitportal/provider`** — optional ergonomic helper for provider
  authors. Not required — the reference uses plain Hono.

- **`@visitportal/mcp-adapter`** — stretch goal. Wraps an MCP server
  behind a Portal endpoint so any MCP server is visitable cold.

- **`@visitportal/bench`** — the measurement layer. Drives Anthropic's
  `count_tokens` API across a 48-cell matrix (MCP vs Portal × tool
  counts × tasks × models) and emits reproducible JSON + Markdown +
  SVG under `results/`.

- **`@visitportal/cli`** — `visit-portal info|call|conformance`. Ships
  the drive-by experience from any shell; wraps the TS SDK and the
  spec's conformance runner.

- **`reference/trending-demo`** — a v0.1-conformant Portal over a
  frozen GitHub-star-snapshot dataset (30 repos, 12 maintainers). The
  one thing the demo shell talks to.

- **`web/public`** — the `visitportal.dev` one-pager, `install` script,
  and public directory JSON.

## The visit, in shape

```
 visitor                                provider (trending-demo)
 -------                                ------------------------
 GET /portal   ────────────────────▶    return manifest JSON
 validate manifest ◀────────────────    (per @visitportal/spec schema)
 POST /portal/call { tool, params } ▶   dispatch
 { ok, result } ◀───────────────────    or { ok:false, error, code }
 use result, drop manifest
```

Two HTTP calls. One JSON manifest. No install. No residue. That
simplicity is the entire point — everything in this repo exists to
preserve it.
