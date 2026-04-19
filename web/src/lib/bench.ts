import { readFileSync } from "node:fs";
import { join } from "node:path";

// Server-side load of the canonical benchmark matrix. The JSON is committed
// under packages/bench/results/; we read it at build time, not per-request,
// so a stale result requires a redeploy (that's the point — numbers don't
// silently shift under judges' feet).

export interface Cell {
  cell: {
    protocol: "mcp" | "portal";
    toolCount: number;
    taskId: string;
    model: string;
    runIndex: number;
  };
  ok: boolean;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  timestamp: string;
}

export interface MatrixJson {
  startedAt: string;
  finishedAt: string;
  mode: string;
  seed: number;
  portalPreamble: string;
  results: Cell[];
}

const REPO_ROOT = join(process.cwd(), "..");
const JSON_PATH = join(REPO_ROOT, "packages", "bench", "results", "tokens-matrix-v1.json");
const SVG_PATH = join(REPO_ROOT, "packages", "bench", "results", "tokens-matrix-v1.svg");

let jsonCache: MatrixJson | null = null;

export function loadMatrix(): MatrixJson {
  if (jsonCache) return jsonCache;
  jsonCache = JSON.parse(readFileSync(JSON_PATH, "utf8")) as MatrixJson;
  return jsonCache;
}

export function loadChartSvg(): string {
  return readFileSync(SVG_PATH, "utf8");
}

export interface RollupRow {
  toolCount: number;
  mcpMedian: number;
  portalMedian: number;
  ratio: number;
}

export function rollup(matrix: MatrixJson): RollupRow[] {
  const counts = Array.from(new Set(matrix.results.map((r) => r.cell.toolCount))).sort(
    (a, b) => a - b,
  );
  return counts.map((n) => {
    const mcp = matrix.results
      .filter((r) => r.cell.toolCount === n && r.cell.protocol === "mcp" && r.ok)
      .map((r) => r.inputTokens)
      .sort((a, b) => a - b);
    const portal = matrix.results
      .filter((r) => r.cell.toolCount === n && r.cell.protocol === "portal" && r.ok)
      .map((r) => r.inputTokens)
      .sort((a, b) => a - b);
    const mcpMedian = median(mcp);
    const portalMedian = median(portal);
    return {
      toolCount: n,
      mcpMedian,
      portalMedian,
      ratio: portalMedian > 0 ? mcpMedian / portalMedian : 0,
    };
  });
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}
