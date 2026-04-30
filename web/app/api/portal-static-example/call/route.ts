// Static-fallback Portal — companion to docs/quickstart-static-fallback.md.
// The manifest lives at /portal-static-example.json (static asset). This
// Route Handler is the only dynamic piece — it dispatches POST /portal/call.
//
// Hand-rolled with no validator dep (the static JSON IS the contract; the
// visitor validates). 30 LOC of dispatcher logic. The two halves MUST stay
// in sync; route.test.ts asserts the static manifest's tool list matches
// the handlers declared here.

const POSTS: ReadonlyArray<{ slug: string; title: string; published_at: string }> = [
  { slug: "hello-portal", title: "Hello, Portal", published_at: "2026-04-21" },
  { slug: "static-fallback", title: "Why a static fallback Portal", published_at: "2026-04-25" },
  { slug: "two-routes", title: "Two routes, no install", published_at: "2026-04-29" },
];

const HANDLERS: Record<string, (params: Record<string, unknown>) => unknown> = {
  whoami: () => ({
    pattern: "static-fallback",
    hosted_at: "/portal-static-example.json",
    dispatched_by: "/api/portal-static-example/call",
    message: "manifest is a static asset; only this serverless function is dynamic",
  }),
  posts: (params) => {
    const raw = params.limit;
    let limit = 3;
    if (raw !== undefined) {
      if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 3) {
        throw makeError("INVALID_PARAMS", "'limit' must be an integer between 1 and 3");
      }
      limit = raw;
    }
    return POSTS.slice(0, limit);
  },
};

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, {
      ok: false,
      error: "request body is not valid JSON",
      code: "INVALID_PARAMS",
    });
  }
  if (!isRecord(body) || typeof body.tool !== "string" || body.tool.length === 0) {
    return jsonResponse(400, {
      ok: false,
      error: "request must be { tool: string, params: object }",
      code: "INVALID_PARAMS",
    });
  }
  const params = body.params ?? {};
  if (!isRecord(params)) {
    return jsonResponse(400, {
      ok: false,
      error: "'params' must be an object",
      code: "INVALID_PARAMS",
    });
  }

  const handler = HANDLERS[body.tool];
  if (!handler) {
    return jsonResponse(404, {
      ok: false,
      error: `tool '${body.tool}' not in manifest`,
      code: "NOT_FOUND",
    });
  }

  try {
    const result = handler(params);
    return jsonResponse(200, { ok: true, result });
  } catch (err) {
    if (isCodedError(err)) {
      return jsonResponse(STATUS_BY_CODE[err.code], {
        ok: false,
        error: err.message,
        code: err.code,
      });
    }
    return jsonResponse(500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: "INTERNAL",
    });
  }
}

export async function OPTIONS(_req: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

type ErrorCode = "NOT_FOUND" | "INVALID_PARAMS" | "UNAUTHORIZED" | "RATE_LIMITED" | "INTERNAL";

const STATUS_BY_CODE: Record<ErrorCode, 400 | 401 | 404 | 429 | 500> = {
  NOT_FOUND: 404,
  INVALID_PARAMS: 400,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

interface CodedError {
  code: ErrorCode;
  message: string;
}

function makeError(code: ErrorCode, message: string): CodedError & Error {
  const err = new Error(message) as CodedError & Error;
  err.code = code;
  return err;
}

function isCodedError(x: unknown): x is CodedError {
  return (
    typeof x === "object" &&
    x !== null &&
    "code" in x &&
    typeof (x as { code: unknown }).code === "string" &&
    (x as { code: string }).code in STATUS_BY_CODE
  );
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
