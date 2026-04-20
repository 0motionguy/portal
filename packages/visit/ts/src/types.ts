export type ParamType = "string" | "number" | "boolean" | "object" | "array";

export interface ParamEntry {
  type: ParamType;
  required?: boolean;
  description?: string;
}

export interface Tool {
  name: string;
  description?: string;
  params?: Record<string, ParamEntry>;
  paramsSchema?: Record<string, unknown>;
}

export interface Manifest {
  portal_version: string;
  name: string;
  brief: string;
  tools: Tool[];
  call_endpoint: string;
  auth?: "none" | "api_key" | "erc8004";
  pricing?: { model: "free" | "x402"; rate?: string };
}

/**
 * Structured observability events emitted by the SDK when `onEvent` is
 * supplied. Hooks are wrapped in try/catch — user callbacks cannot break
 * the SDK, but they CAN throw and be silently suppressed.
 */
export type VisitEvent =
  | { kind: "visit.start"; url: string }
  | { kind: "visit.end"; url: string; ms: number; bytes: number }
  | { kind: "call.start"; tool: string }
  | { kind: "call.end"; tool: string; ms: number; ok: boolean };

export interface VisitOptions {
  /** Replace the global `fetch` (mostly for tests). */
  fetchImpl?: typeof fetch;
  /** Extra headers on the manifest fetch. */
  headers?: Record<string, string>;
  /** Per-request timeout (default 5000). Aborts via AbortController. */
  timeoutMs?: number;
  /** Cap on manifest response body in bytes (default 1_000_000). */
  maxBytes?: number;
  /**
   * Allow plain `http://` URLs. Only honoured when the host is a loopback
   * (`localhost`, `127.0.0.1`, `::1`) for local development. In every other
   * case the URL is rejected before the fetch is issued.
   */
  allowInsecure?: boolean;
  /**
   * Upgrade the cross-origin `call_endpoint` warning to a hard failure.
   * Default: false (console.warn once, continue).
   */
  strictSameOrigin?: boolean;
  /**
   * Automatic retry count on transport errors and 5xx responses. Never
   * retries 4xx or successful parses. Default 1 (so 2 total tries).
   */
  retries?: number;
  /** Structured observability hook. */
  onEvent?: (evt: VisitEvent) => void;
}

export interface CallOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
  onEvent?: (evt: VisitEvent) => void;
}
