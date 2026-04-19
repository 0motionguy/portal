import type { CountTokensRequest, CountTokensResponse } from "./types.ts";

const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages/count_tokens";
const DEFAULT_VERSION = "2023-06-01";
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

export class TokenCountError extends Error {
  readonly status: number | null;
  readonly code: string;
  constructor(message: string, status: number | null, code: string) {
    super(message);
    this.name = "TokenCountError";
    this.status = status;
    this.code = code;
  }
}

export interface TokenCounterOptions {
  apiKey: string;
  endpoint?: string;
  anthropicVersion?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

export interface TokenCounter {
  count(req: CountTokensRequest): Promise<CountTokensResponse>;
}

export function createTokenCounter(opts: TokenCounterOptions): TokenCounter {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const version = opts.anthropicVersion ?? DEFAULT_VERSION;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const maxRetries = opts.maxRetries ?? MAX_RETRIES;

  async function attempt(req: CountTokensRequest): Promise<CountTokensResponse> {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "x-api-key": opts.apiKey,
        "anthropic-version": version,
        "content-type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const status = res.status;
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        detail = "(no body)";
      }
      const code = status === 401 ? "unauthorized" : status === 429 ? "rate_limited" : "http_error";
      throw new TokenCountError(
        `count_tokens ${status}: ${truncate(detail, 300)}`,
        status,
        code,
      );
    }

    let body: unknown;
    try {
      body = (await res.json()) as unknown;
    } catch (e) {
      throw new TokenCountError(
        `count_tokens response was not JSON: ${describe(e)}`,
        res.status,
        "bad_body",
      );
    }

    if (!isCountTokensResponse(body)) {
      throw new TokenCountError(
        `count_tokens response missing input_tokens: ${JSON.stringify(body).slice(0, 200)}`,
        res.status,
        "bad_shape",
      );
    }

    return body;
  }

  return {
    async count(req) {
      let lastError: unknown = null;
      for (let i = 0; i <= maxRetries; i++) {
        try {
          return await attempt(req);
        } catch (e) {
          lastError = e;
          if (!isRetryable(e) || i === maxRetries) {
            break;
          }
          // Exponential backoff: 500ms, 1000ms, 2000ms. Jitter left out on purpose
          // — the bench is sequential and determinism matters more than fairness.
          await sleep(RETRY_BASE_MS * 2 ** i);
        }
      }
      if (lastError instanceof TokenCountError) throw lastError;
      throw new TokenCountError(
        `count_tokens failed: ${describe(lastError)}`,
        null,
        "unknown",
      );
    },
  };
}

function isRetryable(e: unknown): boolean {
  if (e instanceof TokenCountError) {
    if (e.status === null) return true;
    if (e.status === 429) return true;
    if (e.status >= 500 && e.status < 600) return true;
    return false;
  }
  return true;
}

function isCountTokensResponse(x: unknown): x is CountTokensResponse {
  return typeof x === "object" && x !== null && typeof (x as { input_tokens: unknown }).input_tokens === "number";
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
