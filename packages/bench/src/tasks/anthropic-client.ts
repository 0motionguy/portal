import type {
  AnthropicClient,
  CountTokensRequest,
  MessageRequest,
  MessageResponse,
} from "./index.ts";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_RETRIES = 3;
// Backoff schedule: 200ms, 600ms, 1800ms. Tripling rather than doubling gives
// the server a bit more headroom before the final attempt; determinism > jitter
// because the bench is sequential and must reproduce byte-identically.
const BACKOFF_MS = [200, 600, 1800] as const;

interface ErrorBody {
  type?: string;
  error?: { type?: string; message?: string };
}

export class AnthropicApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly requestId: string | undefined;
  constructor(init: {
    status: number | null;
    code: string;
    message: string;
    requestId?: string | undefined;
  }) {
    super(`${init.code}: ${init.message}`);
    this.name = "AnthropicApiError";
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
  }
}

export interface CreateClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

export function createAnthropicClient(opts: CreateClientOptions): AnthropicClient {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "createAnthropicClient: no fetch implementation available — pass fetchImpl explicitly",
    );
  }
  const sleep = opts.sleep ?? defaultSleep;
  const maxRetries = opts.maxRetries ?? MAX_RETRIES;

  async function request<T>(path: string, body: unknown): Promise<T> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestOnce<T>(path, body);
      } catch (e) {
        lastError = e;
        if (!isRetryable(e) || attempt === maxRetries) {
          break;
        }
        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 0;
        await sleep(delay);
      }
    }
    if (lastError instanceof AnthropicApiError) throw lastError;
    throw new AnthropicApiError({
      status: null,
      code: "network_error",
      message: describe(lastError),
    });
  }

  async function requestOnce<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "x-api-key": opts.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // Network failures are surfaced as retryable errors so the outer loop
      // decides whether to back off.
      throw new AnthropicApiError({
        status: null,
        code: "network_error",
        message: describe(e),
      });
    }

    const requestId = res.headers.get("request-id") ?? undefined;

    if (!res.ok) {
      const text = await readTextSafely(res);
      const parsed = parseErrorBody(text);
      const fallbackMessage = truncate(text, 300) || res.statusText;
      throw new AnthropicApiError({
        status: res.status,
        code: parsed.code ?? defaultCodeFor(res.status),
        message: parsed.message ?? fallbackMessage,
        ...(requestId !== undefined ? { requestId } : {}),
      });
    }

    let json: unknown;
    try {
      json = (await res.json()) as unknown;
    } catch (e) {
      throw new AnthropicApiError({
        status: res.status,
        code: "invalid_response",
        message: `response was not JSON: ${describe(e)}`,
        ...(requestId !== undefined ? { requestId } : {}),
      });
    }
    return json as T;
  }

  return {
    async countTokens(req: CountTokensRequest) {
      const json = await request<Record<string, unknown>>("/v1/messages/count_tokens", req);
      const v = json.input_tokens;
      if (typeof v !== "number") {
        throw new AnthropicApiError({
          status: 200,
          code: "invalid_response",
          message: `count_tokens response missing input_tokens: ${JSON.stringify(json).slice(0, 200)}`,
        });
      }
      return { input_tokens: v };
    },
    async sendMessage(req: MessageRequest): Promise<MessageResponse> {
      const json = await request<Record<string, unknown>>("/v1/messages", req);
      return toMessageResponse(json);
    },
  };
}

function toMessageResponse(json: Record<string, unknown>): MessageResponse {
  const content = json.content;
  const stopReason = json.stop_reason;
  const usage = json.usage as Record<string, unknown> | undefined;
  if (!Array.isArray(content)) {
    throw new AnthropicApiError({
      status: 200,
      code: "invalid_response",
      message: `messages response missing content array: ${JSON.stringify(json).slice(0, 200)}`,
    });
  }
  if (typeof stopReason !== "string") {
    throw new AnthropicApiError({
      status: 200,
      code: "invalid_response",
      message: "messages response missing stop_reason",
    });
  }
  const inputTokens =
    usage && typeof usage.input_tokens === "number" ? (usage.input_tokens as number) : 0;
  const outputTokens =
    usage && typeof usage.output_tokens === "number" ? (usage.output_tokens as number) : 0;
  return {
    content: content as Array<Record<string, unknown>>,
    stop_reason: stopReason,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function parseErrorBody(text: string): { code?: string; message?: string } {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as ErrorBody;
    const errObj = parsed.error;
    if (errObj && typeof errObj === "object") {
      const out: { code?: string; message?: string } = {};
      if (typeof errObj.type === "string") out.code = errObj.type;
      if (typeof errObj.message === "string") out.message = errObj.message;
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

function defaultCodeFor(status: number): string {
  if (status === 400) return "invalid_request_error";
  if (status === 401) return "authentication_error";
  if (status === 403) return "permission_error";
  if (status === 404) return "not_found_error";
  if (status === 413) return "request_too_large";
  if (status === 429) return "rate_limit_error";
  if (status >= 500 && status < 600) return "api_error";
  return "http_error";
}

function isRetryable(e: unknown): boolean {
  if (!(e instanceof AnthropicApiError)) return false;
  if (e.status === null) return true;
  if (e.status === 429) return true;
  if (e.status >= 500 && e.status < 600) return true;
  return false;
}

async function readTextSafely(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
