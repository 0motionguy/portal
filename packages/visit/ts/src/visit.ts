import { CallFailed, ManifestInvalid, PortalNotFound, ToolNotInManifest } from "./errors.ts";
import type { ErrorCode } from "./errors.ts";
import type { CallOptions, Manifest, VisitOptions } from "./types.ts";
import { assertValidManifest } from "./validate.ts";

const DEFAULT_TIMEOUT_MS = 5000;
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

  let bodyText: string;
  try {
    const res = await withTimeout(
      fetchImpl(url, {
        headers: { accept: "application/json", ...opts.headers },
      }),
      timeoutMs,
    );
    if (!res.ok) {
      throw new PortalNotFound(url, new Error(`HTTP ${res.status}`));
    }
    bodyText = await res.text();
  } catch (e) {
    if (e instanceof PortalNotFound) throw e;
    throw new PortalNotFound(url, e);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch (e) {
    throw new ManifestInvalid(url, [
      `response was not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    ]);
  }

  assertValidManifest(url, parsed);
  return makePortal(url, parsed, fetchImpl);
}

function makePortal(url: string, manifest: Manifest, fetchImpl: typeof fetch): Portal {
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
      const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      let res: Response;
      try {
        res = await withTimeout(
          fetchImpl(manifest.call_endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json",
              ...opts.headers,
            },
            body: JSON.stringify({ tool, params }),
          }),
          timeoutMs,
        );
      } catch (e) {
        throw new CallFailed(tool, "INTERNAL", `transport failure: ${describe(e)}`);
      }

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          detail = `${detail} ${await res.text()}`.slice(0, 500);
        } catch {
          // ignore
        }
        throw new CallFailed(tool, "INTERNAL", detail);
      }

      let body: unknown;
      try {
        body = (await res.json()) as unknown;
      } catch (e) {
        throw new CallFailed(tool, "INTERNAL", `response was not JSON: ${describe(e)}`);
      }

      if (!isObject(body)) {
        throw new CallFailed(tool, "INTERNAL", "response body is not an object");
      }
      if (body.ok === true) {
        return body.result as T;
      }
      if (body.ok === false) {
        const code = isErrorCode(body.code) ? body.code : "INTERNAL";
        const msg = typeof body.error === "string" ? body.error : "(no error message)";
        throw new CallFailed(tool, code, msg);
      }
      throw new CallFailed(tool, "INTERNAL", "response envelope missing 'ok' field");
    },
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
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
