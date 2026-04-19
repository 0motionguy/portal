# Quickstart — Visit a Portal in 10 lines

You have a URL that serves a Portal manifest. You want an LLM or script to call one of its tools without pre-installing anything. That is what `@visitportal/visit` does: one `visit()` call fetches + validates the manifest, then `.call()` dispatches tools. No server-side install.

## Install

Not on npm yet (hackathon week). Until then, use the workspace-linked package:

```sh
git clone https://github.com/visitportal/visitportal.dev
cd visitportal.dev && pnpm install
# From a package inside the monorepo, depend on "@visitportal/visit": "workspace:*".
```

After v0.1.1 publishes:

```sh
pnpm add @visitportal/visit
```

## The ten-line example

Against the reference Portal running locally (see [`reference/star-screener/README.md`](../reference/star-screener/README.md)):

```ts
import { visit, CallFailed } from "@visitportal/visit";

const portal = await visit("http://localhost:3075/portal");
console.log(portal.manifest.brief);

try {
  const repos = await portal.call("top_gainers", { limit: 3 });
  console.log(repos);
} catch (e) {
  if (e instanceof CallFailed) console.error(e.code, e.message);
}
```

`visit()` defaults to a 5s timeout; override with `visit(url, { timeoutMs: 10_000 })`. Full API + all options: [`packages/visit/ts/README.md`](../packages/visit/ts/README.md).

## Error taxonomy

All errors extend `PortalError`. Branch with `instanceof`:

| Error | When it throws | Recover by |
|---|---|---|
| `PortalNotFound` | `GET /portal` failed (network, non-2xx, timeout) | Retry, fallback, bail |
| `ManifestInvalid` | Manifest didn't match v0.1 schema | Report provider bug |
| `ToolNotInManifest` | Client called `.call("x")` but `"x"` isn't in `manifest.tools[]` | Client bug — fix caller |
| `CallFailed` | HTTP failure, malformed envelope, or `{ ok:false, error, code }` | Inspect `err.code` |

`CallFailed.code` is one of: `NOT_FOUND`, `INVALID_PARAMS`, `UNAUTHORIZED`, `RATE_LIMITED`, `INTERNAL` ([spec §6](./spec-v0.1.1.md#6-error-codes-normative)).

## CLI alternative

No TypeScript? Use the CLI from the cloned repo — same semantics, different surface:

```sh
pnpm --filter @visitportal/cli exec tsx src/cli.ts info http://localhost:3075/portal
pnpm --filter @visitportal/cli exec tsx src/cli.ts call http://localhost:3075/portal top_gainers --params '{"limit":3}'
pnpm --filter @visitportal/cli exec tsx src/cli.ts conformance http://localhost:3075/portal
```

Add `--json` to any command to get machine-readable output for piping into `jq`. Full command reference: [`packages/cli/README.md`](../packages/cli/README.md).

## Next steps

- [Spec v0.1.1](./spec-v0.1.1.md) — two endpoints, one manifest, six pages total.
- [Benchmark results](../packages/bench/results/tokens-matrix-v1.md) — measured Portal overhead is flat 172 tokens regardless of tool count; MCP scales linearly (13,929 tokens at 100 tools, 54,677 at 400).
- [`docs/demo-script.md`](./demo-script.md) — reproduce the one-pager's terminal flow in 7 seconds.
