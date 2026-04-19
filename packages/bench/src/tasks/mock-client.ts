import type {
  AnthropicClient,
  CountTokensRequest,
  MessageRequest,
  MessageResponse,
} from "./index.ts";

export interface MockClientOptions {
  seed?: number;
}

const FIXED_OUTPUT_TOKENS = 30;

export function createMockClient(_opts: MockClientOptions = {}): AnthropicClient {
  // Seed is accepted for forward-compatibility but the current mock is fully
  // deterministic without any random input, so we deliberately ignore it.
  return {
    async countTokens(req: CountTokensRequest) {
      return { input_tokens: approximateInputTokens(req) };
    },
    async sendMessage(req: MessageRequest): Promise<MessageResponse> {
      const input = approximateInputTokens(req);
      const firstTool = req.tools?.[0];
      const content: Array<Record<string, unknown>> = firstTool
        ? [
            {
              type: "tool_use",
              id: `mock_tool_use_${firstTool.name}`,
              name: firstTool.name,
              input: {},
            },
          ]
        : [{ type: "text", text: "(mock reply)" }];
      return {
        content,
        stop_reason: firstTool ? "tool_use" : "end_turn",
        usage: { input_tokens: input, output_tokens: FIXED_OUTPUT_TOKENS },
      };
    },
  };
}

function approximateInputTokens(req: CountTokensRequest): number {
  let chars = 0;
  if (req.system) chars += req.system.length;
  for (const m of req.messages) {
    if (typeof m.content === "string") {
      chars += m.content.length;
    } else {
      chars += JSON.stringify(m.content).length;
    }
  }
  const textTokens = Math.ceil(chars / 4);
  let toolTokens = 0;
  if (req.tools) {
    for (const t of req.tools) {
      toolTokens += Math.ceil(JSON.stringify(t).length / 4);
    }
  }
  return textTokens + toolTokens;
}
