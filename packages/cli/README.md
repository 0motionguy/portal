# @visitportal/cli

The CLI is optional — Portal is HTTP-native, so `curl` works too. This CLI is a convenience for operators who want `visit-portal info|call|conformance` as a quick wrapper.

`visit-portal` — drive-by tool invocation against any Portal, from any shell. Fetches the manifest, validates against v0.1.5, and either prints it (`info`), calls a tool (`call`), or runs the live conformance probe (`conformance`).

Built on top of [`@visitportal/visit`](../visit/ts/README.md); no extra dependencies. Tracks monorepo release **v0.1.5**.

## Install

Not on npm yet (hackathon week). Run from a clone:

```sh
git clone https://github.com/visitportal/visitportal.dev
cd visitportal.dev && pnpm install

pnpm --filter @visitportal/cli exec tsx src/cli.ts --help
```

After publish, the binary will be on `PATH` as `visit-portal` via `pnpm add -g @visitportal/cli`.

Examples below use the short `visit-portal <cmd>` form; substitute `pnpm --filter @visitportal/cli exec tsx src/cli.ts <cmd>` until publish.

## Commands

### `visit-portal info <portal-url>`

Fetches the manifest, pretty-prints name/brief/tools.

```sh
visit-portal info http://localhost:3075/portal
```

Output:

```
Portal · Star Screener
  I screen trending GitHub repos. Ask for top gainers by weekly star delta, keyword/language matches, or a maintainer profile.

  portal_version: 0.1
  auth:           none
  pricing:        free
  call_endpoint:  http://localhost:3075/portal/call

  tools (3):
    · top_gainers (limit, language)
        Top N repos by weekly star delta.
    · search_repos (query, limit)
        Full-text search across trending repos.
    · maintainer_profile (handle)
        Profile for a handle (login).
```

Add `--json` to emit the raw manifest (pipe into `jq`).

### `visit-portal call <portal-url> <tool> [--params '{...}']`

Invokes one tool. `--params` accepts a JSON object; omit for empty-params tools.

```sh
visit-portal call http://localhost:3075/portal top_gainers --params '{"limit":3}'
```

Text mode prints the result as pretty JSON (or the raw string for string results). Add `--json` to force JSON output.

### `visit-portal conformance <portal-url>`

Runs the two core v0.1 checks: manifest validity + `NOT_FOUND` round-trip. Exit code is the failure count.

```sh
visit-portal conformance http://localhost:3075/portal
```

Output:

```
  ✓ manifest valid (tools: 3)
  ✓ NOT_FOUND probe caught client-side (ToolNotInManifest)
```

For the full vector suite (30+ offline vectors), use `pnpm conformance <url>` from the monorepo root.

## Flags

| Flag | Applies to | Default | Effect |
|---|---|---|---|
| `--json` | all | off | Emit JSON (pipe-friendly). |
| `--timeout <ms>` | all | `10000` | Fetch + call timeout in milliseconds. |
| `--params '<json>'` | `call` | `{}` | Tool params as a JSON object. |
| `-h`, `--help` | — | — | Print help and exit. |

## Exit codes

| Code | Meaning |
|---:|---|
| `0` | Success. |
| `1` | Generic failure (unexpected error). |
| `2` | Usage error (bad flags, missing `<portal-url>`, invalid `--params`). |
| `3` | `PortalNotFound` — could not reach `GET /portal`. |
| `4` | `ManifestInvalid` — manifest did not match the v0.1 schema. |
| `5` | `ToolNotInManifest` — requested tool not in `manifest.tools[]`. |
| `6` | `CallFailed` — HTTP failure or `{ ok:false, error, code }` response. |

`conformance` additionally returns `1` when probe checks fail even though the manifest was valid.

## Piping into jq

```sh
# Extract just the tool names from a live Portal:
visit-portal info http://localhost:3075/portal --json | jq -r '.tools[].name'

# Grab the top-gainer repos and filter to TypeScript-only:
visit-portal call http://localhost:3075/portal top_gainers --params '{"limit":50}' --json \
  | jq '[.[] | select(.language == "TypeScript")] | .[0:5]'

# Fail-fast conformance gate in a shell script:
visit-portal conformance http://localhost:3075/portal --json | jq '.failures | length'
```

## Spec

This CLI is thin — every behavior follows the [visit SDK](../visit/ts/README.md) and the [Portal v0.1.5 spec](../../docs/spec-v0.1.5.md). If CLI output and the spec disagree, the spec wins.
