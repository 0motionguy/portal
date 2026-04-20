import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { type Server, createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { runMatrix } from "../src/harness/bench.ts";
import { _internalForTest as chartInternals, renderChart } from "../src/harness/chart.ts";
import {
  renderMarkdown,
  writeChartSvg,
  writeJsonReport,
  writeMarkdownReport,
} from "../src/harness/result-writer.ts";
import { seedRng, shuffleInPlace } from "../src/harness/rng.ts";
import { TokenCountError, createTokenCounter } from "../src/harness/token-counter.ts";
import type {
  AnthropicClient,
  BenchCell,
  CountTokensRequest,
  MatrixReport,
  MessageRequest,
  MessageResponse,
  Protocol,
  RunResult,
} from "../src/harness/types.ts";
import { MODEL_IDS } from "../src/harness/types.ts";

type Handler = (req: {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}) => { status: number; headers?: Record<string, string>; body: unknown };

let currentHandler: Handler | null = null;
let server: Server;
let baseUrl = "";
const receivedRequests: Array<{
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}> = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = undefined;
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      receivedRequests.push({ method, path: url, headers: req.headers, body });
      if (!currentHandler) {
        res.writeHead(500);
        res.end("no handler");
        return;
      }
      const r = currentHandler({ method, path: url, headers: req.headers, body });
      res.writeHead(r.status, { "content-type": "application/json", ...(r.headers ?? {}) });
      res.end(typeof r.body === "string" ? r.body : JSON.stringify(r.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  receivedRequests.length = 0;
  currentHandler = null;
});

describe("token-counter", () => {
  test("POSTs to the right URL with the right headers and body", async () => {
    currentHandler = () => ({ status: 200, body: { input_tokens: 42 } });
    const tc = createTokenCounter({
      apiKey: "sk-test-key",
      endpoint: `${baseUrl}/v1/messages/count_tokens`,
    });
    const req: CountTokensRequest = {
      model: MODEL_IDS.sonnet,
      system: "you are helpful",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
    };
    const res = await tc.count(req);
    expect(res.input_tokens).toBe(42);
    expect(receivedRequests).toHaveLength(1);
    const r = receivedRequests[0];
    if (!r) throw new Error("missing request");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/v1/messages/count_tokens");
    expect(r.headers["x-api-key"]).toBe("sk-test-key");
    expect(r.headers["anthropic-version"]).toBe("2023-06-01");
    expect(r.headers["content-type"]).toContain("application/json");
    expect(r.body).toEqual(req);
  });

  test("retries on 429 and eventually succeeds", async () => {
    let calls = 0;
    currentHandler = () => {
      calls++;
      if (calls < 3) {
        return { status: 429, body: { error: { message: "rate limited" } } };
      }
      return { status: 200, body: { input_tokens: 7 } };
    };
    const tc = createTokenCounter({
      apiKey: "sk",
      endpoint: `${baseUrl}/v1/messages/count_tokens`,
      sleep: async () => {},
    });
    const res = await tc.count({
      model: MODEL_IDS.sonnet,
      messages: [{ role: "user", content: "x" }],
    });
    expect(res.input_tokens).toBe(7);
    expect(calls).toBe(3);
  });

  test("gives up after 3 retries on persistent 429", async () => {
    let calls = 0;
    currentHandler = () => {
      calls++;
      return { status: 429, body: { error: { message: "nope" } } };
    };
    const tc = createTokenCounter({
      apiKey: "sk",
      endpoint: `${baseUrl}/v1/messages/count_tokens`,
      sleep: async () => {},
      maxRetries: 3,
    });
    await expect(
      tc.count({ model: MODEL_IDS.sonnet, messages: [{ role: "user", content: "x" }] }),
    ).rejects.toBeInstanceOf(TokenCountError);
    expect(calls).toBe(4);
  });

  test("surfaces 401 without retry", async () => {
    let calls = 0;
    currentHandler = () => {
      calls++;
      return { status: 401, body: { error: { message: "bad key" } } };
    };
    const tc = createTokenCounter({
      apiKey: "sk",
      endpoint: `${baseUrl}/v1/messages/count_tokens`,
      sleep: async () => {},
    });
    const err = await tc
      .count({ model: MODEL_IDS.sonnet, messages: [{ role: "user", content: "x" }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(TokenCountError);
    expect((err as TokenCountError).status).toBe(401);
    expect(calls).toBe(1);
  });
});

describe("rng", () => {
  test("same seed produces same sequence", () => {
    const a = seedRng(42);
    const b = seedRng(42);
    const as: number[] = [];
    const bs: number[] = [];
    for (let i = 0; i < 10; i++) {
      as.push(a());
      bs.push(b());
    }
    expect(as).toEqual(bs);
  });

  test("different seeds produce different sequences", () => {
    const a = seedRng(1);
    const b = seedRng(2);
    expect(a()).not.toBe(b());
  });

  test("shuffleInPlace is deterministic under a seeded rng", () => {
    const r1 = seedRng(99);
    const r2 = seedRng(99);
    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const arr2 = [...arr1];
    shuffleInPlace(arr1, r1);
    shuffleInPlace(arr2, r2);
    expect(arr1).toEqual(arr2);
  });
});

describe("runMatrix", () => {
  const simulator = (count: number, _seed: number) =>
    Array.from({ length: count }, (_, i) => ({
      name: `tool_${i}`,
      description: `tool ${i}`,
      input_schema: {
        type: "object" as const,
        properties: { q: { type: "string" } },
        required: ["q"],
      },
    }));

  interface CountingClient extends AnthropicClient {
    countCalls: number;
    sendCalls: number;
  }

  function makeClient(
    overrides: Partial<{
      countTokens: AnthropicClient["countTokens"];
      sendMessage: AnthropicClient["sendMessage"];
    }> = {},
  ): CountingClient {
    const state = { countCalls: 0, sendCalls: 0 };
    const client: CountingClient = {
      countCalls: 0,
      sendCalls: 0,
      async countTokens(req: CountTokensRequest) {
        state.countCalls++;
        client.countCalls = state.countCalls;
        if (overrides.countTokens) return overrides.countTokens(req);
        const toolTokens = (req.tools?.length ?? 0) * 150;
        const sysTokens = req.system ? Math.ceil(req.system.length / 4) : 0;
        const userTokens = Math.ceil(req.messages.reduce((a, m) => a + m.content.length, 0) / 4);
        return { input_tokens: toolTokens + sysTokens + userTokens };
      },
      async sendMessage(req: MessageRequest): Promise<MessageResponse> {
        state.sendCalls++;
        client.sendCalls = state.sendCalls;
        if (overrides.sendMessage) return overrides.sendMessage(req);
        return {
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      },
    };
    return client;
  }

  test("honors runsPerCell (N runs per cell, not N total)", async () => {
    const client = makeClient();
    const report = await runMatrix({
      protocols: ["mcp", "portal"] as const,
      toolCounts: [10, 100],
      taskIds: ["alpha"],
      modelIds: [MODEL_IDS.sonnet],
      runsPerCell: 3,
      mode: "count_tokens_only",
      seed: 1,
      client,
      simulator,
      tasks: [{ id: "alpha", name: "alpha", system: "sys", user: "u", expectedTool: "tool_0" }],
    });
    expect(report.results).toHaveLength(2 * 2 * 1 * 1 * 3);
    const perProto = new Map<Protocol, number>();
    for (const r of report.results) {
      perProto.set(r.cell.protocol, (perProto.get(r.cell.protocol) ?? 0) + 1);
    }
    expect(perProto.get("mcp")).toBe(6);
    expect(perProto.get("portal")).toBe(6);
  });

  test("count_tokens_only mode skips sendMessage", async () => {
    const client = makeClient();
    await runMatrix({
      protocols: ["mcp"] as const,
      toolCounts: [10],
      taskIds: ["alpha"],
      modelIds: [MODEL_IDS.sonnet],
      runsPerCell: 2,
      mode: "count_tokens_only",
      seed: 1,
      client,
      simulator,
      tasks: [{ id: "alpha", name: "alpha", system: "sys", user: "u", expectedTool: "tool_0" }],
    });
    expect(client.countCalls).toBe(2);
    expect(client.sendCalls).toBe(0);
  });

  test("full mode calls sendMessage too", async () => {
    const client = makeClient();
    const report = await runMatrix({
      protocols: ["portal"] as const,
      toolCounts: [10],
      taskIds: ["alpha"],
      modelIds: [MODEL_IDS.sonnet],
      runsPerCell: 1,
      mode: "full",
      seed: 1,
      client,
      simulator,
      tasks: [{ id: "alpha", name: "alpha", system: "sys", user: "u", expectedTool: "tool_0" }],
    });
    expect(client.countCalls).toBe(1);
    expect(client.sendCalls).toBe(1);
    const r = report.results[0];
    if (!r) throw new Error("no result");
    expect(r.outputTokens).toBe(50);
  });

  test("MCP path includes all tools, Portal path does not", async () => {
    const seenRequests: CountTokensRequest[] = [];
    const client = makeClient({
      async countTokens(req: CountTokensRequest) {
        seenRequests.push(req);
        return { input_tokens: (req.tools?.length ?? 0) * 100 + 10 };
      },
    });
    await runMatrix({
      protocols: ["mcp", "portal"] as const,
      toolCounts: [50],
      taskIds: ["alpha"],
      modelIds: [MODEL_IDS.sonnet],
      runsPerCell: 1,
      mode: "count_tokens_only",
      seed: 1,
      client,
      simulator,
      tasks: [{ id: "alpha", name: "alpha", system: "sys", user: "u", expectedTool: "tool_0" }],
    });
    const mcpReq = seenRequests.find((r) => (r.tools?.length ?? 0) > 0);
    const portalReq = seenRequests.find((r) => (r.tools?.length ?? 0) === 0);
    expect(mcpReq).toBeDefined();
    expect(portalReq).toBeDefined();
    expect(mcpReq?.tools?.length).toBe(50);
    expect(portalReq?.system ?? "").toContain("manifest");
  });

  test("records a failure cleanly when countTokens throws (e.g. 404 on model)", async () => {
    const client = makeClient({
      async countTokens() {
        throw new TokenCountError("404 model not found", 404, "http_error");
      },
    });
    const report = await runMatrix({
      protocols: ["mcp"] as const,
      toolCounts: [10],
      taskIds: ["alpha"],
      modelIds: [MODEL_IDS.sonnet],
      runsPerCell: 1,
      mode: "count_tokens_only",
      seed: 1,
      client,
      simulator,
      tasks: [{ id: "alpha", name: "alpha", system: "sys", user: "u", expectedTool: "tool_0" }],
    });
    expect(report.results).toHaveLength(1);
    const r = report.results[0];
    if (!r) throw new Error("no result");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("404");
  });

  test("emits progress events", async () => {
    const events: string[] = [];
    const client = makeClient();
    await runMatrix({
      protocols: ["mcp"] as const,
      toolCounts: [10],
      taskIds: ["alpha"],
      modelIds: [MODEL_IDS.sonnet],
      runsPerCell: 2,
      mode: "count_tokens_only",
      seed: 1,
      client,
      simulator,
      tasks: [{ id: "alpha", name: "alpha", system: "sys", user: "u", expectedTool: "tool_0" }],
      onProgress: (e) => events.push(e.kind),
    });
    expect(events).toEqual(["cell_start", "cell_done", "cell_start", "cell_done"]);
  });
});

describe("result-writer", () => {
  function makeReport(): MatrixReport {
    const cell = (
      protocol: Protocol,
      toolCount: number,
      runIndex: number,
      inputTokens: number,
    ): RunResult => ({
      cell: {
        protocol,
        toolCount,
        taskId: "alpha",
        model: MODEL_IDS.sonnet,
        runIndex,
      } satisfies BenchCell,
      ok: true,
      inputTokens,
      outputTokens: 0,
      latencyMs: 1,
      costUsd: 0,
      timestamp: "2026-04-19T00:00:00.000Z",
    });
    return {
      startedAt: "2026-04-19T00:00:00.000Z",
      finishedAt: "2026-04-19T00:00:01.000Z",
      mode: "count_tokens_only",
      seed: 1,
      protocols: ["mcp", "portal"],
      toolCounts: [10, 100],
      taskIds: ["alpha"],
      modelIds: [MODEL_IDS.sonnet],
      runsPerCell: 2,
      portalPreamble: "short preamble",
      results: [
        cell("mcp", 10, 0, 1500),
        cell("mcp", 10, 1, 1520),
        cell("portal", 10, 0, 250),
        cell("portal", 10, 1, 260),
        cell("mcp", 100, 0, 15000),
        cell("mcp", 100, 1, 15100),
        cell("portal", 100, 0, 260),
        cell("portal", 100, 1, 270),
      ],
    };
  }

  test("writeJsonReport writes a file that round-trips", () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-"));
    const path = writeJsonReport(makeReport(), dir);
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as MatrixReport;
    expect(parsed.results.length).toBe(8);
    expect(parsed.mode).toBe("count_tokens_only");
    expect(parsed.portalPreamble).toBe("short preamble");
  });

  test("writeMarkdownReport produces a table that mentions both protocols", () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-"));
    const path = writeMarkdownReport(makeReport(), dir);
    const md = readFileSync(path, "utf8");
    expect(md).toContain("MCP median tokens");
    expect(md).toContain("Portal median tokens");
    expect(md).toContain("Methodology");
    expect(md).toMatch(/\| 10 \| \d+ \| \d+ \|/);
    expect(md).toMatch(/\| 100 \| \d+ \| \d+ \|/);
  });

  test("renderMarkdown respects per-cell detail rows", () => {
    const md = renderMarkdown(makeReport(), "test-stamp");
    expect(md).toContain("Per-cell detail");
    expect(md).toContain("| 0 | mcp | 10 |");
    expect(md).toContain("| 7 | portal | 100 |");
  });

  test("writeChartSvg emits a valid-looking SVG", () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-"));
    const path = writeChartSvg(makeReport(), dir);
    const svg = readFileSync(path, "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("MCP");
    expect(svg).toContain("Portal");
    expect(svg).toContain("<title");
  });

  test("chart aggregation medians across runs", () => {
    const { aggregated } = chartInternals(makeReport());
    expect(aggregated).toHaveLength(2);
    const ten = aggregated.find((a) => a.toolCount === 10);
    const hundred = aggregated.find((a) => a.toolCount === 100);
    expect(ten?.mcp).toBe(1510);
    expect(ten?.portal).toBe(255);
    expect(hundred?.mcp).toBe(15050);
    expect(hundred?.portal).toBe(265);
  });

  test("renderChart embeds a11y title and desc", () => {
    const svg = renderChart(makeReport());
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title");
    expect(svg).toContain("<desc");
  });
});

describe("output artifacts end-to-end", () => {
  test("writes json + md + svg with matching basenames", () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-"));
    const report: MatrixReport = {
      startedAt: "2026-04-19T00:00:00.000Z",
      finishedAt: "2026-04-19T00:00:05.000Z",
      mode: "count_tokens_only",
      seed: 1,
      protocols: ["mcp", "portal"],
      toolCounts: [10],
      taskIds: ["t"],
      modelIds: [MODEL_IDS.sonnet],
      runsPerCell: 1,
      portalPreamble: "pre",
      results: [
        {
          cell: {
            protocol: "mcp",
            toolCount: 10,
            taskId: "t",
            model: MODEL_IDS.sonnet,
            runIndex: 0,
          },
          ok: true,
          inputTokens: 1000,
          outputTokens: 0,
          latencyMs: 1,
          costUsd: 0.003,
          timestamp: "2026-04-19T00:00:01.000Z",
        },
        {
          cell: {
            protocol: "portal",
            toolCount: 10,
            taskId: "t",
            model: MODEL_IDS.sonnet,
            runIndex: 0,
          },
          ok: true,
          inputTokens: 200,
          outputTokens: 0,
          latencyMs: 1,
          costUsd: 0.0006,
          timestamp: "2026-04-19T00:00:02.000Z",
        },
      ],
    };
    writeJsonReport(report, dir);
    writeMarkdownReport(report, dir);
    writeChartSvg(report, dir);
    const files = readdirSync(dir);
    expect(files.filter((f) => f.endsWith(".json"))).toHaveLength(1);
    expect(files.filter((f) => f.endsWith(".md"))).toHaveLength(1);
    expect(files.filter((f) => f.endsWith(".svg"))).toHaveLength(1);
  });
});
