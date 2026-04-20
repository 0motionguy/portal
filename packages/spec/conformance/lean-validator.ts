// Lean, dependency-free manifest validator for shipping inside the visitor
// SDK. Must stay byte-for-byte decision-equivalent with the ajv validator in
// runner.ts on every vector in vectors.json — the spec self-test enforces
// this. When the schema changes, both validators change together.
//
// Why a second validator: bundling ajv + ajv-formats + JSON Schema into the
// SDK would cost 30+ kB gzipped and pull node:fs/node:url/node:path into
// browser builds. The SDK only needs yes/no + specific error strings, not a
// full JSON Schema engine.

export interface LeanResult {
  ok: boolean;
  errors: string[];
}

const TOP_KEYS = new Set([
  "portal_version",
  "name",
  "brief",
  "tools",
  "call_endpoint",
  "auth",
  "pricing",
]);

const VALID_AUTH = new Set(["none", "api_key", "erc8004"]);
const VALID_PRICING = new Set(["free", "x402"]);
const VALID_PARAM_TYPES = new Set(["string", "number", "boolean", "object", "array"]);
const VERSION_RE = /^0\.1(\.[0-9]+)?$/;
const TOOL_NAME_RE = /^[a-z][a-z0-9_]*$/;
// call_endpoint must be https://, with a loopback escape hatch for local
// development (http://localhost and http://127.0.0.1 only). Matches the
// "call_endpoint.pattern" constraint in manifest.schema.json.
const URL_RE = /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?(\/|$))/;

export function leanValidate(obj: unknown): LeanResult {
  const errs: string[] = [];
  if (!isObject(obj)) return { ok: false, errors: ["root: must be an object"] };

  // Required top-level fields.
  for (const k of ["portal_version", "name", "brief", "tools", "call_endpoint"]) {
    if (!(k in obj)) errs.push(`root: missing required field '${k}'`);
  }

  // No unknown top-level fields (matches additionalProperties:false in schema).
  for (const k of Object.keys(obj)) {
    if (!TOP_KEYS.has(k)) errs.push(`root: unknown field '${k}'`);
  }

  // portal_version.
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
    if (typeof b !== "string" || b.length < 1 || b.length > 2000) {
      errs.push("brief: must be a string 1..2000 chars");
    }
  }

  if ("call_endpoint" in obj) {
    const e = obj.call_endpoint;
    if (typeof e !== "string" || !URL_RE.test(e)) {
      errs.push("call_endpoint: must be https:// (or http://localhost for local dev)");
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

function validatePricing(p: unknown, errs: string[]): void {
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

function validateTools(t: unknown, errs: string[]): void {
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

function validateTool(tool: unknown, path: string, errs: string[]): void {
  if (!isObject(tool)) {
    errs.push(`${path}: must be an object`);
    return;
  }
  if (!("name" in tool)) {
    errs.push(`${path}: missing 'name'`);
  } else {
    const n = tool.name;
    if (typeof n !== "string" || !TOOL_NAME_RE.test(n) || n.length > 64) {
      errs.push(`${path}.name: must match ^[a-z][a-z0-9_]*$ and be ≤64 chars`);
    }
  }
  const allowedKeys = new Set(["name", "description", "params", "paramsSchema"]);
  for (const k of Object.keys(tool)) {
    if (!allowedKeys.has(k)) errs.push(`${path}: unknown field '${k}'`);
  }
  if ("description" in tool) {
    if (typeof tool.description !== "string" || tool.description.length > 500) {
      errs.push(`${path}.description: must be a string ≤500 chars`);
    }
  }
  if ("params" in tool && "paramsSchema" in tool) {
    errs.push(`${path}: cannot declare both 'params' and 'paramsSchema'`);
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

function validateParams(p: unknown, path: string, errs: string[]): void {
  if (!isObject(p)) {
    errs.push(`${path}: must be an object`);
    return;
  }
  for (const [key, entry] of Object.entries(p)) {
    validateParamEntry(entry, `${path}.${key}`, errs);
  }
}

function validateParamEntry(e: unknown, path: string, errs: string[]): void {
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
    errs.push(`${path}.description: must be a string ≤300 chars`);
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
