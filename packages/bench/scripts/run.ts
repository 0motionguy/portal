import { runMatrix, type McpToolLike } from "../src/harness/bench.ts";
import {
  writeChartSvg,
  writeJsonReport,
  writeMarkdownReport,
} from "../src/harness/result-writer.ts";
import { createTokenCounter } from "../src/harness/token-counter.ts";
import type {
  AnthropicClient,
  BenchMode,
  MessageRequest,
  ModelId,
  Protocol,
} from "../src/harness/types.ts";
import { MODEL_IDS } from "../src/harness/types.ts";

const RESULTS_DIR = new URL("../results/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const TOOL_COUNTS = [10, 50, 100, 400] as const;
const MODELS: readonly ModelId[] = [MODEL_IDS.sonnet, MODEL_IDS.opus];
const PROTOCOLS: readonly Protocol[] = ["mcp", "portal"];
const RUNS_PER_CELL = 5;
const SEED = 42;

async function main(): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    process.stderr.write(
      "[bench] ANTHROPIC_API_KEY is not set — refusing to run the full matrix with mocks.\n",
    );
    process.stderr.write(
      "[bench] Set ANTHROPIC_API_KEY and re-run. For a mock-friendly check, use: pnpm --filter @visitportal/bench bench:smoke\n",
    );
    process.exit(2);
  }

  const tasks = await loadTasks();
  const { simulator } = await loadSimulator();
  const client = await loadClient(apiKey);

  const modeEnv = (process.env["BENCH_MODE"] ?? "full").toLowerCase();
  if (modeEnv !== "full" && modeEnv !== "count_tokens_only") {
    process.stderr.write(
      `[bench] BENCH_MODE must be 'full' or 'count_tokens_only' (got '${modeEnv}')\n`,
    );
    process.exit(2);
  }
  const mode: BenchMode = modeEnv as BenchMode;
  // count_tokens is deterministic for identical inputs; a single run per cell
  // is sufficient. Full mode keeps RUNS_PER_CELL for latency std-dev.
  const runsPerCell = mode === "count_tokens_only" ? 1 : RUNS_PER_CELL;
  process.stdout.write(`[bench] mode=${mode} runsPerCell=${runsPerCell}\n`);

  const start = Date.now();
  const report = await runMatrix({
    protocols: PROTOCOLS,
    toolCounts: [...TOOL_COUNTS],
    taskIds: tasks.map((t) => t.id),
    modelIds: MODELS,
    runsPerCell,
    mode,
    seed: SEED,
    client,
    simulator,
    tasks,
    onProgress: (e) => {
      if (e.kind === "cell_done") {
        const { cell } = e.result;
        const marker = e.result.ok ? "ok" : "FAIL";
        process.stdout.write(
          `[cell ${e.index + 1}/${e.total}] ${marker} ${cell.protocol} · ${cell.toolCount} tools · ${cell.taskId} · ${cell.model} · run ${cell.runIndex} -> ${e.result.inputTokens} tokens, ${e.result.latencyMs}ms\n`,
        );
      }
    },
  });

  const elapsedMs = Date.now() - start;
  const outDir = RESULTS_DIR;
  const jsonPath = writeJsonReport(report, outDir);
  const mdPath = writeMarkdownReport(report, outDir);
  const svgPath = writeChartSvg(report, outDir);

  const ok = report.results.filter((r) => r.ok).length;
  const failed = report.results.length - ok;
  process.stdout.write(
    `[bench] finished ${report.results.length} cells in ${(elapsedMs / 1000).toFixed(1)}s — ${ok} ok, ${failed} failed\n`,
  );
  process.stdout.write(`[bench] wrote:\n  ${jsonPath}\n  ${mdPath}\n  ${svgPath}\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

interface TaskLike {
  id: string;
  name: string;
  system: string;
  user: string;
  expectedTool: string;
}

async function loadTasks(): Promise<TaskLike[]> {
  try {
    const mod = (await dynamicImport("../src/tasks/index.ts")) as {
      TASKS?: TaskLike[];
    };
    if (Array.isArray(mod.TASKS) && mod.TASKS.length > 0) {
      return mod.TASKS;
    }
  } catch (e) {
    throw new Error(
      `[bench] failed to load src/tasks/index.ts — subagent 3 contract missing. ${describe(e)}`,
    );
  }
  throw new Error("[bench] src/tasks/index.ts exported no TASKS — aborting full run");
}

async function loadSimulator(): Promise<{
  simulator: (count: number, seed: number) => McpToolLike[];
}> {
  try {
    const mod = (await dynamicImport("../src/mcp-simulator.ts")) as {
      simulateTools?: (count: number, seed: number) => McpToolLike[];
    };
    if (typeof mod.simulateTools === "function") {
      return { simulator: mod.simulateTools };
    }
  } catch (e) {
    throw new Error(
      `[bench] failed to load src/mcp-simulator.ts — subagent 2 contract missing. ${describe(e)}`,
    );
  }
  throw new Error("[bench] src/mcp-simulator.ts did not export simulateTools — aborting");
}

async function loadClient(apiKey: string): Promise<AnthropicClient> {
  try {
    const mod = (await dynamicImport("../src/tasks/index.ts")) as {
      createAnthropicClient?: (opts: { apiKey: string }) => AnthropicClient;
    };
    if (typeof mod.createAnthropicClient === "function") {
      return mod.createAnthropicClient({ apiKey });
    }
  } catch {
    // fall through to local client
  }
  const counter = createTokenCounter({ apiKey });
  return {
    countTokens: (req) => counter.count(req),
    async sendMessage(_req: MessageRequest) {
      throw new Error(
        "[bench] full mode requires createAnthropicClient from src/tasks — subagent 3 has not provided it",
      );
    },
  };
}

async function dynamicImport(specifier: string): Promise<unknown> {
  const abs = new URL(specifier, import.meta.url).href;
  return (await import(/* @vite-ignore */ abs)) as unknown;
}

main().catch((e: unknown) => {
  process.stderr.write(`[bench] fatal: ${describe(e)}\n`);
  process.exit(1);
});

function describe(e: unknown): string {
  return e instanceof Error ? e.stack ?? e.message : String(e);
}
