// Portal v0.1.1 conformance runner.
//
// Three modes of use:
//   1. `validateManifest(obj)` — pure function. Given a parsed manifest, returns
//      `{ ok: true }` or `{ ok: false, errors }`. Used by visitor SDKs after
//      fetching GET /portal.
//   2. `validateAgainstVectors(manifest)` — offline full-suite check. Validates
//      a candidate manifest AND runs the 30-vector canonical suite, returning
//      both reports. Adopter-facing: proves the manifest passes and the
//      validator itself is behaving as expected, without any network calls.
//   3. `runSmokeConformance(baseUrl)` — integration smoke test. Fetches
//      GET /portal at `baseUrl`, validates it, then exercises a tool-not-found
//      round-trip against POST /portal/call. Does NOT iterate the full vector
//      suite; for that use `validateAgainstVectors()` locally or the
//      `conformance` CLI subcommand with `--full`.
//
// No dependencies on any visitor SDK — this package is the authority and must
// not pull in @visitportal/visit. `fetch` is the only IO primitive.
//
// Spec: docs/spec-v0.1.1.md · Schema: ../manifest.schema.json

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "..", "manifest.schema.json");
const vectorsPath = resolve(here, "vectors.json");

const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
const vectors = JSON.parse(readFileSync(vectorsPath, "utf8")) as VectorsFile;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate: ValidateFunction = ajv.compile(schema);

export type ValidationErrors = ErrorObject[];

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationErrors };

export function validateManifest(obj: unknown): ValidationResult {
  const ok = validate(obj);
  if (ok) return { ok: true };
  return { ok: false, errors: validate.errors ?? [] };
}

export interface VectorsFile {
  spec_version: string;
  generated: string;
  manifest_valid: Array<{ id: string; note?: string; manifest: unknown }>;
  manifest_invalid: Array<{ id: string; violates: string; manifest: unknown }>;
  call_pair: Array<{
    id: string;
    kind: "success" | "error";
    note?: string;
    request: { tool: string; params: Record<string, unknown> };
    response:
      | { ok: true; result: unknown }
      | { ok: false; error: string; code: string };
  }>;
}

export function getVectors(): VectorsFile {
  return vectors;
}

// Runs every manifest vector against the schema and returns a structured
// report. Used by the spec self-test and by scripts/conformance.ts when no URL
// is provided (validation-only mode).
export interface VectorReport {
  totals: { pass: number; fail: number };
  failures: Array<{
    id: string;
    expected: "valid" | "invalid" | "call-success" | "call-error";
    detail: string;
  }>;
}

export const ERROR_CODES = [
  "NOT_FOUND",
  "INVALID_PARAMS",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export function runVectorSuite(): VectorReport {
  const failures: VectorReport["failures"] = [];
  let pass = 0;

  for (const v of vectors.manifest_valid) {
    const r = validateManifest(v.manifest);
    if (r.ok) {
      pass++;
    } else {
      failures.push({
        id: v.id,
        expected: "valid",
        detail: r.errors.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; "),
      });
    }
  }

  for (const v of vectors.manifest_invalid) {
    const r = validateManifest(v.manifest);
    if (!r.ok) {
      pass++;
    } else {
      failures.push({
        id: v.id,
        expected: "invalid",
        detail: `schema accepted a manifest that violates: ${v.violates}`,
      });
    }
  }

  for (const v of vectors.call_pair) {
    const detail = checkCallPair(v);
    if (detail === null) {
      pass++;
    } else {
      failures.push({
        id: v.id,
        expected: v.kind === "success" ? "call-success" : "call-error",
        detail,
      });
    }
  }

  return {
    totals: { pass, fail: failures.length },
    failures,
  };
}

function checkCallPair(v: VectorsFile["call_pair"][number]): string | null {
  // Request shape: { tool: string, params: object }.
  if (typeof v.request.tool !== "string" || v.request.tool.length === 0) {
    return "request.tool must be a non-empty string";
  }
  if (!isObject(v.request.params)) {
    return "request.params must be an object";
  }

  // Response shape depends on kind.
  const res = v.response as Record<string, unknown>;
  if (v.kind === "success") {
    if (res.ok !== true) return "success response must have ok:true";
    if (!("result" in res)) return "success response must include 'result'";
    if ("error" in res || "code" in res) {
      return "success response must not include 'error' or 'code'";
    }
    return null;
  }
  // error case
  if (res.ok !== false) return "error response must have ok:false";
  if (typeof res.error !== "string" || res.error.length === 0) {
    return "error response must have a non-empty 'error' string";
  }
  if (typeof res.code !== "string") return "error response must have 'code' string";
  if (!(ERROR_CODES as readonly string[]).includes(res.code)) {
    return `code '${res.code}' is not in the v0.1 enum (${ERROR_CODES.join(", ")})`;
  }
  return null;
}

// Offline full-suite report — validates a candidate manifest AND runs the
// 30-vector canonical suite. Adopter-facing: proves the candidate manifest
// passes and that the validator is behaving correctly. No network IO.

export interface OfflineReport {
  manifest: ValidationResult;
  vectorSuite: VectorReport;
}

export function validateAgainstVectors(manifest: unknown): OfflineReport {
  return {
    manifest: validateManifest(manifest),
    vectorSuite: runVectorSuite(),
  };
}

// Integration smoke — fetches a live Portal and tests its manifest + a
// NOT_FOUND round-trip. Keep narrow: this is the smoke test, not the full
// vector suite. Full vectors are static fixtures; live conformance just checks
// that the provider's manifest validates and that a bogus tool call produces a
// well-formed error envelope.

export interface LiveReport {
  target: string;
  manifestOk: boolean;
  manifestErrors: ValidationErrors;
  notFoundOk: boolean;
  notFoundDetail: string;
}

export async function runSmokeConformance(
  baseUrl: string,
  opts: { timeoutMs?: number } = {},
): Promise<LiveReport> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const manifestUrl = baseUrl.replace(/\/+$/, "");

  // 1) GET manifest.
  let manifest: unknown;
  try {
    manifest = await getJson(manifestUrl, timeoutMs);
  } catch (err) {
    return {
      target: baseUrl,
      manifestOk: false,
      manifestErrors: [
        {
          instancePath: "",
          schemaPath: "",
          keyword: "fetch",
          params: {},
          message: `failed to GET ${manifestUrl}: ${errMsg(err)}`,
        } as ErrorObject,
      ],
      notFoundOk: false,
      notFoundDetail: "skipped — manifest fetch failed",
    };
  }

  const v = validateManifest(manifest);
  if (!v.ok) {
    return {
      target: baseUrl,
      manifestOk: false,
      manifestErrors: v.errors,
      notFoundOk: false,
      notFoundDetail: "skipped — manifest invalid",
    };
  }

  const callEndpoint = (manifest as { call_endpoint: string }).call_endpoint;

  // 2) NOT_FOUND round-trip. A call to a tool that cannot exist must produce
  //    { ok: false, code: "NOT_FOUND" }.
  let notFoundOk = false;
  let notFoundDetail = "";
  try {
    const body = await postJson(
      callEndpoint,
      { tool: "__visitportal_conformance_probe__", params: {} },
      timeoutMs,
    );
    if (
      isObject(body) &&
      body.ok === false &&
      typeof body.error === "string" &&
      body.code === "NOT_FOUND"
    ) {
      notFoundOk = true;
      notFoundDetail = "round-trip produced NOT_FOUND envelope";
    } else {
      notFoundDetail = `expected {ok:false, code:'NOT_FOUND'}; got ${JSON.stringify(body).slice(
        0,
        200,
      )}`;
    }
  } catch (err) {
    notFoundDetail = `POST ${callEndpoint} failed: ${errMsg(err)}`;
  }

  return {
    target: baseUrl,
    manifestOk: true,
    manifestErrors: [],
    notFoundOk,
    notFoundDetail,
  };
}

// --- helpers ---------------------------------------------------------------

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    // Providers SHOULD return 200 with an error envelope for handled errors.
    // But we also accept 4xx and try to parse a body.
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
