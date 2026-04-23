import { InvalidParamsError, ManifestBuildError, normalizeThrownError } from "./errors.ts";
import { manifest as buildManifest, ensureManifest } from "./manifest.ts";
import type {
  DispatchResult,
  HandlerMap,
  Manifest,
  PortalProvider,
  ServeFromManifestOptions,
  ServeOptions,
  ToolContext,
  ToolDefinition,
  ToolHandler,
} from "./types.ts";

const MANIFEST_PATH = "/portal";
const ALT_DISCOVERY_PATH = "/.well-known/portal.json";
const MAX_AGE = "86400";

export function serve(options: ServeOptions): PortalProvider {
  const manifest = isServeFromManifest(options)
    ? ensureManifest(options.manifest)
    : buildManifest({
        name: options.name,
        brief: options.brief,
        tools: options.tools,
        call_endpoint: options.call_endpoint,
        ...(options.portal_version !== undefined ? { portal_version: options.portal_version } : {}),
        ...(options.auth !== undefined ? { auth: options.auth } : {}),
        ...(options.pricing !== undefined ? { pricing: options.pricing } : {}),
      });

  const handlers = isServeFromManifest(options)
    ? normalizeHandlers(options.handlers)
    : handlersFromTools(options.tools);

  assertHandlerCoverage(manifest, handlers);

  const manifestPath = options.manifestPath ?? MANIFEST_PATH;
  const alternateDiscovery = options.alternateDiscovery !== false;
  const callPath = deriveCallPath(manifest.call_endpoint);
  const cors = options.cors !== false;
  const manifestText = JSON.stringify(manifest);

  return {
    manifest,
    async dispatch(body: unknown, ctx: ToolContext = {}): Promise<DispatchResult> {
      let request: { tool: string; params: Record<string, unknown> };
      try {
        request = expectCallRequest(body);
      } catch (err) {
        return normalizeThrownError(err);
      }
      const handler = handlers.get(request.tool);
      if (!handler) {
        return {
          status: 404,
          body: {
            ok: false,
            error: `tool '${request.tool}' not in manifest`,
            code: "NOT_FOUND",
          },
        };
      }

      try {
        const result = await handler(request.params, ctx);
        return { status: 200, body: { ok: true, result } };
      } catch (err) {
        return normalizeThrownError(err);
      }
    },
    async fetch(request: Request): Promise<Response> {
      const { pathname } = new URL(request.url);

      if (pathname === manifestPath || (alternateDiscovery && pathname === ALT_DISCOVERY_PATH)) {
        if (request.method === "OPTIONS") {
          return new Response(
            null,
            responseInit(204, cors ? manifestOptionsCorsHeaders() : undefined),
          );
        }
        if (request.method !== "GET") {
          return methodNotAllowed("GET, OPTIONS");
        }
        return new Response(
          manifestText,
          responseInit(
            200,
            mergeHeaders(
              { "content-type": "application/json; charset=utf-8" },
              cors ? manifestCorsHeaders() : undefined,
            ),
          ),
        );
      }

      if (pathname === callPath) {
        if (request.method === "OPTIONS") {
          return new Response(
            null,
            responseInit(204, cors ? callOptionsCorsHeaders(request, manifest) : undefined),
          );
        }
        if (request.method !== "POST") {
          return methodNotAllowed("POST, OPTIONS");
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse(
            {
              ok: false,
              error: "request body is not valid JSON",
              code: "INVALID_PARAMS",
            },
            400,
            cors ? callCorsHeaders(request, manifest) : undefined,
          );
        }

        const result = await this.dispatch(body, {
          request,
          signal: request.signal,
        });
        return jsonResponse(
          result.body,
          result.status,
          mergeHeaders(result.headers, cors ? callCorsHeaders(request, manifest) : undefined),
        );
      }

      return new Response("not found", { status: 404 });
    },
  };
}

function expectCallRequest(body: unknown): { tool: string; params: Record<string, unknown> } {
  if (!isRecord(body)) {
    throw new InvalidParamsError("request body must be a JSON object");
  }

  if (typeof body.tool !== "string" || body.tool.length === 0) {
    throw new InvalidParamsError("'tool' must be a non-empty string");
  }

  const params = body.params ?? {};
  if (!isRecord(params)) {
    throw new InvalidParamsError("'params' must be an object");
  }

  return { tool: body.tool, params };
}

function normalizeHandlers(handlers: HandlerMap): ReadonlyMap<string, ToolHandler> {
  return handlers instanceof Map ? new Map(handlers) : new Map(Object.entries(handlers));
}

function handlersFromTools(tools: readonly ToolDefinition[]): ReadonlyMap<string, ToolHandler> {
  return new Map(tools.map((tool) => [tool.name, tool.handler] as const));
}

function assertHandlerCoverage(
  manifest: Manifest,
  handlers: ReadonlyMap<string, ToolHandler>,
): void {
  const names = new Set(manifest.tools.map((tool) => tool.name));
  const missing = manifest.tools
    .filter((tool) => !handlers.has(tool.name))
    .map((tool) => tool.name);
  const extra = [...handlers.keys()].filter((name) => !names.has(name));

  if (missing.length === 0 && extra.length === 0) return;

  const errors = [
    ...missing.map((name) => `missing handler for manifest tool '${name}'`),
    ...extra.map((name) => `handler provided for unknown tool '${name}'`),
  ];
  throw new ManifestBuildError(errors);
}

function deriveCallPath(callEndpoint: string): string {
  if (callEndpoint.startsWith("/")) return callEndpoint;
  return new URL(callEndpoint).pathname;
}

function methodNotAllowed(allow: string): Response {
  return new Response("method not allowed", {
    status: 405,
    headers: { Allow: allow },
  });
}

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(
    JSON.stringify(body),
    responseInit(
      status,
      mergeHeaders({ "content-type": "application/json; charset=utf-8" }, headers),
    ),
  );
}

function manifestCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
  };
}

function manifestOptionsCorsHeaders(): Record<string, string> {
  return {
    ...manifestCorsHeaders(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": MAX_AGE,
  };
}

function callCorsHeaders(request: Request, manifest: Manifest): Record<string, string> {
  const origin = request.headers.get("origin");
  const requiresEcho =
    manifest.pricing?.model === "x402" ||
    manifest.auth === "api_key" ||
    manifest.auth === "erc8004";

  if (!requiresEcho) {
    return { "Access-Control-Allow-Origin": "*" };
  }

  if (!origin) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function callOptionsCorsHeaders(request: Request, manifest: Manifest): Record<string, string> {
  return {
    ...callCorsHeaders(request, manifest),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Access-Control-Max-Age": MAX_AGE,
  };
}

function mergeHeaders(
  a?: Record<string, string>,
  b?: Record<string, string>,
): Record<string, string> | undefined {
  if (!a && !b) return undefined;
  return { ...(a ?? {}), ...(b ?? {}) };
}

function responseInit(status: number, headers?: Record<string, string>): ResponseInit {
  if (headers === undefined) return { status };
  return { status, headers };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isServeFromManifest(options: ServeOptions): options is ServeFromManifestOptions {
  return "manifest" in options;
}
