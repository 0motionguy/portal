import { CallFailed, ManifestInvalid, PortalError, PortalNotFound, ToolNotInManifest } from "./errors.ts";
import type { ErrorCode } from "./errors.ts";
import type { CallOptions, Manifest, VisitEvent, VisitOptions } from "./types.ts";
import { assertValidManifest } from "./validate.ts";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_RETRIES = 1;

const VALID_CODES: readonly ErrorCode[] = [
  "NOT_FOUND",
  "INVALID_PARAMS",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "INTERNAL",
];

export interface Portal {
  readonly url: string;
  readonly manifest: Manifest;
  readonly tools: readonly string[];
  hasTool(name: string): boolean;
  call<T = unknown>(tool: string, params: Record<string, unknown>, opts?: CallOptions): Promise<T>;
}

export async function visit(url: string, opts: VisitOptions = {}): Promise<Portal> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const allowInsecure = opts.allowInsecure === true;

  try {
    assertHttps(url, allowInsecure);
  } catch (e) {
    throw new PortalNotFound(url, e);
  }

  emit(opts.onEvent, { kind: "visit.start", url });
  const t0 = Date.now();

  let bodyText: string;
  try {
    const res = await fetchWithRetry(
      fetchImpl,
      url,
      { headers: { accept: "application/json", ...opts.headers } },
      timeoutMs,
      retries,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bodyText = await readCapped(res, maxBytes);
  } catch (e) {
    if (e instanceof PortalError) throw e;
    throw new PortalNotFound(url, e);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch (e) {
    throw new ManifestInvalid(url, [`response was not valid JSON: ${describe(e)}`]);
  }

  assertValidManifest(url, parsed);

  // https on the advertised call_endpoint
  try {
    assertHttps(parsed.call_endpoint, allowInsecure);
  } catch (e) {
    throw new ManifestInvalid(url, [describe(e)]);
  }

  // Cross-origin call_endpoint: warn by default, throw under strictSameOrigin
  const manifestOrigin = new URL(url).origin;
  const callOrigin = new URL(parsed.call_endpoint).origin;
  if (manifestOrigin !== callOrigin) {
    const msg = `call_endpoint origin (${callOrigin}) differs from manifest origin (${manifestOrigin})`;
    if (opts.strictSameOrigin) throw new ManifestInvalid(url, [msg]);
    console.warn(`[@visitportal/visit] ${msg}. Pass strictSameOrigin:true to enforce.`);
  }

  emit(opts.onEvent, {
    kind: "visit.end",
    url,
    ms: Date.now() - t0,
    bytes: byteLen(bodyText),
  });

  return makePortal(url, parsed, fetchImpl, {
    timeoutMs,
    maxBytes,
    retries,
    onEvent: opts.onEvent,
  });
}

interface PortalDefaults {
  timeoutMs: number;
  maxBytes: number;
  retries: number;
  onEvent: VisitOptions["onEvent"];
}

function makePortal(
  url: string,
  manifest: Manifest,
  fetchImpl: typeof fetch,
  defaults: PortalDefaults,
): Portal {
  const toolNames: readonly string[] = manifest.tools.map((t) => t.name);

  return {
    url,
    manifest,
    tools: toolNames,
    hasTool(name) {
      return toolNames.includes(name);
    },
    async call<T>(tool: string, params: Record<string, unknown>, opts: CallOptions = {}) {
      if (!toolNames.includes(tool)) {
        throw new ToolNotInManifest(tool, toolNames);
      }
      const timeoutMs = opts.timeoutMs ?? defaults.timeoutMs;
      const maxBytes = opts.maxBytes ?? defaults.maxBytes;
      const retries = opts.retries ?? defaults.retries;
      const onEvent = opts.onEvent ?? defaults.onEvent;

      emit(onEvent, { kind: "call.start", tool });
      const t0 = Date.now();
      let ok = false;

      try {
        let res: Response;
        try {
          res = await fetchWithRetry(
            fetchImpl,
            manifest.call_endpoint,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: "application/json",
                ...opts.headers,
              },
              body: JSON.stringify({ tool, params }),
            },
            timeoutMs,
            retries,
          );
        } catch (e) {
          throw new CallFailed(tool, "INTERNAL", `transport failure: ${describe(e)}`);
        }

        let text: string;
        try {
          text = await readCapped(res, maxBytes);
        } catch (e) {
          throw new CallFailed(tool, "INTERNAL", describe(e));
        }

        if (!res.ok) {
          throw new CallFailed(tool, "INTERNAL", `HTTP ${res.status} ${text.slice(0, 400)}`);
        }

        let body: unknown;
        try {
          body = JSON.parse(text) as unknown;
        } catch (e) {
          throw new CallFailed(tool, "INTERNAL", `response was not JSON: ${describe(e)}`);
        }

        if (!isObject(body)) {
          throw new CallFailed(tool, "INTERNAL", "response body is not an object");
        }
        if (body.ok === true) {
          ok = true;
          return body.result as T;
        }
        if (body.ok === false) {
          const code = isErrorCode(body.code) ? body.code : "INTERNAL";
          const msg = typeof body.error === "string" ? body.error : "(no error message)";
          throw new CallFailed(tool, code, msg);
        }
        throw new CallFailed(tool, "INTERNAL", "response envelope missing 'ok' field");
      } finally {
        emit(onEvent, { kind: "call.end", tool, ms: Date.now() - t0, ok });
      }
    },
  };
}

// ---------- helpers ----------

function assertHttps(url: string, allowInsecure: boolean): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`invalid URL: ${url}`);
  }
  if (u.protocol === "https:") return;
  if (u.protocol === "http:" && allowInsecure && isLoopback(u.hostname)) return;
  if (u.protocol === "http:") {
    throw new Error("http:// is not allowed (set allowInsecure: true for http://localhost during development)");
  }
  throw new Error(`unsupported protocol: ${u.protocol}`);
}

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  retries: number,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const backoff = 100 + Math.floor(Math.random() * 200);
      await new Promise<void>((r) => setTimeout(r, backoff));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status >= 500 && res.status < 600 && attempt < retries) {
        // drain to release the connection before retrying
        try {
          await res.body?.cancel();
        } catch {
          /* ignore */
        }
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt >= retries) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function readCapped(res: Response, limit: number): Promise<string> {
  const cl = res.headers.get("content-length");
  if (cl && Number(cl) > limit) {
    throw new Error(`response body exceeded ${limit} bytes (content-length)`);
  }
  if (!res.body) {
    const text = await res.text();
    if (byteLen(text) > limit) throw new Error(`response body exceeded ${limit} bytes`);
    return text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throw new Error(`response body exceeded ${limit} bytes`);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

function byteLen(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

function emit(cb: ((e: VisitEvent) => void) | undefined, evt: VisitEvent): void {
  if (!cb) return;
  try {
    cb(evt);
  } catch {
    /* user hooks can't break the SDK */
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isErrorCode(x: unknown): x is ErrorCode {
  return typeof x === "string" && (VALID_CODES as readonly string[]).includes(x);
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
