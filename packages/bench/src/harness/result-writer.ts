import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderChart } from "./chart.ts";
import type { MatrixReport, Protocol, RunResult } from "./types.ts";
import { MODEL_PRICING } from "./types.ts";

export function writeJsonReport(report: MatrixReport, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const stamp = stampFromIso(report.finishedAt);
  const path = join(outDir, `bench-${stamp}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
  return path;
}

export function writeMarkdownReport(report: MatrixReport, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const stamp = stampFromIso(report.finishedAt);
  const path = join(outDir, `bench-${stamp}.md`);
  writeFileSync(path, renderMarkdown(report, stamp), "utf8");
  return path;
}

export function writeChartSvg(report: MatrixReport, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const stamp = stampFromIso(report.finishedAt);
  const path = join(outDir, `bench-${stamp}.svg`);
  writeFileSync(path, renderChart(report), "utf8");
  return path;
}

export function renderMarkdown(report: MatrixReport, stamp: string): string {
  const lines: string[] = [];
  lines.push(`# Portal bench — ${stamp}`);
  lines.push("");
  lines.push(
    `**Mode:** \`${report.mode}\` · **Seed:** \`${report.seed}\` · **Runs/cell:** ${report.runsPerCell} · **Cells:** ${report.results.length}`,
  );
  lines.push("");
  lines.push(`**Started:** ${report.startedAt}  `);
  lines.push(`**Finished:** ${report.finishedAt}`);
  lines.push("");
  lines.push(`**Raw JSON:** \`bench-${stamp}.json\` · **Chart:** \`bench-${stamp}.svg\``);
  lines.push("");
  lines.push("## Summary — median input tokens by tool count and protocol");
  lines.push("");
  lines.push(renderSummaryTable(report));
  lines.push("");
  lines.push("## Per-cell detail");
  lines.push("");
  lines.push(renderDetailTable(report));
  lines.push("");
  lines.push("## Methodology");
  lines.push("");
  lines.push("- **Token counts** come from `POST /v1/messages/count_tokens` on the Anthropic API (not estimated).");
  lines.push(
    "- **MCP path:** every tool in the simulated catalog is passed in `tools` on every count_tokens request. This is the preloaded-schema overhead the protocol pays per turn.",
  );
  lines.push(
    "- **Portal path:** `tools: []`, plus a short system preamble describing how to invoke a visited tool. The preamble is reproduced verbatim below.",
  );
  lines.push(
    "- **In `count_tokens_only` mode** we only measure prompt-side cost. In `full` mode we additionally call `messages.create` once per cell to measure end-to-end latency and verify the model selects the expected tool.",
  );
  lines.push("- **Cost math:** input_tokens × input-rate + output_tokens × output-rate.");
  lines.push("");
  lines.push("### Portal system preamble (verbatim)");
  lines.push("");
  lines.push("```text");
  lines.push(report.portalPreamble);
  lines.push("```");
  lines.push("");
  lines.push("### Model pricing");
  lines.push("");
  lines.push("| Model | Input $/M | Output $/M |");
  lines.push("|---|---:|---:|");
  for (const id of report.modelIds) {
    const p = MODEL_PRICING[id];
    lines.push(`| \`${id}\` | ${p.inputPerMillion.toFixed(2)} | ${p.outputPerMillion.toFixed(2)} |`);
  }
  lines.push("");
  const failures = report.results.filter((r) => !r.ok);
  if (failures.length > 0) {
    lines.push("## Failures");
    lines.push("");
    lines.push(`${failures.length} of ${report.results.length} cells failed.`);
    lines.push("");
    lines.push("| Protocol | Tools | Task | Model | Run | Error |");
    lines.push("|---|---:|---|---|---:|---|");
    for (const r of failures) {
      lines.push(
        `| ${r.cell.protocol} | ${r.cell.toolCount} | ${r.cell.taskId} | \`${r.cell.model}\` | ${r.cell.runIndex} | ${escapeMd(r.error ?? "(unknown)")} |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderSummaryTable(report: MatrixReport): string {
  const cells = aggregate(report);
  const lines: string[] = [];
  lines.push("| Tool count | MCP median tokens | Portal median tokens | Portal / MCP |");
  lines.push("|---:|---:|---:|---:|");
  for (const [count, agg] of cells) {
    const ratio = agg.mcp > 0 ? `${((agg.portal / agg.mcp) * 100).toFixed(1)}%` : "n/a";
    lines.push(`| ${count} | ${agg.mcp} | ${agg.portal} | ${ratio} |`);
  }
  return lines.join("\n");
}

function renderDetailTable(report: MatrixReport): string {
  const lines: string[] = [];
  lines.push("| # | Protocol | Tools | Task | Model | Run | Input | Output | Latency ms | Cost USD | ok |");
  lines.push("|---:|---|---:|---|---|---:|---:|---:|---:|---:|:-:|");
  report.results.forEach((r, i) => {
    lines.push(
      `| ${i} | ${r.cell.protocol} | ${r.cell.toolCount} | ${r.cell.taskId} | \`${r.cell.model}\` | ${r.cell.runIndex} | ${r.inputTokens} | ${r.outputTokens} | ${r.latencyMs} | ${r.costUsd.toFixed(6)} | ${r.ok ? "yes" : "no"} |`,
    );
  });
  return lines.join("\n");
}

function aggregate(
  report: MatrixReport,
): Array<[number, { mcp: number; portal: number }]> {
  const byCount = new Map<number, { mcp: number[]; portal: number[] }>();
  for (const r of report.results) {
    if (!r.ok) continue;
    let slot = byCount.get(r.cell.toolCount);
    if (!slot) {
      slot = { mcp: [], portal: [] };
      byCount.set(r.cell.toolCount, slot);
    }
    pushFor(slot, r.cell.protocol, r.inputTokens);
  }
  return [...byCount.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([c, { mcp, portal }]) => [c, { mcp: median(mcp), portal: median(portal) }]);
}

function pushFor(slot: { mcp: number[]; portal: number[] }, proto: Protocol, v: number): void {
  if (proto === "mcp") slot.mcp.push(v);
  else slot.portal.push(v);
}

function median(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? Math.round(sorted[mid] as number)
    : Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
}

function stampFromIso(iso: string): string {
  return iso.replace(/[:.]/g, "-").replace(/Z$/, "Z");
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export type { RunResult };
