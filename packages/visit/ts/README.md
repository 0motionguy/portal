# @visitportal/visit

TypeScript visitor SDK for Portal — visit any Portal in ten lines, no install on the server side.

```ts
import { visit } from "@visitportal/visit";

const portal = await visit("https://starscreener.xyz/portal");
const top = await portal.call("top_gainers", { limit: 3 });
// → [{ name_with_owner: "anthropics/claude-code", delta_week: 1620, ... }, ...]
```

## Install

```sh
pnpm add @visitportal/visit
# or npm / yarn
```

## API

```ts
import {
  visit,
  type Portal,
  type Manifest,
  PortalNotFound,
  ManifestInvalid,
  ToolNotInManifest,
  CallFailed,
} from "@visitportal/visit";
```

### `visit(url, options?) → Promise<Portal>`

Fetches `GET <url>`, validates the response against the Portal v0.1 manifest
schema, and returns a `Portal` handle. Throws:
- `PortalNotFound` — network failure, non-2xx response, or timeout fetching the manifest.
- `ManifestInvalid` — manifest didn't match the v0.1 schema.

Options:
- `timeoutMs?: number` (default `5000`)
- `headers?: Record<string, string>` — merged into the GET request.
- `fetchImpl?: typeof fetch` — override for testing / non-browser runtimes.

### `Portal`

```ts
interface Portal {
  readonly url: string;
  readonly manifest: Manifest;
  readonly tools: readonly string[];
  hasTool(name: string): boolean;
  call<T = unknown>(
    tool: string,
    params: Record<string, unknown>,
    opts?: { timeoutMs?: number; headers?: Record<string, string> },
  ): Promise<T>;
}
```

`.call()` throws:
- `ToolNotInManifest` — client-side, before any HTTP call, if the tool name isn't in `manifest.tools[]`.
- `CallFailed` — HTTP failure, malformed envelope, or a server-side `{ ok: false, error, code }` response. `code` is one of `NOT_FOUND | INVALID_PARAMS | UNAUTHORIZED | RATE_LIMITED | INTERNAL`.

### Error taxonomy

All errors extend `PortalError` (which extends `Error`). Use `instanceof` to
branch:

```ts
try {
  const p = await visit(url);
  await p.call("search_repos", { query: "llm" });
} catch (e) {
  if (e instanceof PortalNotFound)     { /* retry, fallback, bail */ }
  if (e instanceof ManifestInvalid)    { /* provider bug */ }
  if (e instanceof ToolNotInManifest)  { /* client bug */ }
  if (e instanceof CallFailed) {
    if (e.code === "RATE_LIMITED")     { /* backoff */ }
    if (e.code === "UNAUTHORIZED")     { /* re-auth */ }
  }
}
```

## Size

Bundle ≤ 2.5 kB gzipped (verified by `pnpm --filter @visitportal/visit size`
in CI). Zero runtime dependencies — the validator is dependency-free and
stays in lockstep with the authoritative ajv-based schema validator via a
parity assertion in the spec self-test.

## Spec

This SDK conforms to [Portal v0.1.1](../../../docs/spec-v0.1.1.md). Every
`manifest_valid` vector from `@visitportal/spec/vectors` is accepted; every
`manifest_invalid` vector is rejected as `ManifestInvalid`.
