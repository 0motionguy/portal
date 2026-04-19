import type { MatrixReport, RunResult } from "./types.ts";

interface Bar {
  toolCount: number;
  mcp: number;
  portal: number;
}

const WIDTH = 800;
const HEIGHT = 500;
const PAD_LEFT = 70;
const PAD_RIGHT = 30;
const PAD_TOP = 60;
const PAD_BOTTOM = 70;
const MCP_COLOR = "#e6554a";
const PORTAL_COLOR = "#3d8bfd";
const AXIS_COLOR = "#1a1a1a";
const GRID_COLOR = "#e4e4e4";
const BG = "#ffffff";

export function renderChart(report: MatrixReport): string {
  const bars = aggregate(report);
  if (bars.length === 0) {
    return renderEmpty();
  }
  const chartW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const chartH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const maxVal = Math.max(...bars.flatMap((b) => [b.mcp, b.portal]));
  const yMax = niceCeiling(maxVal);
  const groupWidth = chartW / bars.length;
  const barWidth = Math.min(60, groupWidth * 0.35);
  const gap = 4;

  const ticks = yTicks(yMax);
  const rows: string[] = [];
  rows.push(`<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${BG}" />`);

  rows.push(
    `<text x="${WIDTH / 2}" y="28" text-anchor="middle" font-size="18" font-weight="600" font-family="system-ui, sans-serif" fill="${AXIS_COLOR}">MCP preloaded schemas vs Portal on-visit — input tokens per turn</text>`,
  );

  for (const t of ticks) {
    const y = PAD_TOP + chartH - (t / yMax) * chartH;
    rows.push(
      `<line x1="${PAD_LEFT}" y1="${y}" x2="${WIDTH - PAD_RIGHT}" y2="${y}" stroke="${GRID_COLOR}" stroke-width="1" />`,
    );
    rows.push(
      `<text x="${PAD_LEFT - 10}" y="${y + 4}" text-anchor="end" font-size="11" font-family="system-ui, sans-serif" fill="${AXIS_COLOR}">${fmt(t)}</text>`,
    );
  }

  rows.push(
    `<line x1="${PAD_LEFT}" y1="${PAD_TOP}" x2="${PAD_LEFT}" y2="${HEIGHT - PAD_BOTTOM}" stroke="${AXIS_COLOR}" stroke-width="1.5" />`,
  );
  rows.push(
    `<line x1="${PAD_LEFT}" y1="${HEIGHT - PAD_BOTTOM}" x2="${WIDTH - PAD_RIGHT}" y2="${HEIGHT - PAD_BOTTOM}" stroke="${AXIS_COLOR}" stroke-width="1.5" />`,
  );

  rows.push(
    `<text x="20" y="${PAD_TOP + chartH / 2}" transform="rotate(-90 20 ${PAD_TOP + chartH / 2})" text-anchor="middle" font-size="12" font-family="system-ui, sans-serif" fill="${AXIS_COLOR}">median input tokens</text>`,
  );
  rows.push(
    `<text x="${PAD_LEFT + chartW / 2}" y="${HEIGHT - 18}" text-anchor="middle" font-size="12" font-family="system-ui, sans-serif" fill="${AXIS_COLOR}">tool count</text>`,
  );

  bars.forEach((bar, i) => {
    const groupCenter = PAD_LEFT + groupWidth * (i + 0.5);
    const mcpH = (bar.mcp / yMax) * chartH;
    const portalH = (bar.portal / yMax) * chartH;
    const mcpX = groupCenter - barWidth - gap / 2;
    const portalX = groupCenter + gap / 2;
    const mcpY = HEIGHT - PAD_BOTTOM - mcpH;
    const portalY = HEIGHT - PAD_BOTTOM - portalH;
    rows.push(
      `<rect x="${mcpX}" y="${mcpY}" width="${barWidth}" height="${mcpH}" fill="${MCP_COLOR}"><title>MCP @ ${bar.toolCount} tools: ${fmt(bar.mcp)} tokens</title></rect>`,
    );
    rows.push(
      `<rect x="${portalX}" y="${portalY}" width="${barWidth}" height="${portalH}" fill="${PORTAL_COLOR}"><title>Portal @ ${bar.toolCount} tools: ${fmt(bar.portal)} tokens</title></rect>`,
    );
    rows.push(
      `<text x="${mcpX + barWidth / 2}" y="${mcpY - 6}" text-anchor="middle" font-size="11" font-family="system-ui, sans-serif" fill="${AXIS_COLOR}">${fmt(bar.mcp)}</text>`,
    );
    rows.push(
      `<text x="${portalX + barWidth / 2}" y="${portalY - 6}" text-anchor="middle" font-size="11" font-family="system-ui, sans-serif" fill="${AXIS_COLOR}">${fmt(bar.portal)}</text>`,
    );
    rows.push(
      `<text x="${groupCenter}" y="${HEIGHT - PAD_BOTTOM + 20}" text-anchor="middle" font-size="13" font-weight="500" font-family="system-ui, sans-serif" fill="${AXIS_COLOR}">${bar.toolCount}</text>`,
    );
  });

  const legendY = HEIGHT - 36;
  const legendX = PAD_LEFT;
  rows.push(
    `<rect x="${legendX}" y="${legendY}" width="14" height="14" fill="${MCP_COLOR}" />`,
    `<text x="${legendX + 20}" y="${legendY + 12}" font-size="12" font-family="system-ui, sans-serif" fill="${AXIS_COLOR}">MCP (schemas preloaded)</text>`,
    `<rect x="${legendX + 210}" y="${legendY}" width="14" height="14" fill="${PORTAL_COLOR}" />`,
    `<text x="${legendX + 230}" y="${legendY + 12}" font-size="12" font-family="system-ui, sans-serif" fill="${AXIS_COLOR}">Portal (manifest on visit)</text>`,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title desc">`,
    `<title id="title">MCP preloaded schemas vs Portal on-visit — input tokens per turn, by tool count</title>`,
    `<desc id="desc">Grouped bar chart comparing MCP and Portal input-token cost at each tool count in the bench matrix. Numbers are median input tokens per turn across runs, measured via Anthropic's count_tokens API.</desc>`,
    ...rows,
    `</svg>`,
  ].join("\n");
}

function aggregate(report: MatrixReport): Bar[] {
  const byCount = new Map<number, { mcp: number[]; portal: number[] }>();
  for (const r of report.results) {
    if (!r.ok) continue;
    let slot = byCount.get(r.cell.toolCount);
    if (!slot) {
      slot = { mcp: [], portal: [] };
      byCount.set(r.cell.toolCount, slot);
    }
    if (r.cell.protocol === "mcp") slot.mcp.push(r.inputTokens);
    else slot.portal.push(r.inputTokens);
  }
  return [...byCount.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([toolCount, { mcp, portal }]) => ({
      toolCount,
      mcp: median(mcp),
      portal: median(portal),
    }));
}

function median(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function niceCeiling(v: number): number {
  if (v <= 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  let nice;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
}

function yTicks(yMax: number): number[] {
  const step = yMax / 4;
  return [0, step, step * 2, step * 3, yMax].map((x) => Math.round(x));
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return Math.round(n).toString();
}

function renderEmpty(): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title desc">`,
    `<title id="title">No results</title>`,
    `<desc id="desc">Empty bench matrix — nothing to render.</desc>`,
    `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${BG}" />`,
    `<text x="${WIDTH / 2}" y="${HEIGHT / 2}" text-anchor="middle" font-size="16" font-family="system-ui, sans-serif" fill="${AXIS_COLOR}">no results</text>`,
    `</svg>`,
  ].join("\n");
}

export function _internalForTest(report: MatrixReport): { aggregated: Bar[] } {
  return { aggregated: aggregate(report) };
}

export type { RunResult };
