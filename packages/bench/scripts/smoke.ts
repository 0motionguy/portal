import { runMatrix, type McpToolLike } from "../src/harness/bench.ts";
import {
  writeChartSvg,
  writeJsonReport,
  writeMarkdownReport,
} from "../src/harness/result-writer.ts";
import { createTokenCounter } from "../src/harness/token-counter.ts";
import type {
  AnthropicClient,
  CountTokensRequest,
  MessageRequest,
  MessageResponse,
} from "../src/harness/types.ts";
import { MODEL_IDS } from "../src/harness/types.ts";

const RESULTS_DIR = new URL("../results/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

async function main(): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  const client = apiKey ? liveClient(apiKey) : mockClient();
  const mode = apiKey ? "live" : "mock";
  process.stdout.write(`[bench:smoke] using ${mode} client\n`);

  const simulator = await loadSimulator();
  const tasks = await loadTasks();

  const target = tasks[0];
  if (!target) throw new Error("no tasks registered — subagent 3 contract missing");

  const start = Date.now();
  const report = await runMatrix({
    protocols: ["mcp", "portal"],
    toolCounts: [10],
    taskIds: [target.id],
    modelIds: [MODEL_IDS.sonnet],
    runsPerCell: 1,
    mode: "count_tokens_only",
    seed: 42,
    client,
    simulator,
    tasks,
    onProgress: (e) => {
      if (e.kind === "cell_done") {
        const { cell } = e.result;
        const marker = e.result.ok ? "ok" : "FAIL";
        process.stdout.write(
          `[cell ${e.index + 1}/${e.total}] ${marker} ${cell.protocol} · ${cell.toolCount} tools · ${cell.taskId} · ${cell.model} · run ${cell.runIndex} -> ${e.result.inputTokens} tokens\n`,
        );
      }
    },
  });
  const elapsedMs = Date.now() - start;

  const outDir = RESULTS_DIR;
  const jsonPath = writeJsonReport(report, outDir);
  const mdPath = writeMarkdownReport(report, outDir);
  const svgPath = writeChartSvg(report, outDir);
  process.stdout.write(
    `[bench:smoke] done in ${elapsedMs}ms · wrote ${jsonPath} ${mdPath} ${svgPath}\n`,
  );
  const failures = report.results.filter((r) => !r.ok);
  if (failures.length > 0) {
    process.stdout.write(
      `[bench:smoke] ${failures.length} cell(s) failed — see ${jsonPath}\n`,
    );
    process.exit(1);
  }
}

function liveClient(apiKey: string): AnthropicClient {
  const counter = createTokenCounter({ apiKey });
  return {
    countTokens: (req) => counter.count(req),
    async sendMessage(_req: MessageRequest): Promise<MessageResponse> {
      throw new Error("smoke runs count_tokens_only; sendMessage should not be invoked");
    },
  };
}

function mockClient(): AnthropicClient {
  return {
    async countTokens(req: CountTokensRequest) {
      const toolTokens = (req.tools?.length ?? 0) * 150;
      const sys = req.system ?? "";
      const userChars = req.messages.reduce((a, m) => a + m.content.length, 0);
      const tokens = toolTokens + Math.ceil(sys.length / 4) + Math.ceil(userChars / 4) + 4;
      return { input_tokens: tokens };
    },
    async sendMessage(_req: MessageRequest) {
      return {
        content: [{ type: "text", text: "(mock)" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 0 },
      };
    },
  };
}

async function loadSimulator(): Promise<(count: number, seed: number) => McpToolLike[]> {
  const path = "../src/mcp-simulator.ts";
  try {
    const mod = (await dynamicImport(path)) as {
      simulateTools?: (count: number, seed: number) => McpToolLike[];
    };
    if (typeof mod.simulateTools === "function") {
      return mod.simulateTools;
    }
  } catch {
    // subagent 2 has not landed yet — fall back to stub
  }
  return (count, _seed) =>
    Array.from({ length: count }, (_, i) => ({
      name: `stub_tool_${i}`,
      description: `placeholder stub tool ${i} — subagent 2 has not landed yet`,
      input_schema: {
        type: "object" as const,
        properties: { q: { type: "string" } },
        required: ["q"],
      },
    }));
}

interface TaskLike {
  id: string;
  name: string;
  system: string;
  user: string;
  expectedTool: string;
}

async function loadTasks(): Promise<TaskLike[]> {
  const path = "../src/tasks/index.ts";
  try {
    const mod = (await dynamicImport(path)) as {
      TASKS?: TaskLike[];
    };
    if (Array.isArray(mod.TASKS) && mod.TASKS.length > 0) {
      return mod.TASKS;
    }
  } catch {
    // subagent 3 has not landed yet — fall back to stub
  }
  return [
    {
      id: "smoke_stub",
      name: "smoke stub task",
      system: "You are a helpful assistant that calls tools.",
      user: "Use the best available tool to answer: what's new in open-source AI this week?",
      expectedTool: "stub_tool_0",
    },
  ];
}

async function dynamicImport(specifier: string): Promise<unknown> {
  const abs = new URL(specifier, import.meta.url).href;
  return (await import(/* @vite-ignore */ abs)) as unknown;
}

main().catch((e: unknown) => {
  process.stderr.write(`[bench:smoke] ${describe(e)}\n`);
  process.exit(1);
});

function describe(e: unknown): string {
  return e instanceof Error ? e.stack ?? e.message : String(e);
}
