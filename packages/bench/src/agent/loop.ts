// Minimal agent loop that drives a Claude messages call against a Portal.
//
// Single iteration: send messages + tools to Claude, parse tool_use blocks,
// dispatch each via the visitor SDK, feed results back as tool_result blocks,
// repeat until stop_reason is "end_turn" or maxIterations is hit.
//
// Used by:
//   - packages/bench/scripts/agent-sim.ts (live, requires ANTHROPIC_API_KEY)
//   - packages/bench/test/agent-sim.test.ts (mocked client)
//
// No dependency on packages/spec internals — manifest comes from the Portal
// provider; tool schemas are derived inline.

import type { Manifest, ParamEntry } from "@visitportal/provider";
import type { Portal } from "@visitportal/visit";
import type {
  AnthropicClient,
  CountTokensMessage,
  CountTokensToolSpec,
  MessageRequest,
  MessageResponse,
} from "../tasks/index.ts";

export interface AgentLoopOptions {
  client: AnthropicClient;
  portal: Portal;
  system: string;
  userPrompt: string;
  model: string;
  maxIterations?: number;
  maxTokens?: number;
}

export interface ToolCallRecord {
  tool: string;
  params: Record<string, unknown>;
  result: unknown;
  ok: boolean;
}

export interface AgentLoopResult {
  finalAnswer: string | null;
  toolCalls: ToolCallRecord[];
  iterations: number;
  stopReason: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  error?: string;
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const maxIterations = opts.maxIterations ?? 5;
  const maxTokens = opts.maxTokens ?? 1024;

  const tools = portalToAnthropicTools(opts.portal.manifest);
  const messages: CountTokensMessage[] = [{ role: "user", content: opts.userPrompt }];
  const toolCalls: ToolCallRecord[] = [];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let stopReason = "max_iterations";
  let iteration = 0;
  let lastResponse: MessageResponse | null = null;

  for (iteration = 0; iteration < maxIterations; iteration++) {
    const req: MessageRequest = {
      model: opts.model,
      system: opts.system,
      messages,
      tools,
      max_tokens: maxTokens,
    };
    const res = await opts.client.sendMessage(req);
    lastResponse = res;
    totalInputTokens += res.usage.input_tokens;
    totalOutputTokens += res.usage.output_tokens;
    stopReason = res.stop_reason;

    if (res.stop_reason === "end_turn") {
      break;
    }

    if (res.stop_reason !== "tool_use") {
      return {
        finalAnswer: null,
        toolCalls,
        iterations: iteration + 1,
        stopReason: res.stop_reason,
        totalInputTokens,
        totalOutputTokens,
        error: `unexpected stop_reason: ${res.stop_reason}`,
      };
    }

    const toolUseBlocks = res.content.filter(
      (b): b is { type: "tool_use"; id: string; name: string; input?: Record<string, unknown> } =>
        b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string",
    );

    if (toolUseBlocks.length === 0) {
      return {
        finalAnswer: null,
        toolCalls,
        iterations: iteration + 1,
        stopReason: res.stop_reason,
        totalInputTokens,
        totalOutputTokens,
        error: "stop_reason=tool_use but no tool_use blocks present",
      };
    }

    const toolResultBlocks: Array<Record<string, unknown>> = [];

    for (const tu of toolUseBlocks) {
      const params = (tu.input ?? {}) as Record<string, unknown>;
      let result: unknown;
      let ok = true;
      try {
        result = await opts.portal.call(tu.name, params);
      } catch (err) {
        ok = false;
        result = { error: describe(err) };
      }
      toolCalls.push({ tool: tu.name, params, result, ok });
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
        ...(ok ? {} : { is_error: true }),
      });
    }

    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: toolResultBlocks });
  }

  const finalAnswer = lastResponse ? extractText(lastResponse.content) : null;
  return {
    finalAnswer,
    toolCalls,
    iterations: iteration + (stopReason === "end_turn" ? 1 : 0),
    stopReason,
    totalInputTokens,
    totalOutputTokens,
  };
}

export function portalToAnthropicTools(manifest: Manifest): CountTokensToolSpec[] {
  return manifest.tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema:
      t.paramsSchema ?? sugarToJsonSchema((t.params ?? {}) as Record<string, ParamEntry>),
  }));
}

function sugarToJsonSchema(params: Record<string, ParamEntry>): Record<string, unknown> {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  for (const [name, entry] of Object.entries(params)) {
    const prop: Record<string, unknown> = { type: entry.type };
    if (entry.description !== undefined) prop.description = entry.description;
    properties[name] = prop;
    if (entry.required === true) required.push(name);
  }
  const schema: Record<string, unknown> = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

function extractText(content: ReadonlyArray<Record<string, unknown>>): string | null {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  if (parts.length === 0) return null;
  return parts.join("\n");
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
