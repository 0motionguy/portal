# Portal v0.1.5 — Specification

**Status:** CURRENT. Published 2026-04-23 as `v0.1.5`. Supersedes v0.1.4 (additive clarifications only; every v0.1.4 conformant portal remains v0.1.5 conformant).
**License:** Public domain. No copyright is asserted over this specification.
**Normative schema:** [`packages/spec/manifest.schema.json`](../packages/spec/manifest.schema.json).
**Conformance suite:** [`packages/spec/conformance/`](../packages/spec/conformance/).
**Changelog vs v0.1.4:** see "Changelog" at end of document.

---

## 1. Summary

Portal is an HTTP protocol that lets any LLM client with function-calling discover and invoke a service's tools without pre-configuration. **Two endpoints, one manifest, fire-and-forget.** An agent visits a URL cold, reads the manifest, calls a tool, and leaves. No install. No residue.

Portal is a complement to MCP, not a replacement. MCP = installed tools. Portal = drive-by visits.

## 2. Design goals

1. **Zero install on the visitor side.** Any LLM client with function-calling can visit cold.
2. **Zero residue after the session.** The manifest is not persisted.
3. **Radically small spec surface.** The core fits on one page.
4. **Drop-in complement to MCP.** An MCP server should be wrappable as a Portal in one line.

## 3. Endpoints

### 3.1 `GET /portal`

- **Request body:** none.
- **Response `200 OK`:** a JSON manifest (see §4). `Content-Type: application/json`.
- **Response `4xx`/`5xx`:** JSON error envelope (see §6) is RECOMMENDED but not required on this endpoint — visitors MUST handle arbitrary error bodies.

### 3.2 `POST /portal/call`

- **Request body:** `{ "tool": string, "params": object }`. `Content-Type: application/json`. `params` MAY be `{}`.
- **Response `200 OK` (success):** `{ "ok": true, "result": any }`.
- **Response `200 OK` (handled error):** `{ "ok": false, "error": string, "code": string }` where `code` is one of the values in §6.
- **Response `4xx`/`5xx`:** transport-level failure. The visitor SHOULD surface it as a `CallFailed` without requiring the error envelope. Providers SHOULD prefer `200 OK` with `ok:false` for handled application errors.

Providers MAY co-locate `/portal` and `/portal/call` on any path as long as `call_endpoint` in the manifest names the call URL. The manifest is the source of truth. `call_endpoint` MAY be root-relative (for example `"/portal/call"`), in which case visitors resolve it against the manifest URL before POSTing.

## 4. Manifest (served at `GET /portal`)

```json
{
  "portal_version": "0.1",
  "name": "Star Screener",
  "brief": "I screen trending GitHub repos. Ask for top gainers, keyword matches, maintainer profiles.",
  "tools": [
    {
      "name": "top_gainers",
      "description": "Top N repos by star delta this week.",
      "params": {
        "limit": { "type": "number", "required": true, "description": "1-50" }
      }
    }
  ],
  "call_endpoint": "/portal/call",
  "auth": "none",
  "pricing": { "model": "free" }
}
```

### 4.1 Required fields

| Field | Type | Notes |
|---|---|---|
| `portal_version` | string | `"0.1"` or `"0.1.x"` for v0.1. Major-version bumps are breaking. |
| `name` | string | Short human name. 1–120 chars. |
| `brief` | string | Natural-language overview for the visiting LLM. 1–2000 chars. |
| `tools` | array | ≥1 tool. See §4.3. |
| `call_endpoint` | string | Root-relative path or absolute HTTPS URL. Target of `POST /portal/call`. |

### 4.2 Optional fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `auth` | `"none"` \| `"api_key"` \| `"erc8004"` | `"none"` | `erc8004` is extension **PE-001**. |
| `pricing.model` | `"free"` \| `"x402"` | `"free"` | `x402` is extension **PE-002**. |
| `pricing.rate` | string | — | REQUIRED when `pricing.model != "free"`. |

Unknown top-level fields MUST be rejected by conformant validators to keep the surface small. Adding new optional fields is reserved for v0.x minor versions.

### 4.3 Tool shape

Each tool has a `name` (required, lowercase + underscores, `^[a-z][a-z0-9_]*$`) and OPTIONALLY a `description`. To declare parameters, a tool MAY use either of the two forms below. If both are present, `paramsSchema` takes precedence and `params` is treated as legacy/display sugar.

#### 4.3.1 Sugar form — `params`

A flat object where each entry is a typed parameter:

```json
"params": {
  "query": { "type": "string", "required": true, "description": "search string" },
  "limit": { "type": "number" }
}
```

Allowed `type` values: `"string" | "number" | "boolean" | "object" | "array"`. `required` defaults to `false`. This is the form shown in quickstarts and used by 95% of providers.

#### 4.3.2 Escape hatch — `paramsSchema`

A full JSON Schema 2020-12 object. Use when the sugar form isn't expressive enough (enums, ranges, nested structures):

```json
"paramsSchema": {
  "type": "object",
  "required": ["query"],
  "properties": {
    "query": { "type": "string", "minLength": 1 },
    "sort": { "enum": ["stars", "updated"] }
  }
}
```

A tool with neither `params` nor `paramsSchema` accepts any object (empty-params tool).

## 5. Versioning

`portal_version` in the manifest signals compatibility.

- **Major bumps** (`0.x → 1.x`) are breaking.
- **Minor bumps** (`0.1 → 0.2`) MAY add optional fields. Visitors MUST tolerate unknown optional fields on minor upgrades *only if* the provider's `portal_version` major matches their supported major.
- v0.1 visitors MUST reject manifests whose `portal_version` does not match `^0\.1(\.[0-9]+)?$`.

## 6. Error codes (normative)

The `code` field in a `{ ok: false, error, code }` response body MUST be one of:

| Code | Meaning |
|---|---|
| `NOT_FOUND` | The named `tool` does not exist in this manifest, or an addressed resource (inside the call) is missing. |
| `INVALID_PARAMS` | The `params` object failed validation against the tool's declared schema. |
| `UNAUTHORIZED` | The caller is not authorized (missing/invalid credentials under `auth` ≠ `"none"`). |
| `RATE_LIMITED` | The provider is throttling this caller. |
| `INTERNAL` | Any other provider-side failure. |

The `error` field is a human-readable message. Providers MAY include provider-specific detail in `error`; visitors MUST NOT parse `error` programmatically — use `code`.

## 7. Non-goals (v0.1)

Portal deliberately does not attempt:

- **Task lifecycles.** Use **A2A** for long-running multi-step tasks with artifacts and state.
- **Long-running stateful sessions.** Use **MCP** (installed, persistent) or **A2A** (lifecycled).
- **Server-initiated messages.** All Portal traffic is client-initiated.
- **Streaming responses.** v0.2 MAY add a `/portal/stream` WebSocket upgrade. v0.1 is strictly request/response.
- **Multi-agent choreography.** Portal is 1:1 visitor ↔ provider.

These are intentional floors. Extensions (§8) may add them for providers that need them, but the base spec stays small.

## 8. Optional extensions (non-normative)

Extensions are documented separately and are NOT required for v0.1 conformance. A Portal that uses extensions MUST still be valid under the base spec.

| ID | Title | Status |
|---|---|---|
| PE-001 | ERC-8004 verified-agent identity (`auth: erc8004`) | draft |
| PE-002 | x402 per-call micropayments (`pricing.model: x402`) | draft |
| PE-003 | AGP envelope upgrade (stateful sessions) | draft |
| PE-004 | ClawPulse registry / discovery | draft |

Base Portal implementations (visitor SDKs, provider helpers, MCP adapter, benchmark) MUST work without any extension installed. This is non-negotiable: the base is neutral and unowned.

## 9. Conformance

A provider is **v0.1.5-conformant** iff it passes every vector in [`packages/spec/conformance/vectors.json`](../packages/spec/conformance/) when the suite is run against its `call_endpoint`.

A visitor SDK is **v0.1.5-conformant** iff it correctly fetches, validates, and calls every manifest and call-pair in the vectors.

`pnpm conformance <url>` runs the suite against a live URL and emits a pass/fail report.

---

## Appendix A — Reserved words

The following top-level manifest keys are reserved for future minor versions and MUST NOT be used by providers today: `stream_endpoint`, `session_endpoint`, `schema_url`, `registry`. Providers that need these capabilities today should request an extension ID.

## Appendix B — Wire notes

- All bodies are JSON (`Content-Type: application/json; charset=utf-8`).
- Both endpoints MUST accept `Accept: application/json`.
- Providers SHOULD set `Cache-Control: public, max-age=60` or shorter on `GET /portal` to allow manifest caching without breaking the fire-and-forget model.
- CORS: providers serving browser-resident visitors SHOULD allow `*` on `GET /portal` and configure `POST /portal/call` per their auth model. See Appendix C for normative CORS requirements.

## Appendix C — CORS (normative)

Portals MUST support cross-origin requests on both `/portal` and `/portal/call` so that browser-resident visitors (web-based LLM clients, playgrounds, dashboards) can discover and invoke tools without a server-side proxy.

### `GET /portal`

- Respond to `OPTIONS /portal` with **`204 No Content`** and these headers:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type`
  - `Access-Control-Max-Age: 86400` (SHOULD, for browser caching)
- On the `GET /portal` response itself, include:
  - `Access-Control-Allow-Origin: *`

### `POST /portal/call`

- Respond to `OPTIONS /portal/call` with **`204 No Content`** and these headers:
  - `Access-Control-Allow-Methods: POST, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key`
  - `Access-Control-Max-Age: 86400` (SHOULD)
  - `Access-Control-Allow-Origin`: per auth mode (below)
- On the `POST /portal/call` response itself, include `Access-Control-Allow-Origin` per auth mode:

| `auth`     | `Access-Control-Allow-Origin`                                    | `Access-Control-Allow-Credentials` |
|------------|------------------------------------------------------------------|------------------------------------|
| `none`     | `*` (MUST), OR echo `Origin` (OK)                                | omit                               |
| `api_key`  | SHOULD echo `Origin` (MUST if key is expected in a cookie)       | `true` when echoing `Origin`       |
| `erc8004`  | SHOULD echo `Origin` (MUST if credentials are sent)              | `true` when echoing `Origin`       |
| `x402`     | MUST echo `Origin` (payment headers are credentialed)            | `true`                             |

Echoing `Origin` rather than `*` is REQUIRED whenever the visitor is expected to send credentials (cookies, `Authorization` header with a secret). Browsers reject credentialed requests against wildcard origins.

### Non-browser visitors

Visitors that do not originate from a browser (server-side SDKs, CLI clients, native apps) MUST NOT rely on CORS headers for access control. CORS is a defence-in-depth mechanism for browser-resident clients only; it is not an authentication layer.

## Appendix D — Rate limits (informative + SHOULD-level defaults)

Portals SHOULD apply rate limits independently on `GET /portal` and `POST /portal/call`. The appropriate limits are provider-specific; the following are recommended defaults for a stateless LLM-visitor workload:

| `auth`     | Unauthenticated (per IP) | Authenticated (per key / identity) |
|------------|--------------------------|------------------------------------|
| `none`     | 10 req/min               | N/A                                |
| `api_key`  | 10 req/min               | 1000 req/min per key               |
| `erc8004`  | 30 req/min               | Per-identity policy (provider-defined) |
| `x402`     | Per-call payment settles the rate question | Per-call payment settles the rate question |

When a request exceeds the applicable limit, the Portal SHOULD respond with HTTP status **`429 Too Many Requests`** carrying the standard error envelope:

```json
{ "ok": false, "error": "rate limited", "code": "RATE_LIMITED" }
```

and SHOULD include a `Retry-After` header — either a non-negative integer (seconds) or an HTTP-date — per RFC 9110 §10.2.3. Visitors MUST treat `RATE_LIMITED` as a recoverable error: the same call MAY succeed after the indicated delay.

The `RATE_LIMITED` code is already in the v0.1.0 error enum (see §6); this appendix formalises when to emit it and what headers to include.

## Appendix E — Alternate discovery (draft)

Providers MAY also serve the manifest at `/.well-known/portal.json`. If both `/portal` and `/.well-known/portal.json` are served, they MUST return byte-identical manifests. This aligns Portal with the `.well-known/` convention used by x402 (`.well-known/x402`), security.txt, and OpenID Connect.

Visitors SHOULD try `/portal` first. Falling back to `/.well-known/portal.json` is optional.

**Status:** Appendix E is a v0.1 draft and will be promoted to normative in v0.2 after ecosystem feedback. Both paths are acceptable today; neither is required.

## Changelog

### v0.1.5 (2026-04-23) — relative `call_endpoint` + paramsSchema precedence

- **§4 Manifest.** `call_endpoint` MAY now be a root-relative path such as `"/portal/call"`. Visitors resolve it against the manifest URL before POSTing. Network-path references such as `"//example.com/portal/call"` remain invalid.
- **§4.3 Tool shape.** `paramsSchema` is now documented as JSON Schema 2020-12 and MAY appear alongside `params`; `paramsSchema` takes precedence when both are present.

### v0.1.4 (2026-04-21) — Appendix E + editorial

All v0.1.1-conformant providers remain v0.1.4-conformant. No wire-protocol change, no schema field change, no enum change. Additions:

- **Appendix E (NEW, draft).** Alternate discovery at `/.well-known/portal.json`. Providers MAY serve the manifest at both paths; when they do, the two responses MUST be byte-identical. Visitors SHOULD try `/portal` first.
- **§8 Extensions.** PE-002 paid tools draft (x402-compatible HTTP 402) referenced; full draft in [`pe-002-paid-tools-draft.md`](./pe-002-paid-tools-draft.md).
- **Editorial.** Header date + status bumped to track release cadence (v0.1.2 license fix, v0.1.3 Sev-level hardening, v0.1.4 HTTP-native reframe). Normative wire protocol unchanged since v0.1.1.

No breaking changes.

### v0.1.1 (2026-04-19) — additive clarifications

All v0.1.0-conformant providers remain v0.1.1-conformant. Changes are strict tightenings that align the schema with the spec text, plus two new normative sections for concerns that were previously under-specified:

- **§4 Manifest.** `call_endpoint` pattern now requires `https://` with a loopback escape hatch (`http://localhost` and `http://127.0.0.1`) for local development. v0.1.0 regex permitted `http(s)://` for any host; the v0.1.0 prose already required HTTPS, so the schema now matches the prose.
- **§6 Error codes.** No enum change. `RATE_LIMITED` was already in the v0.1.0 enum; its usage is formalised in the new Appendix D.
- **Appendix C (NEW).** Normative CORS requirements for browser-resident visitors.
- **Appendix D (NEW).** SHOULD-level rate-limit defaults and `Retry-After` guidance.

No breaking changes. Visitor SDKs that validate manifests against the v0.1.0 schema will continue to accept every v0.1.1 manifest (the pattern tightening rejects a subset of what v0.1.0 allowed, never adds).

### v0.1.0 (2026-04-19) — initial freeze

First public cut for the Claude Code hackathon submission. Frozen; superseded by v0.1.1 the same day after adopter-debrief findings.
