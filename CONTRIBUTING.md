# Contributing to Portal

Portal is a small, opinionated codebase. PRs that keep the surface small
and the tests green are welcome.

## From clone to green tests

```sh
git clone <this-repo> visitportal.dev
cd visitportal.dev
pnpm install
pnpm -r build         # strict tsc across every package
pnpm -r test          # spec + SDK + CLI + bench + reference
```

Requirements: **Node 22+**, **pnpm 10+**. No other global installs.

If all of that runs green, you're ready to change code. If it doesn't,
open a bug report (`.github/ISSUE_TEMPLATE/bug.md`) — the first thing
we want to protect is the clean-clone experience.

## Conventions

- **TypeScript strict mode.** No `any`. If you need an escape hatch, use
  `unknown` and narrow.
- **Biome** for format + lint (`biome.json` at the root). Run before
  committing.
- **Conventional commits:** `feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`, `test:`, `perf:`. One concern per commit.
- **PR ceiling: 400 lines** of net change. Bigger work gets split.
- **Tests required** on every SDK function and every CLI subcommand.
  If a public function has no test, reviewers will ask for one.
- **No `AGP` / `ClawPulse` / `AGNT` / `8004` imports** in base Portal
  packages. Those are optional extensions (`docs/extensions/`) and the
  base must stay neutral and unowned — see `docs/CLAUDE.md`.

## Adding a conformance vector

The spec's authority lives in `packages/spec/conformance/vectors.json`.
To add a case:

1. Add the vector to `vectors.json` with a stable `name` and one of the
   existing `kind`s (`manifest_valid`, `manifest_invalid`, `call_pair`).
2. Run `pnpm --filter @visitportal/spec test` — the self-test will
   ajv-validate and cross-check the lean validator, then run mock-server
   call pairs.
3. If the vector exposes a SDK gap, add a test in
   `packages/visit/ts/test/visit.test.ts` that imports the vector via
   `@visitportal/spec/vectors`.

Every vector added is a permanent contract. Think twice before merging.

## Running the bench locally

```sh
export ANTHROPIC_API_KEY=sk-ant-...
BENCH_MODE=count_tokens_only pnpm --filter @visitportal/bench bench
```

Default seed is `42`. Results land in `packages/bench/results/` as
matching `.json` / `.md` / `.svg` triplets. Commit them only when
they're meant to become the canonical numbers on `visitportal.dev`.

`BENCH_MODE=full` additionally calls `messages.create` once per cell —
slower, pricier, but verifies the model actually selects the expected
tool.

## Touching the spec

Don't, unless you mean it. `docs/spec-v0.1.0.md` is **frozen** as
published on 2026-04-19. A spec change requires:

- A new file `docs/spec-v0.1.x.md` (minor) or `v0.2.0.md` (breaking),
  not an edit to `v0.1.0`.
- A matching bump in `@visitportal/spec`'s `package.json`.
- New vectors in `conformance/vectors.json` exercising the change.

Minor bumps (`0.1.x`) may only add optional fields. Breaking changes
bump the major.

## Review expectations

A good Portal PR description answers:

1. What does this change?
2. Why — which issue or scenario drove it?
3. Evidence that tests / build / bench are still green.

See `.github/PULL_REQUEST_TEMPLATE.md`. Reviewers use the same
checklist in `docs/CLAUDE.md`.
