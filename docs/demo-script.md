# Demo script

Human-runnable reproduction of the [visitportal.dev](https://visitportal.dev) one-pager terminal flow. This script is what substitutes for a recorded video — a judge can paste it line-by-line and see the same output.

For a single-command reproduction, use [`scripts/demo.sh`](../scripts/demo.sh) instead — it wraps these same commands with timing + cleanup.

## Setup

- Terminal size: 80×24 is the reference; anything wider is fine.
- Recording tool: [asciinema](https://asciinema.org) if you want to share a cast (`asciinema rec docs/asciinema/demo.cast`). Plain terminal is fine for live demos.
- Requirements: Node 22+, pnpm 10+, curl. Git Bash on Windows works.

## The flow

Two terminals. Terminal 1 runs the server. Terminal 2 runs the visits.

### 1. Install once

```sh
cd visitportal.dev
pnpm install
```

### 2. Terminal 1 — start the reference Portal

```sh
PORT=3075 PORTAL_PUBLIC_URL=http://localhost:3075 pnpm --filter star-screener start
```

Expected first line:

```
star-screener listening on http://localhost:3075
```

Leave this terminal running. Wait ~2s for it to be ready before switching.

### 3. Terminal 2 — `visit-portal info`

```sh
pnpm --filter @visitportal/cli exec tsx src/cli.ts info http://localhost:3075/portal
```

Expected output (first five lines):

```
Portal · Star Screener
  I screen trending GitHub repos. Ask for top gainers by weekly star delta, keyword/language matches, or a maintainer profile.

  portal_version: 0.1
  auth:           none
```

**Talking point:** one GET, one manifest. The client has no prior knowledge of this service — it reads the manifest and learns the tool surface in a single round-trip.

### 4. Terminal 2 — `visit-portal call`

```sh
pnpm --filter @visitportal/cli exec tsx src/cli.ts call http://localhost:3075/portal top_gainers --params '{"limit":3}'
```

Expected output: a JSON array of three repos, starting with `anthropics/claude-code` (+1,620 stars this week), `astral-sh/uv`, `ollama/ollama`.

**Talking point:** one POST, one result. The manifest is not re-sent — only the tool name and params. That is the whole wire protocol.

### 5. Terminal 2 — `visit-portal conformance`

```sh
pnpm --filter @visitportal/cli exec tsx src/cli.ts conformance http://localhost:3075/portal
```

Expected output:

```
  ✓ manifest valid (tools: 3)
  ✓ NOT_FOUND probe caught client-side (ToolNotInManifest)
```

**Talking point:** the SDK validates both directions — the manifest against the v0.1 schema, and the error envelope against the normative code list.

### 6. Terminal 2 — `pnpm conformance` against the live URL

```sh
pnpm conformance http://localhost:3075/portal
```

Expected output:

```
portal-conformance · live · http://localhost:3075/portal
  ✓ manifest valid
  ✓ NOT_FOUND round-trip: round-trip produced NOT_FOUND envelope
```

**Talking point:** this is the same runner CI uses. Exit code = failure count. Any judge can verify any deployed Portal this way.

### 7. Optional — run the benchmark

Requires `ANTHROPIC_API_KEY` in your environment.

```sh
BENCH_MODE=count_tokens_only pnpm --filter @visitportal/bench bench
```

Expected: 48 cells complete in ~20s (count_tokens only, no generation). Writes `packages/bench/results/bench-<timestamp>.{json,md,svg}`. The latest committed numbers are in [`packages/bench/results/tokens-matrix-v1.md`](../packages/bench/results/tokens-matrix-v1.md) — Portal = 172 tokens flat, MCP = 13,929 at 100 tools, 54,677 at 400.

**Talking point:** every number on the one-pager is reproducible. No estimates. The tokenizer is Anthropic's own via `count_tokens`.

### 8. Close Terminal 1

`Ctrl+C` in the server terminal. Done.

## Wall-clock budget

Steps 3–6 (the visit flow) target under 90 seconds end-to-end including talking. Measured `bash scripts/demo.sh` runs cold in 7 seconds on a laptop — the visible latency is almost entirely tsx startup, not the Portal itself.

## Recording notes

If you want to ship a `.cast`:

```sh
asciinema rec docs/asciinema/demo.cast
bash scripts/demo.sh
# Ctrl+D to stop recording.
```

Recordings are optional and NOT checked in by default. The script is what we ship.
