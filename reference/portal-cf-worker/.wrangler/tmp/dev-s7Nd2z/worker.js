var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-QI0YHG/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// ../../packages/provider/ts/dist/errors.js
var STATUS_BY_CODE = {
  NOT_FOUND: 404,
  INVALID_PARAMS: 400,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  PAYMENT_REQUIRED: 402
  // PE-002 extension
};
var ManifestBuildError = class extends Error {
  static {
    __name(this, "ManifestBuildError");
  }
  errors;
  constructor(errors) {
    super(`manifest invalid: ${errors.join("; ")}`);
    this.name = "ManifestBuildError";
    this.errors = errors;
  }
};
var ProviderCallError = class extends Error {
  static {
    __name(this, "ProviderCallError");
  }
  status;
  headers;
  // PE-002 extension hook: subclasses can attach extra body fields (e.g. the
  // x402 challenge envelope on PaymentRequiredError). Keys are merged into
  // the response body alongside { ok, error, code }.
  bodyExtras;
  constructor(message, status, headers, bodyExtras) {
    super(message);
    this.status = status;
    if (headers !== void 0)
      this.headers = headers;
    if (bodyExtras !== void 0)
      this.bodyExtras = bodyExtras;
  }
};
var InvalidParamsError = class extends ProviderCallError {
  static {
    __name(this, "InvalidParamsError");
  }
  code = "INVALID_PARAMS";
  constructor(message) {
    super(message, STATUS_BY_CODE.INVALID_PARAMS);
    this.name = "InvalidParamsError";
  }
};
var PaymentRequiredError = class extends ProviderCallError {
  static {
    __name(this, "PaymentRequiredError");
  }
  code = "PAYMENT_REQUIRED";
  constructor(challenge, message = "payment required") {
    const body = {
      x402: {
        x402Version: challenge.x402Version ?? 1,
        accepts: challenge.accepts,
        ...challenge.resource ? { resource: challenge.resource } : {}
      }
    };
    super(message, STATUS_BY_CODE.PAYMENT_REQUIRED, void 0, body);
    this.name = "PaymentRequiredError";
  }
};
function invalidParams(message) {
  return new InvalidParamsError(message);
}
__name(invalidParams, "invalidParams");
function normalizeThrownError(err) {
  if (err instanceof ProviderCallError) {
    const body = {
      ok: false,
      error: err.message,
      code: err.code,
      ...err.bodyExtras ?? {}
    };
    return toDispatchResult(err.status, body, err.headers);
  }
  if (isErrorWithKnownCode(err)) {
    return toDispatchResult(STATUS_BY_CODE[err.code], {
      ok: false,
      error: typeof err.message === "string" ? err.message : `provider error (${err.code})`,
      code: err.code
    }, getHeaders(err));
  }
  return toDispatchResult(STATUS_BY_CODE.INTERNAL, {
    ok: false,
    error: describe(err),
    code: "INTERNAL"
  });
}
__name(normalizeThrownError, "normalizeThrownError");
function isErrorWithKnownCode(err) {
  return typeof err === "object" && err !== null && "code" in err && typeof err.code === "string" && isErrorCode(err.code);
}
__name(isErrorWithKnownCode, "isErrorWithKnownCode");
function getHeaders(err) {
  if (!isStringRecord(err.headers))
    return void 0;
  return err.headers;
}
__name(getHeaders, "getHeaders");
function isStringRecord(x) {
  if (typeof x !== "object" || x === null || Array.isArray(x))
    return false;
  return Object.values(x).every((v) => typeof v === "string");
}
__name(isStringRecord, "isStringRecord");
function isErrorCode(x) {
  return x in STATUS_BY_CODE;
}
__name(isErrorCode, "isErrorCode");
function describe(err) {
  return err instanceof Error ? err.message : String(err);
}
__name(describe, "describe");
function toDispatchResult(status, body, headers) {
  if (headers === void 0) {
    return { status, body };
  }
  return { status, body, headers };
}
__name(toDispatchResult, "toDispatchResult");

// ../../packages/spec/dist/conformance/lean-validator.js
var TOP_KEYS = /* @__PURE__ */ new Set([
  "portal_version",
  "name",
  "brief",
  "tools",
  "call_endpoint",
  "auth",
  "pricing"
]);
var VALID_AUTH = /* @__PURE__ */ new Set(["none", "api_key", "erc8004"]);
var VALID_PRICING = /* @__PURE__ */ new Set(["free", "x402"]);
var VALID_PARAM_TYPES = /* @__PURE__ */ new Set(["string", "number", "boolean", "object", "array"]);
var VERSION_RE = /^0\.1(\.[0-9]+)?$/;
var TOOL_NAME_RE = /^[a-z][a-z0-9_]*$/;
var URL_RE = /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?(\/|$)|\/(?!\/))/;
function leanValidate(obj) {
  const errs = [];
  if (!isObject(obj))
    return { ok: false, errors: ["root: must be an object"] };
  for (const k of ["portal_version", "name", "brief", "tools", "call_endpoint"]) {
    if (!(k in obj))
      errs.push(`root: missing required field '${k}'`);
  }
  for (const k of Object.keys(obj)) {
    if (!TOP_KEYS.has(k))
      errs.push(`root: unknown field '${k}'`);
  }
  if ("portal_version" in obj) {
    const v = obj.portal_version;
    if (typeof v !== "string" || !VERSION_RE.test(v)) {
      errs.push("portal_version: must match ^0\\.1(\\.[0-9]+)?$");
    }
  }
  if ("name" in obj) {
    const n = obj.name;
    if (typeof n !== "string" || n.length < 1 || n.length > 120) {
      errs.push("name: must be a string 1..120 chars");
    }
  }
  if ("brief" in obj) {
    const b = obj.brief;
    if (typeof b !== "string" || b.length < 1 || b.length > 2e3) {
      errs.push("brief: must be a string 1..2000 chars");
    }
  }
  if ("call_endpoint" in obj) {
    const e = obj.call_endpoint;
    if (typeof e !== "string" || !URL_RE.test(e)) {
      errs.push("call_endpoint: must be root-relative, https://, or http://localhost for local dev");
    }
  }
  if ("auth" in obj) {
    if (typeof obj.auth !== "string" || !VALID_AUTH.has(obj.auth)) {
      errs.push(`auth: must be one of {${[...VALID_AUTH].join(", ")}}`);
    }
  }
  if ("pricing" in obj) {
    validatePricing(obj.pricing, errs);
  }
  if ("tools" in obj) {
    validateTools(obj.tools, errs);
  }
  return { ok: errs.length === 0, errors: errs };
}
__name(leanValidate, "leanValidate");
function validatePricing(p, errs) {
  if (!isObject(p)) {
    errs.push("pricing: must be an object");
    return;
  }
  for (const k of Object.keys(p)) {
    if (k !== "model" && k !== "rate") {
      errs.push(`pricing: unknown field '${k}'`);
    }
  }
  if (!("model" in p)) {
    errs.push(`pricing: missing 'model'`);
    return;
  }
  const m = p.model;
  if (typeof m !== "string" || !VALID_PRICING.has(m)) {
    errs.push(`pricing.model: must be one of {${[...VALID_PRICING].join(", ")}}`);
    return;
  }
  if (m !== "free" && !("rate" in p)) {
    errs.push(`pricing.rate: required when model='${m}'`);
  }
  if ("rate" in p && typeof p.rate !== "string") {
    errs.push("pricing.rate: must be a string");
  }
}
__name(validatePricing, "validatePricing");
function validateTools(t, errs) {
  if (!Array.isArray(t)) {
    errs.push("tools: must be an array");
    return;
  }
  if (t.length < 1) {
    errs.push("tools: must contain at least 1 item");
    return;
  }
  for (let i = 0; i < t.length; i++) {
    validateTool(t[i], `tools[${i}]`, errs);
  }
}
__name(validateTools, "validateTools");
function validateTool(tool, path, errs) {
  if (!isObject(tool)) {
    errs.push(`${path}: must be an object`);
    return;
  }
  if (!("name" in tool)) {
    errs.push(`${path}: missing 'name'`);
  } else {
    const n = tool.name;
    if (typeof n !== "string" || !TOOL_NAME_RE.test(n) || n.length > 64) {
      errs.push(`${path}.name: must match ^[a-z][a-z0-9_]*$ and be \u226464 chars`);
    }
  }
  const allowedKeys = /* @__PURE__ */ new Set(["name", "description", "params", "paramsSchema"]);
  for (const k of Object.keys(tool)) {
    if (!allowedKeys.has(k))
      errs.push(`${path}: unknown field '${k}'`);
  }
  if ("description" in tool) {
    if (typeof tool.description !== "string" || tool.description.length > 500) {
      errs.push(`${path}.description: must be a string \u2264500 chars`);
    }
  }
  if ("params" in tool) {
    validateParams(tool.params, `${path}.params`, errs);
  }
  if ("paramsSchema" in tool) {
    if (!isObject(tool.paramsSchema)) {
      errs.push(`${path}.paramsSchema: must be an object`);
    }
  }
}
__name(validateTool, "validateTool");
function validateParams(p, path, errs) {
  if (!isObject(p)) {
    errs.push(`${path}: must be an object`);
    return;
  }
  for (const [key, entry] of Object.entries(p)) {
    validateParamEntry(entry, `${path}.${key}`, errs);
  }
}
__name(validateParams, "validateParams");
function validateParamEntry(e, path, errs) {
  if (!isObject(e)) {
    errs.push(`${path}: must be an object`);
    return;
  }
  if (!("type" in e)) {
    errs.push(`${path}: missing 'type'`);
  } else if (typeof e.type !== "string" || !VALID_PARAM_TYPES.has(e.type)) {
    errs.push(`${path}.type: must be one of {${[...VALID_PARAM_TYPES].join(", ")}}`);
  }
  for (const k of Object.keys(e)) {
    if (k !== "type" && k !== "required" && k !== "description") {
      errs.push(`${path}: unknown field '${k}'`);
    }
  }
  if ("required" in e && typeof e.required !== "boolean") {
    errs.push(`${path}.required: must be boolean`);
  }
  if ("description" in e && (typeof e.description !== "string" || e.description.length > 300)) {
    errs.push(`${path}.description: must be a string \u2264300 chars`);
  }
}
__name(validateParamEntry, "validateParamEntry");
function isObject(x) {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
__name(isObject, "isObject");

// ../../packages/provider/ts/dist/manifest.js
function manifest(options) {
  const built = {
    portal_version: options.portal_version ?? "0.1",
    name: options.name,
    brief: options.brief,
    tools: options.tools.map(stripHandler),
    call_endpoint: options.call_endpoint,
    auth: options.auth ?? "none",
    pricing: options.pricing ?? { model: "free" }
  };
  return ensureManifest(built);
}
__name(manifest, "manifest");
function ensureManifest(input) {
  const duplicateNames = findDuplicateToolNames(input.tools);
  if (duplicateNames.length > 0) {
    throw new ManifestBuildError(duplicateNames.map((name) => `duplicate tool name: '${name}'`));
  }
  const result = leanValidate(input);
  if (!result.ok) {
    throw new ManifestBuildError(result.errors);
  }
  return input;
}
__name(ensureManifest, "ensureManifest");
function stripHandler(tool) {
  const out = { name: tool.name };
  if (tool.description !== void 0)
    out.description = tool.description;
  if (tool.params !== void 0)
    out.params = tool.params;
  if (tool.paramsSchema !== void 0)
    out.paramsSchema = tool.paramsSchema;
  return out;
}
__name(stripHandler, "stripHandler");
function findDuplicateToolNames(tools) {
  const seen = /* @__PURE__ */ new Set();
  const duplicates = /* @__PURE__ */ new Set();
  for (const tool of tools) {
    if (seen.has(tool.name))
      duplicates.add(tool.name);
    seen.add(tool.name);
  }
  return [...duplicates];
}
__name(findDuplicateToolNames, "findDuplicateToolNames");

// ../../packages/provider/ts/dist/serve.js
var MANIFEST_PATH = "/portal";
var ALT_DISCOVERY_PATH = "/.well-known/portal.json";
var MAX_AGE = "86400";
function serve(options) {
  const manifest2 = isServeFromManifest(options) ? ensureManifest(options.manifest) : manifest({
    name: options.name,
    brief: options.brief,
    tools: options.tools,
    call_endpoint: options.call_endpoint,
    ...options.portal_version !== void 0 ? { portal_version: options.portal_version } : {},
    ...options.auth !== void 0 ? { auth: options.auth } : {},
    ...options.pricing !== void 0 ? { pricing: options.pricing } : {}
  });
  const handlers = isServeFromManifest(options) ? normalizeHandlers(options.handlers) : handlersFromTools(options.tools);
  assertHandlerCoverage(manifest2, handlers);
  const manifestPath = options.manifestPath ?? MANIFEST_PATH;
  const alternateDiscovery = options.alternateDiscovery !== false;
  const callPath = deriveCallPath(manifest2.call_endpoint);
  const cors = options.cors !== false;
  const manifestText = JSON.stringify(manifest2);
  return {
    manifest: manifest2,
    async dispatch(body, ctx = {}) {
      let request;
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
            code: "NOT_FOUND"
          }
        };
      }
      try {
        const result = await handler(request.params, ctx);
        return { status: 200, body: { ok: true, result } };
      } catch (err) {
        return normalizeThrownError(err);
      }
    },
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === manifestPath || alternateDiscovery && pathname === ALT_DISCOVERY_PATH) {
        if (request.method === "OPTIONS") {
          return new Response(null, responseInit(204, cors ? manifestOptionsCorsHeaders() : void 0));
        }
        if (request.method !== "GET") {
          return methodNotAllowed("GET, OPTIONS");
        }
        return new Response(manifestText, responseInit(200, mergeHeaders({ "content-type": "application/json; charset=utf-8" }, cors ? manifestCorsHeaders() : void 0)));
      }
      if (pathname === callPath) {
        if (request.method === "OPTIONS") {
          return new Response(null, responseInit(204, cors ? callOptionsCorsHeaders(request, manifest2) : void 0));
        }
        if (request.method !== "POST") {
          return methodNotAllowed("POST, OPTIONS");
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({
            ok: false,
            error: "request body is not valid JSON",
            code: "INVALID_PARAMS"
          }, 400, cors ? callCorsHeaders(request, manifest2) : void 0);
        }
        const result = await this.dispatch(body, {
          request,
          signal: request.signal
        });
        return jsonResponse(result.body, result.status, mergeHeaders(result.headers, cors ? callCorsHeaders(request, manifest2) : void 0));
      }
      return new Response("not found", { status: 404 });
    }
  };
}
__name(serve, "serve");
function expectCallRequest(body) {
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
__name(expectCallRequest, "expectCallRequest");
function normalizeHandlers(handlers) {
  return handlers instanceof Map ? new Map(handlers) : new Map(Object.entries(handlers));
}
__name(normalizeHandlers, "normalizeHandlers");
function handlersFromTools(tools) {
  return new Map(tools.map((tool) => [tool.name, tool.handler]));
}
__name(handlersFromTools, "handlersFromTools");
function assertHandlerCoverage(manifest2, handlers) {
  const names = new Set(manifest2.tools.map((tool) => tool.name));
  const missing = manifest2.tools.filter((tool) => !handlers.has(tool.name)).map((tool) => tool.name);
  const extra = [...handlers.keys()].filter((name) => !names.has(name));
  if (missing.length === 0 && extra.length === 0)
    return;
  const errors = [
    ...missing.map((name) => `missing handler for manifest tool '${name}'`),
    ...extra.map((name) => `handler provided for unknown tool '${name}'`)
  ];
  throw new ManifestBuildError(errors);
}
__name(assertHandlerCoverage, "assertHandlerCoverage");
function deriveCallPath(callEndpoint) {
  if (callEndpoint.startsWith("/"))
    return callEndpoint;
  return new URL(callEndpoint).pathname;
}
__name(deriveCallPath, "deriveCallPath");
function methodNotAllowed(allow) {
  return new Response("method not allowed", {
    status: 405,
    headers: { Allow: allow }
  });
}
__name(methodNotAllowed, "methodNotAllowed");
function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), responseInit(status, mergeHeaders({ "content-type": "application/json; charset=utf-8" }, headers)));
}
__name(jsonResponse, "jsonResponse");
function manifestCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*"
  };
}
__name(manifestCorsHeaders, "manifestCorsHeaders");
function manifestOptionsCorsHeaders() {
  return {
    ...manifestCorsHeaders(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": MAX_AGE
  };
}
__name(manifestOptionsCorsHeaders, "manifestOptionsCorsHeaders");
function callCorsHeaders(request, manifest2) {
  const origin = request.headers.get("origin");
  const requiresEcho = manifest2.pricing?.model === "x402" || manifest2.auth === "api_key" || manifest2.auth === "erc8004";
  if (!requiresEcho) {
    return { "Access-Control-Allow-Origin": "*" };
  }
  if (!origin)
    return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin"
  };
}
__name(callCorsHeaders, "callCorsHeaders");
function callOptionsCorsHeaders(request, manifest2) {
  return {
    ...callCorsHeaders(request, manifest2),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Access-Control-Max-Age": MAX_AGE
  };
}
__name(callOptionsCorsHeaders, "callOptionsCorsHeaders");
function mergeHeaders(a, b) {
  if (!a && !b)
    return void 0;
  return { ...a ?? {}, ...b ?? {} };
}
__name(mergeHeaders, "mergeHeaders");
function responseInit(status, headers) {
  if (headers === void 0)
    return { status };
  return { status, headers };
}
__name(responseInit, "responseInit");
function isRecord(x) {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
__name(isRecord, "isRecord");
function isServeFromManifest(options) {
  return "manifest" in options;
}
__name(isServeFromManifest, "isServeFromManifest");

// ../../packages/x402-adapter/dist/index.js
var X_PAYMENT_HEADER = "x-payment";
function withPayment(handler, opts) {
  return async (params, ctx) => {
    const xPayment = ctx.request?.headers.get(X_PAYMENT_HEADER) ?? null;
    if (!xPayment) {
      throw new PaymentRequiredError(opts.resource ? { accepts: [opts.price], resource: opts.resource } : { accepts: [opts.price] }, "payment required");
    }
    let payload;
    try {
      payload = JSON.parse(decodeBase64(xPayment));
    } catch {
      throw new PaymentRequiredError({ accepts: [opts.price] }, "X-Payment header is not valid base64-encoded JSON");
    }
    let verification;
    try {
      verification = await opts.facilitator.verify(payload, opts.price);
    } catch (err) {
      throw new PaymentRequiredError({ accepts: [opts.price] }, `facilitator verify failed: ${describe2(err)}`);
    }
    if (!verification.ok) {
      throw new PaymentRequiredError({ accepts: [opts.price] }, verification.reason ?? "payment verification failed");
    }
    const result = await handler(params, ctx);
    if (opts.settleOnSuccess && opts.facilitator.settle) {
      const settle = await opts.facilitator.settle(payload, opts.price);
      if (!settle.ok) {
        throw new Error(`settle failed: ${settle.reason ?? "unknown"}`);
      }
    }
    return result;
  };
}
__name(withPayment, "withPayment");
function coinbaseFacilitator(url = "https://x402.org/facilitator", apiKey) {
  return httpFacilitator(url, apiKey);
}
__name(coinbaseFacilitator, "coinbaseFacilitator");
function selfHostedFacilitator(url, apiKey) {
  return httpFacilitator(url, apiKey);
}
__name(selfHostedFacilitator, "selfHostedFacilitator");
function httpFacilitator(url, apiKey) {
  const baseUrl = url.replace(/\/+$/, "");
  const authHeaders = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
  return {
    async verify(payload, requirement) {
      const res = await fetch(`${baseUrl}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders },
        body: JSON.stringify({
          x402Version: 1,
          paymentPayload: payload,
          paymentRequirements: requirement
        })
      });
      if (!res.ok)
        return { ok: false, reason: `facilitator returned ${res.status}` };
      const body = await res.json();
      const result = { ok: body.isValid === true };
      if (body.invalidReason)
        result.reason = body.invalidReason;
      return result;
    },
    async settle(payload, requirement) {
      const res = await fetch(`${baseUrl}/settle`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders },
        body: JSON.stringify({
          x402Version: 1,
          paymentPayload: payload,
          paymentRequirements: requirement
        })
      });
      if (!res.ok)
        return { ok: false, reason: `facilitator returned ${res.status}` };
      const body = await res.json();
      const result = { ok: body.success === true };
      if (body.transaction)
        result.tx = body.transaction;
      if (body.errorReason)
        result.reason = body.errorReason;
      return result;
    }
  };
}
__name(httpFacilitator, "httpFacilitator");
function mockFacilitator(opts = {}) {
  const accept = opts.acceptAny ? () => true : opts.acceptIf ?? ((payload) => Boolean(payload));
  return {
    async verify(payload) {
      return accept(payload) ? { ok: true } : { ok: false, reason: "mock rejection" };
    },
    async settle(_payload) {
      return { ok: true, tx: "0xMOCK" };
    }
  };
}
__name(mockFacilitator, "mockFacilitator");
function decodeBase64(s) {
  if (typeof atob === "function")
    return atob(s);
  return globalThis.Buffer.from(s, "base64").toString("utf8");
}
__name(decodeBase64, "decodeBase64");
function describe2(err) {
  return err instanceof Error ? err.message : String(err);
}
__name(describe2, "describe");

// src/worker.ts
var USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
var BURN_ADDRESS = "0x0000000000000000000000000000000000000000";
function pickFacilitator(env) {
  if (env.FACILITATOR_URL) {
    if (env.FACILITATOR_URL.includes("x402.org")) {
      return {
        client: coinbaseFacilitator(env.FACILITATOR_URL, env.FACILITATOR_API_KEY),
        label: `coinbase \xB7 ${env.FACILITATOR_URL}`
      };
    }
    return {
      client: selfHostedFacilitator(env.FACILITATOR_URL, env.FACILITATOR_API_KEY),
      label: `self-hosted \xB7 ${env.FACILITATOR_URL}`
    };
  }
  return { client: mockFacilitator({ acceptAny: true }), label: "mock (test/dev only)" };
}
__name(pickFacilitator, "pickFacilitator");
var providerCache = null;
function getPortal(env) {
  const network = env.PAYMENT_NETWORK ?? "base-sepolia";
  const asset = env.PAYMENT_ASSET ?? USDC_BASE_SEPOLIA;
  const amount = env.PAYMENT_AMOUNT ?? "10000";
  const payTo = env.PAYEE_ADDRESS ?? BURN_ADDRESS;
  const facUrl = env.FACILITATOR_URL ?? "";
  const facKey = env.FACILITATOR_API_KEY ?? "";
  const cacheKey = `${facUrl}|${facKey}|${payTo}|${network}|${asset}|${amount}`;
  if (providerCache && providerCache.key === cacheKey) return providerCache.provider;
  const { client: facilitator, label: facLabel } = pickFacilitator(env);
  const provider = serve({
    name: "Portal CF Worker (reference demo)",
    brief: `Two routes, one Worker. Three tools: whoami (free), reverse (free), premium_data (paid \xB7 PE-002 \xB7 x402-compatible). Facilitator: ${facLabel}.`,
    call_endpoint: "/portal/call",
    pricing: { model: "x402", rate: `${amount} atomic-units of ${asset} per call \xB7 ${network}` },
    tools: [
      {
        name: "whoami",
        description: "Return a fixed self-description. Free.",
        params: {},
        handler: /* @__PURE__ */ __name(() => ({
          runtime: "cloudflare-workers",
          portal_version: "0.1",
          message: "hello from a Worker",
          facilitator_mode: facLabel.startsWith("mock") ? "test" : "production"
        }), "handler")
      },
      {
        name: "reverse",
        description: "Reverse the input string. Free.",
        params: {
          text: { type: "string", required: true, description: "1-2000 chars" }
        },
        handler: /* @__PURE__ */ __name((params) => {
          const text = params.text;
          if (typeof text !== "string" || text.length === 0 || text.length > 2e3) {
            throw invalidParams("'text' must be a 1-2000 char string");
          }
          return { reversed: [...text].reverse().join("") };
        }, "handler")
      },
      {
        name: "premium_data",
        description: "Returns one premium fact. Paid tool \u2014 costs the configured amount per call (PE-002 / x402). With the default mock facilitator any X-Payment payload is accepted (test/dev only); set FACILITATOR_URL + PAYEE_ADDRESS in wrangler.toml [vars] to switch to production signing.",
        params: {},
        handler: withPayment(
          () => ({
            paid: true,
            fact: "Portal is the visitor-side half of the open agent web.",
            ts: Date.now()
          }),
          {
            price: {
              scheme: "exact",
              network,
              asset,
              amount,
              payTo,
              maxTimeoutSeconds: 60,
              description: "premium_data fact"
            },
            facilitator,
            resource: { id: "cf-worker-premium-data-v1" }
          }
        )
      }
    ]
  });
  providerCache = { provider, key: cacheKey };
  return provider;
}
__name(getPortal, "getPortal");
var PORTAL_ROUTES = /* @__PURE__ */ new Set(["/portal", "/.well-known/portal.json", "/portal/call"]);
var worker_default = {
  fetch: /* @__PURE__ */ __name(async (request, env) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/" || pathname === "/healthz") {
      return Response.json({ ok: true, see: "/portal" });
    }
    if (PORTAL_ROUTES.has(pathname)) {
      return getPortal(env ?? {}).fetch(request);
    }
    return Response.json(
      { ok: false, error: `route '${pathname}' not found`, code: "NOT_FOUND" },
      { status: 404 }
    );
  }, "fetch")
};

// ../../node_modules/.pnpm/wrangler@3.114.17_@cloudflare+workers-types@4.20260430.1/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/.pnpm/wrangler@3.114.17_@cloudflare+workers-types@4.20260430.1/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-QI0YHG/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../node_modules/.pnpm/wrangler@3.114.17_@cloudflare+workers-types@4.20260430.1/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-QI0YHG/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
