import type {
  AnthropicClient,
  BenchCell,
  BenchMode,
  CountTokensRequest,
  MatrixReport,
  MessageRequest,
  ModelId,
  Protocol,
  RunResult,
} from "./types.ts";
import { PORTAL_MANIFEST_PREAMBLE, computeCostUsd } from "./types.ts";

export interface BenchTaskLike {
  id: string;
  name: string;
  system: string;
  user: string;
  expectedTool: string;
}

export interface McpToolLike {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export interface SimulateToolsFn {
  (count: number, seed: number): McpToolLike[];
}

export interface RunMatrixOptions {
  protocols: readonly Protocol[];
  toolCounts: readonly number[];
  taskIds: readonly string[];
  modelIds: readonly ModelId[];
  runsPerCell: number;
  mode: BenchMode;
  seed: number;
  client: AnthropicClient;
  simulator: SimulateToolsFn;
  tasks: ReadonlyArray<BenchTaskLike>;
  maxTokens?: number;
  portalPreamble?: string;
  onProgress?: (event: ProgressEvent) => void;
  now?: () => Date;
}

export type ProgressEvent =
  | { kind: "cell_start"; index: number; total: number; cell: BenchCell }
  | { kind: "cell_done"; index: number; total: number; result: RunResult };

export async function runMatrix(opts: RunMatrixOptions): Promise<MatrixReport> {
  const preamble = opts.portalPreamble ?? PORTAL_MANIFEST_PREAMBLE;
  const taskById = new Map(opts.tasks.map((t) => [t.id, t] as const));
  const missing = opts.taskIds.filter((id) => !taskById.has(id));
  if (missing.length > 0) {
    throw new Error(`runMatrix: unknown taskIds: ${missing.join(", ")}`);
  }

  const startedAt = (opts.now ?? (() => new Date()))().toISOString();
  const results: RunResult[] = [];
  const cells = buildCells(opts);
  const total = cells.length;

  for (let i = 0; i < total; i++) {
    const cell = cells[i] as BenchCell;
    opts.onProgress?.({ kind: "cell_start", index: i, total, cell });
    const task = taskById.get(cell.taskId);
    if (!task) {
      const result: RunResult = {
        cell,
        ok: false,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        costUsd: 0,
        error: `unknown task ${cell.taskId}`,
        timestamp: (opts.now ?? (() => new Date()))().toISOString(),
      };
      results.push(result);
      opts.onProgress?.({ kind: "cell_done", index: i, total, result });
      continue;
    }
    const result = await runCell(cell, task, opts, preamble);
    results.push(result);
    opts.onProgress?.({ kind: "cell_done", index: i, total, result });
  }

  const finishedAt = (opts.now ?? (() => new Date()))().toISOString();

  return {
    startedAt,
    finishedAt,
    mode: opts.mode,
    seed: opts.seed,
    protocols: opts.protocols,
    toolCounts: opts.toolCounts,
    taskIds: opts.taskIds,
    modelIds: opts.modelIds,
    runsPerCell: opts.runsPerCell,
    portalPreamble: preamble,
    results,
  };
}

async function runCell(
  cell: BenchCell,
  task: BenchTaskLike,
  opts: RunMatrixOptions,
  preamble: string,
): Promise<RunResult> {
  const now = opts.now ?? (() => new Date());
  const timestamp = now().toISOString();
  const t0 = Date.now();
  try {
    const { countReq, messageReq } = buildRequests(cell, task, opts, preamble);
    const count = await opts.client.countTokens(countReq);
    let outputTokens = 0;
    let latencyMs = Date.now() - t0;
    if (opts.mode === "full" && messageReq) {
      const msgT0 = Date.now();
      const reply = await opts.client.sendMessage(messageReq);
      latencyMs = Date.now() - msgT0;
      outputTokens = reply.usage.output_tokens;
    }
    const inputTokens = count.input_tokens;
    const costUsd = computeCostUsd(cell.model, inputTokens, outputTokens);
    return {
      cell,
      ok: true,
      inputTokens,
      outputTokens,
      latencyMs,
      costUsd,
      timestamp,
    };
  } catch (e) {
    const latencyMs = Date.now() - t0;
    return {
      cell,
      ok: false,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      costUsd: 0,
      error: describe(e),
      timestamp,
    };
  }
}

interface BuiltRequests {
  countReq: CountTokensRequest;
  messageReq: MessageRequest | null;
}

function buildRequests(
  cell: BenchCell,
  task: BenchTaskLike,
  opts: RunMatrixOptions,
  preamble: string,
): BuiltRequests {
  const userMsg = { role: "user" as const, content: task.user };
  const baseSystem = task.system;
  const maxTokens = opts.maxTokens ?? 1024;

  if (cell.protocol === "mcp") {
    const tools = opts.simulator(cell.toolCount, opts.seed);
    const countReq: CountTokensRequest = {
      model: cell.model,
      system: baseSystem,
      messages: [userMsg],
      tools,
    };
    const messageReq: MessageRequest = {
      model: cell.model,
      system: baseSystem,
      messages: [userMsg],
      tools,
      max_tokens: maxTokens,
    };
    return { countReq, messageReq };
  }

  const system = `${baseSystem}\n\n${preamble}`;
  const countReq: CountTokensRequest = {
    model: cell.model,
    system,
    messages: [userMsg],
  };
  const messageReq: MessageRequest = {
    model: cell.model,
    system,
    messages: [userMsg],
    max_tokens: maxTokens,
  };
  return { countReq, messageReq };
}

function buildCells(opts: RunMatrixOptions): BenchCell[] {
  const cells: BenchCell[] = [];
  for (const protocol of opts.protocols) {
    for (const toolCount of opts.toolCounts) {
      for (const taskId of opts.taskIds) {
        for (const model of opts.modelIds) {
          for (let runIndex = 0; runIndex < opts.runsPerCell; runIndex++) {
            cells.push({ protocol, toolCount, taskId, model, runIndex });
          }
        }
      }
    }
  }
  return cells;
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
