import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { adaptMcpServer } from "../src/index.ts";

const fixtures = new URL("./fixtures/mock-mcp-server.mjs", import.meta.url);
const fixturePath = fileURLToPath(fixtures);
const adapters: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  while (adapters.length > 0) {
    const adapter = adapters.pop();
    if (adapter) await adapter.close();
  }
});

describe("@visitportal/mcp-adapter", () => {
  test("builds a Portal manifest from MCP tools and sanitizes names", async () => {
    const adapter = await adaptMcpServer({
      command: process.execPath,
      args: [fixturePath],
    });
    adapters.push(adapter);

    expect(adapter.serverInfo.name).toBe("Mock MCP");
    expect(adapter.manifest.name).toContain("Mock MCP");
    expect(adapter.tools).toEqual([
      expect.objectContaining({ portalName: "echo_tool", mcpName: "echo-tool" }),
      expect.objectContaining({ portalName: "sum", mcpName: "sum" }),
      expect.objectContaining({ portalName: "broken", mcpName: "broken" }),
    ]);
    expect(adapter.manifest.tools.map((tool) => tool.name)).toEqual(["echo_tool", "sum", "broken"]);
  });

  test("dispatches tool calls through MCP and prefers structured content", async () => {
    const adapter = await adaptMcpServer({
      command: process.execPath,
      args: [fixturePath],
    });
    adapters.push(adapter);

    const echo = await adapter.portal.dispatch({ tool: "echo_tool", params: { text: "hi" } });
    expect(echo).toEqual({
      status: 200,
      body: { ok: true, result: { echoed: "hi" } },
    });

    const sum = await adapter.portal.dispatch({ tool: "sum", params: { a: 2, b: 3 } });
    expect(sum).toEqual({
      status: 200,
      body: { ok: true, result: "5" },
    });
  });

  test("maps MCP tool errors into Portal INTERNAL envelopes", async () => {
    const adapter = await adaptMcpServer({
      command: process.execPath,
      args: [fixturePath],
    });
    adapters.push(adapter);

    const result = await adapter.portal.dispatch({ tool: "broken", params: {} });
    expect(result).toEqual({
      status: 500,
      body: { ok: false, error: "mock tool failure", code: "INTERNAL" },
    });
  });

  test("portal.fetch serves manifest and call endpoint", async () => {
    const adapter = await adaptMcpServer({
      command: process.execPath,
      args: [fixturePath],
    });
    adapters.push(adapter);

    const manifest = await adapter.portal.fetch(new Request("http://localhost/portal"));
    expect(manifest.status).toBe(200);
    await expect(manifest.json()).resolves.toMatchObject({
      call_endpoint: "/portal/call",
    });

    const call = await adapter.portal.fetch(
      new Request("http://localhost/portal/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: "echo_tool", params: { text: "via-fetch" } }),
      }),
    );
    expect(call.status).toBe(200);
    await expect(call.json()).resolves.toEqual({
      ok: true,
      result: { echoed: "via-fetch" },
    });
  });
});
