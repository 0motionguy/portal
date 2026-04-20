export type BenchTaskId = "find_trending_ai" | "summarize_repo" | "search_agent_protocol";

export interface BenchTask {
  id: BenchTaskId;
  name: string;
  system: string;
  user: string;
  expectedTool: string;
  expectedParams?: Record<string, unknown>;
}

export interface CountTokensMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

export interface CountTokensToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface CountTokensRequest {
  model: string;
  system?: string;
  messages: ReadonlyArray<CountTokensMessage>;
  tools?: ReadonlyArray<CountTokensToolSpec>;
}

export interface MessageRequest extends CountTokensRequest {
  max_tokens: number;
  tool_choice?: {
    type: "auto" | "any" | "tool" | "none";
    name?: string;
  };
}

export interface MessageResponse {
  content: Array<Record<string, unknown>>;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface AnthropicClient {
  countTokens(req: CountTokensRequest): Promise<{ input_tokens: number }>;
  sendMessage(req: MessageRequest): Promise<MessageResponse>;
}

export { TASKS } from "./definitions.ts";
export {
  AnthropicApiError,
  createAnthropicClient,
  type CreateClientOptions,
} from "./anthropic-client.ts";
export { createMockClient, type MockClientOptions } from "./mock-client.ts";
