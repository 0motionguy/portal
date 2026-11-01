# Portal

If your service has a URL, an agent can visit it: an open HTTP contract for agent-accessible services.

[![npm @visitportal/spec](https://img.shields.io/npm/v/@visitportal/spec?label=%40visitportal%2Fspec)](https://www.npmjs.com/package/@visitportal/spec)
[![CI](https://img.shields.io/github/actions/workflow/status/0motionguy/portal/ci.yml?label=ci)](https://github.com/0motionguy/portal/actions)

Portal is a minimal HTTP protocol that lets an LLM agent discover and use a service's tools without installing anything. A provider adds two routes: `GET /portal` returns a short manifest and `POST /portal/call` runs a tool. The agent reads the manifest once per visit, calls what it needs and leaves, so no tool schemas stay in its context and there is nothing to clean up afterwards. This repository holds the spec, a conformance suite, SDKs and adapters, reference providers, the project site and a benchmark. It is for API providers who want agents to use their service, and for agent builders who want drive-by access to many services without preloading every tool definition.

Portal is meant to sit beside MCP, not replace it: MCP for installed, stateful tool servers, Portal for visits.

## See it work

```sh
# 1. read the manifest
curl https://www.visitportal.dev/portal-static-example.json

# 2. call a tool
curl -X POST https://www.visitportal.dev/api/portal-static-example/call \
  -H 'content-type: application/json' \
  -d '{"tool":"posts","params":{"limit":3}}'
```

No client library is needed; any HTTP client works.

## What it does

- **Spec v0.1.8** (`docs/spec-v0.1.8.md`, `packages/spec`): two endpoints and one manifest (required fields `portal_version`, `name`, `brief`, `tools`, `call_endpoint`; optional `auth` and `pricing`), five error codes (`NOT_FOUND`, `INVALID_PARAMS`, `UNAUTHORIZED`, `RATE_LIMITED`, `INTERNAL`) and an optional `/.well-known/portal.json` discovery path. Shipped as a JSON Schema plus 36 conformance vectors.
- **Validation and conformance** (`@visitportal/spec`, on npm): an ajv-based validator, a zero-dependency lean validator held in parity by a self-test, and `runSmokeConformance(url)` to check a live service.
- **Visitor SDK** (`packages/visit/ts`): `visit(url)` returns a Portal with `call(tool, params)`. It requires HTTPS (loopback excepted), caps response size, retries once on transport errors and 5xx, and reports events to an `onEvent` hook.
- **Provider helper** (`@visitportal/provider`, on npm): builds a validated manifest from typed tool definitions and serves it through a fetch-native handler that fits Workers, edge runtimes and route handlers.
- **MCP adapter** (`@visitportal/mcp-adapter`, on npm): wraps an MCP stdio server as a Portal, as a library or a CLI with a local HTTP bridge.
- **Paid tools, extension PE-002** (`@visitportal/x402-adapter`, on npm): `withPayment(handler, ...)` answers unpaid calls with HTTP 402 and an x402 payment challenge. You bring the payment facilitator.
- **CLI** (`packages/cli`): `visit-portal info | call | conformance`, run from a clone.
- **Benchmark** (`packages/bench`): counts input tokens with Anthropic's token-counting API for simulated MCP tool catalogues versus a Portal preamble. The committed result has 48 cells with one run each: at 100 tools, 13,929 median input tokens for MCP against 172 for Portal, and Portal stays at 172 from 10 to 400 tools. It measures tool-definition overhead, not task success or latency.
- **Reference providers and site:** a Hono demo ("Star Screener", three tools over a frozen snapshot), a Cloudflare Worker with free and paid tools, and `web/`, the visitportal.dev Next.js app, whose live-visit proxy has an SSRF guard (DNS resolution, IP classification, redirect re-checks) and a rate limit.

## How it's built

```
agent --GET /portal-----------------> manifest (read once per visit)
agent --POST /portal/call {tool, params}--> { ok: true, result } | { ok: false, code }
```

A pnpm monorepo of ten workspaces. TypeScript in strict mode with Biome for lint and format, Vitest for tests (14 test files), Node 22+ and pnpm 10+. Imports run strictly downhill: base packages never import the optional extensions. CI on GitHub Actions builds, tests, runs the free benchmark smoke and the conformance check on Node, and imports the Python package. Deploy targets are Vercel (site), Fly.io (Hono demo) and Cloudflare Workers (worker demo).

Four packages are published to npm: spec, provider, mcp-adapter and x402-adapter. The visitor SDK and CLI are private and run from the clone. The Python visitor SDK (`packages/visit/py`) is a stub that only carries a version string.

## Repository layout

- `packages/spec`: schema, conformance vectors, validators, smoke runner.
- `packages/visit`: TypeScript visitor SDK (`ts/`) and the Python stub (`py/`).
- `packages/provider`, `packages/mcp-adapter`, `packages/x402-adapter`: provider-side packages.
- `packages/cli`, `packages/bench`: command line and benchmark.
- `reference/trending-demo`, `reference/portal-cf-worker`: the two reference providers.
- `web/`: visitportal.dev.
- `docs/`: spec versions, architecture, quickstarts (Next.js, Hono, Express, FastAPI, Cloudflare Worker, static fallback, MCP adapter, paid tools), roadmap and integration contracts.
- `scripts/`: demo, conformance, benchmark entry and install-script helpers.

## Run it locally

```sh
pnpm install
pnpm -r build                 # strict tsc across the workspaces
pnpm -r test
bash scripts/demo.sh          # boots the reference Portal, visits it, runs conformance, shuts down
pnpm conformance <url>        # validate any Portal URL
pnpm lint
```

Windows: `powershell -ExecutionPolicy Bypass -File scripts/demo.ps1`. `pnpm bench` runs the free smoke. The full token matrix needs `ANTHROPIC_API_KEY` and runs with `pnpm --filter @visitportal/bench bench`. Quickstarts for adding a Portal to an existing service are in `docs/`, starting with `docs/quickstart-provider.md`.

## Status

Beta. The spec is at v0.1.8, still pre-1.0, with four packages on npm, CI, a live site and a roadmap in `docs/ROADMAP.md`. Pending items include the Python SDK, publishing the visitor SDK and CLI, and a pagination envelope. The project started as a hackathon entry in April 2026.

Licence: dual. Code is Apache-2.0; the spec documents and `packages/spec/conformance/vectors.json` are CC0 1.0. See `LICENSE`. Contributions follow `CONTRIBUTING.md`; report security issues as described in `SECURITY.md`.
