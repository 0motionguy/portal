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

export interface ToolContext {
  request?: Request;
  signal?: AbortSignal;
}

export type ToolHandler = (
  params: Record<string, unknown>,
  ctx: ToolContext,
) => unknown | Promise<unknown>;

export interface ToolDefinition extends Tool {
  handler: ToolHandler;
}

export interface ManifestOptions {
  portal_version?: string;
  name: string;
  brief: string;
  tools: readonly (Tool | ToolDefinition)[];
  call_endpoint: string;
  auth?: Manifest["auth"];
  pricing?: Manifest["pricing"];
}

export type HandlerMap = ReadonlyMap<string, ToolHandler> | Record<string, ToolHandler>;

// Base v0.1.8 spec error codes (normative).
export type BaseErrorCode =
  | "NOT_FOUND"
  | "INVALID_PARAMS"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "INTERNAL";

// Portal Extension PE-002 (paid tools) extension code.
// Visitors that don't implement PE-002 will see this code and fail gracefully
// per spec §6 "visitors MUST NOT parse the error string programmatically".
export type ExtensionErrorCode = "PAYMENT_REQUIRED";

export type ErrorCode = BaseErrorCode | ExtensionErrorCode;

export interface DispatchSuccess {
  ok: true;
  result: unknown;
}

export interface DispatchFailure {
  ok: false;
  error: string;
  code: ErrorCode;
  // PE-002 paid-tools extension field. When code === "PAYMENT_REQUIRED",
  // this carries the x402 challenge body verbatim per the x402 wire spec.
  // Visitors that implement PE-002 read body.x402.accepts to satisfy the
  // payment requirements and retry with X-PAYMENT header.
  x402?: {
    x402Version: number;
    accepts: ReadonlyArray<Record<string, unknown>>;
    resource?: Record<string, unknown>;
  };
}

export interface DispatchResult {
  status: 200 | 400 | 401 | 402 | 404 | 429 | 500;
  headers?: Record<string, string>;
  body: DispatchSuccess | DispatchFailure;
}

export interface PortalProvider {
  readonly manifest: Manifest;
  dispatch(body: unknown, ctx?: ToolContext): Promise<DispatchResult>;
  fetch(request: Request): Promise<Response>;
}

export interface ServeOptionsBase {
  manifestPath?: string;
  alternateDiscovery?: boolean;
  cors?: boolean;
}

export interface ServeFromToolsOptions extends ServeOptionsBase, ManifestOptions {
  tools: readonly ToolDefinition[];
}

export interface ServeFromManifestOptions extends ServeOptionsBase {
  manifest: Manifest;
  handlers: HandlerMap;
}

export type ServeOptions = ServeFromToolsOptions | ServeFromManifestOptions;
