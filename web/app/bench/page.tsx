import type { Metadata } from "next";
import { Nav, Foot } from "@/components/Nav";
import { loadChartSvg, loadMatrix, rollup } from "@/lib/bench";

export const metadata: Metadata = {
  title: "Benchmark",
  description:
    "Measured MCP vs Portal token overhead across 48 cells via Anthropic's count_tokens API. Reproducible from a clean clone.",
};

export default function BenchPage() {
  const matrix = loadMatrix();
  const rollupRows = rollup(matrix);
  const chart = loadChartSvg();

  const totalCells = matrix.results.length;
  const ok = matrix.results.filter((r) => r.ok).length;

  return (
    <>
      <Nav active="bench" />
      <main className="page">
        <span className="eyebrow">▶ benchmark · reproducible · integrity-first</span>
        <h1>
          Measured, not <em>estimated.</em>
        </h1>
        <p className="lede">
          Every token-cost claim on visitportal.dev is produced by Anthropic's
          <code style={{ marginLeft: 6, marginRight: 6 }}>count_tokens</code>
          API. If the measurement disagrees with the pitch, we update the pitch.
          Never the other way.
        </p>

        <h2>Canonical run — <em>tokens-matrix-v1</em></h2>
        <p>
          {totalCells} cells · {ok} ok · seed <code>{matrix.seed}</code> · mode{" "}
          <code>{matrix.mode}</code>
        </p>
        <p>
          Started{" "}
          <code>{matrix.startedAt}</code>, finished <code>{matrix.finishedAt}</code>.{" "}
          Full raw JSON:{" "}
          <a href="https://github.com/mbasildolger/portal/blob/main/packages/bench/results/tokens-matrix-v1.json">
            packages/bench/results/tokens-matrix-v1.json
          </a>
          .
        </p>

        <h2>Summary</h2>
        <p>Median input tokens per turn, by tool count, across the matrix:</p>
        <table>
          <thead>
            <tr>
              <th>Tool count</th>
              <th>MCP (median input tokens)</th>
              <th>Portal</th>
              <th>MCP : Portal</th>
            </tr>
          </thead>
          <tbody>
            {rollupRows.map((r) => (
              <tr key={r.toolCount}>
                <td>{r.toolCount.toLocaleString()}</td>
                <td>{r.mcpMedian.toLocaleString()}</td>
                <td>{r.portalMedian.toLocaleString()}</td>
                <td>
                  <strong style={{ color: "var(--coral)" }}>{r.ratio.toFixed(1)}×</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: "var(--dim)", fontFamily: "'Geist Mono', monospace" }}>
          ▸ MCP scales linearly at ~137 tokens per preloaded tool in this simulation. Portal
          stays flat — the manifest is loaded on visit, not preloaded into every turn.
          Tokenizer parity across Sonnet 4.5 and Opus 4.5 confirmed (byte-identical counts
          for the same prompt + tool list).
        </p>

        <h2>Chart</h2>
        <div
          style={{
            background: "var(--paper-soft)",
            border: "1px solid var(--line)",
            padding: 20,
            borderRadius: 4,
          }}
          dangerouslySetInnerHTML={{ __html: chart }}
        />

        <h2>Reproduce it</h2>
        <pre>
          <code>{`export ANTHROPIC_API_KEY=sk-ant-...
pnpm install
BENCH_MODE=count_tokens_only pnpm --filter @visitportal/bench bench
# 48 cells against Anthropic's count_tokens API in ~20s, ~$0.10 total`}</code>
        </pre>
        <p>
          The bench harness is in <code>packages/bench/</code>. Scenarios live in{" "}
          <code>packages/bench/src/harness/bench.ts</code>; the MCP tool-schema simulator is{" "}
          <code>packages/bench/src/mcp-simulator.ts</code>; the tasks we measure against are
          in <code>packages/bench/src/tasks/definitions.ts</code>.
        </p>

        <h2>Methodology — <em>what we can and can't claim</em></h2>
        <p>
          The simulator generates plausible MCP tool schemas across seven domains
          (filesystem, github, search, database, http, communication, knowledge), derived
          from seed tools scraped from the{" "}
          <a href="https://github.com/modelcontextprotocol/servers">
            modelcontextprotocol/servers
          </a>{" "}
          repo. Mean description length ~112 chars; every tool has 1–6 params.
        </p>
        <p>
          <strong>Can claim:</strong> for a plausibly-shaped multi-server MCP deployment of
          N tools, preloaded schema consumes X tokens per turn on Sonnet 4.5 / Opus 4.5,
          measured by <code>count_tokens</code>. Determinism: same seed → byte-identical
          tools → byte-identical token counts.
        </p>
        <p>
          <strong>Cannot claim:</strong> that every specific real-world deployment is
          exactly this shape. Real MCP sometimes emits deeply nested JSON Schema
          (<code>$ref</code>, <code>oneOf</code>, <code>allOf</code>) which we skip — so
          our MCP number is a <strong>conservative lower bound</strong>. Full disclosure in{" "}
          <a href="https://github.com/mbasildolger/portal/blob/main/packages/bench/METHODOLOGY.md">
            packages/bench/METHODOLOGY.md
          </a>
          .
        </p>
      </main>
      <Foot />
    </>
  );
}
