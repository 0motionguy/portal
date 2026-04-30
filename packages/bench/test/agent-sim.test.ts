import { visit } from "@visitportal/visit";
import { describe, expect, it } from "vitest";
import { runAgentLoop } from "../src/agent/loop.ts";
import { createAgentSimPortal } from "../src/agent/portal-bridge.ts";
import type { AnthropicClient, MessageResponse } from "../src/tasks/index.ts";

// Stateful mock: returns tool_use once for the named tool, then end_turn with
// a final text answer. Mirrors a realistic single-tool agent loop.
function createScriptedClient(toolName: string, finalAnswer: string): AnthropicClient {
  let turn = 0;
  return {
    countTokens: async () => ({ input_tokens: 1 }),
    sendMessage: async (): Promise<MessageResponse> => {
      turn++;
      if (turn === 1) {
        return {
          content: [
            {
              type: "tool_use",
              id: "call_1",
              name: toolName,
              input: {},
            },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
        };
      }
      return {
        content: [{ type: "text", text: finalAnswer }],
        stop_reason: "end_turn",
        usage: { input_tokens: 20, output_tokens: 10 },
      };
    },
  };
}

describe("agent simulation (mocked Anthropic client)", () => {
  it("loop dispatches at least one tool call and exits with end_turn", async () => {
    const { fetchImpl, baseUrl } = createAgentSimPortal();
    const portal = await visit(baseUrl, { fetchImpl });

    const client = createScriptedClient("whoami", "I am the agent-sim Portal.");

    const result = await runAgentLoop({
      client,
      portal,
      system: "You are a research assistant. Use the available tools to answer.",
      userPrompt: "Identify yourself.",
      model: "claude-haiku-4-5-20251001",
      maxIterations: 3,
    });

    expect(result.toolCalls.length).toBe(1);
    const [first] = result.toolCalls;
    if (!first) throw new Error("expected at least one tool call");
    expect(first.tool).toBe("whoami");
    expect(first.ok).toBe(true);
    const firstResult = first.result as Record<string, unknown>;
    expect(firstResult.target).toBe("agent-sim");
    expect(result.stopReason).toBe("end_turn");
    expect(result.finalAnswer).toBe("I am the agent-sim Portal.");
    expect(result.error).toBeUndefined();
  });

  it("Portal call envelope shape conforms to spec (CP-01..CP-05 success shape)", async () => {
    const { fetchImpl, baseUrl } = createAgentSimPortal();
    const portal = await visit(baseUrl, { fetchImpl });

    const result = await runAgentLoop({
      client: createScriptedClient("list_repos", "ok"),
      portal,
      system: "Test",
      userPrompt: "Test",
      model: "claude-haiku-4-5-20251001",
      maxIterations: 3,
    });

    expect(result.toolCalls.length).toBe(1);
    // Every recorded call's result must be JSON-serializable (CP-01..CP-05 cover
    // string/object/null/array/boolean — we verify it round-trips through JSON).
    for (const call of result.toolCalls) {
      expect(call.result).toBeDefined();
      expect(typeof call.result).not.toBe("function");
      expect(() => JSON.stringify(call.result)).not.toThrow();
    }
    // list_repos returns an array (CP-04 shape).
    const [first] = result.toolCalls;
    if (!first) throw new Error("expected at least one tool call");
    expect(Array.isArray(first.result)).toBe(true);
  });

  it("surfaces a tool dispatch error as ok:false with no loop crash", async () => {
    const { fetchImpl, baseUrl } = createAgentSimPortal();
    const portal = await visit(baseUrl, { fetchImpl });

    // Drive the loop with a hand-rolled mock that requests an unknown tool.
    const client = {
      countTokens: async () => ({ input_tokens: 1 }),
      sendMessage: async () => ({
        content: [
          {
            type: "tool_use" as const,
            id: "call_1",
            name: "no_such_tool",
            input: {},
          },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    };

    const result = await runAgentLoop({
      client,
      portal,
      system: "Test",
      userPrompt: "Test",
      model: "claude-haiku-4-5-20251001",
      maxIterations: 1,
    });

    expect(result.toolCalls.length).toBe(1);
    const [first] = result.toolCalls;
    if (!first) throw new Error("expected at least one tool call");
    expect(first.ok).toBe(false);
    expect(first.tool).toBe("no_such_tool");
    // No error thrown — the bench expects graceful surfacing of CallFailed.
    expect(result.error).toBeUndefined();
  });
});

describe("portalToAnthropicTools", () => {
  it("converts Portal sugar params to a JSON Schema object", async () => {
    const { fetchImpl, baseUrl } = createAgentSimPortal();
    const portal = await visit(baseUrl, { fetchImpl });

    const { portalToAnthropicTools } = await import("../src/agent/loop.ts");
    const tools = portalToAnthropicTools(portal.manifest);

    expect(tools.length).toBe(2);
    const listRepos = tools.find((t) => t.name === "list_repos");
    if (!listRepos) throw new Error("list_repos tool not found in portalToAnthropicTools output");
    expect(listRepos.input_schema.type).toBe("object");
    const properties = listRepos.input_schema.properties as Record<string, unknown>;
    expect(properties.limit).toBeDefined();
  });
});
