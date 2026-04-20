// `pnpm bench` entry point.
//
// Delegates to @visitportal/bench's smoke run (2 cells, mock API, no paid
// tokens) so CI runs real work instead of a no-op. The full Anthropic
// count_tokens matrix lives at `pnpm --filter @visitportal/bench bench` and
// requires ANTHROPIC_API_KEY (~$0.10/run); the smoke is deterministic and
// free.
//
// If the smoke fails, this script exits non-zero so CI catches the drift.

import { spawnSync } from "node:child_process";

const result = spawnSync("pnpm", ["--filter", "@visitportal/bench", "bench:smoke"], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
