# Portal quickstart - Next.js App Router

This pattern uses two route handlers:

- `GET /portal` returns the manifest.
- `POST /portal/call` dispatches `{ tool, params }`.

## Files

```text
app/
  portal/
    route.ts
    call/
      route.ts
```

## `app/portal/route.ts`

```ts
const manifest = {
  portal_version: "0.1",
  name: "Next Portal",
  brief: "A minimal Portal served from Next.js App Router.",
  tools: [
    {
      name: "ping",
      description: "Returns pong and echoes msg.",
      params: {
        msg: { type: "string", description: "Optional message to echo." },
      },
    },
  ],
  call_endpoint: "/portal/call",
  auth: "none",
  pricing: { model: "free" },
};

export function GET(): Response {
  return Response.json(manifest, {
    headers: {
      "cache-control": "public, max-age=60, must-revalidate",
    },
  });
}
```

## `app/portal/call/route.ts`

```ts
type PortalCall = {
  tool?: unknown;
  params?: unknown;
};

export async function POST(req: Request): Promise<Response> {
  let body: PortalCall;
  try {
    body = (await req.json()) as PortalCall;
  } catch {
    return error("request body is not valid JSON", "INVALID_PARAMS", 400);
  }

  if (body.tool !== "ping") {
    return error(`tool '${String(body.tool)}' not in manifest`, "NOT_FOUND", 404);
  }

  const params = isRecord(body.params) ? body.params : {};
  return Response.json({
    ok: true,
    result: { pong: true, msg: params.msg ?? null },
  });
}

function error(message: string, code: string, status: number): Response {
  return Response.json({ ok: false, error: message, code }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

## Verify

```sh
curl http://localhost:3000/portal
curl -X POST http://localhost:3000/portal/call \
  -H 'content-type: application/json' \
  -d '{"tool":"ping","params":{"msg":"hi"}}'
pnpm conformance http://localhost:3000/portal
```
