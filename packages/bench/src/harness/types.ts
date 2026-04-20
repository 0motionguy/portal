export type Protocol = "mcp" | "portal";

export type BenchMode = "count_tokens_only" | "full";

export const MODEL_IDS = {
  sonnet: "claude-sonnet-4-5",
  opus: "claude-opus-4-5",
} as const;

export type ModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const MODEL_PRICING: Record<ModelId, ModelPricing> = {
  [MODEL_IDS.sonnet]: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  [MODEL_IDS.opus]: { inputPerMillion: 15.0, outputPerMillion: 75.0 },
};

export const PORTAL_MANIFEST_PREAMBLE = [
  "You have visited a Portal. Before each turn, the visitor SDK gave you a",
  "compact manifest describing the service's tools. The manifest itself is",
  "not re-sent on every turn — only the tool you want to call and its",
  "params. When you call a tool, respond with: portal_call",
  '{ "tool": "<name>", "params": { ... } }. Keep params minimal. One tool',
  "call per turn. The service will reply with { ok, result } or { ok:false,",
  "error, code }.",
].join(" ");

export interface BenchCell {
  protocol: Protocol;
  toolCount: number;
  taskId: string;
  model: ModelId;
  runIndex: number;
}

export interface RunResult {
  cell: BenchCell;
  ok: boolean;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  error?: string;
  timestamp: string;
}

export interface MatrixReport {
  startedAt: string;
  finishedAt: string;
  mode: BenchMode;
  seed: number;
  protocols: readonly Protocol[];
  toolCounts: readonly number[];
  taskIds: readonly string[];
  modelIds: readonly ModelId[];
  runsPerCell: number;
  portalPreamble: string;
  results: readonly RunResult[];
}

export interface CountTokensRequest {
  model: string;
  system?: string;
  messages: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  tools?: ReadonlyArray<unknown>;
}

export interface CountTokensResponse {
  input_tokens: number;
}

export interface MessageRequest {
  model: string;
  system?: string;
  messages: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  tools?: ReadonlyArray<unknown>;
  max_tokens: number;
  tool_choice?: { type: "auto" | "any" | "tool" | "none"; name?: string };
}

// Mirrors Anthropic's /v1/messages response shape. Do not flatten — the real
// API nests token counts under `usage` and the harness depends on that path.
// See https://docs.claude.com/en/api/messages for the canonical shape.
export interface MessageResponse {
  content: Array<Record<string, unknown>>;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface AnthropicClient {
  countTokens(req: CountTokensRequest): Promise<CountTokensResponse>;
  sendMessage(req: MessageRequest): Promise<MessageResponse>;
}

export function computeCostUsd(model: ModelId, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICING[model];
  return (
    (inputTokens * price.inputPerMillion) / 1_000_000 +
    (outputTokens * price.outputPerMillion) / 1_000_000
  );
}
