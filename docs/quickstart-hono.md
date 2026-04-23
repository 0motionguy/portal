# Portal quickstart - Hono

This is the same shape as the reference demo, reduced to one file.

## Install

```sh
pnpm add hono @hono/node-server
pnpm add -D tsx typescript
```

## `src/server.ts`

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

const manifest = {
  portal_version: "0.1",
  name: "Hono Portal",
  brief: "A minimal Portal served from Hono.",
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

app.use("/portal", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"] }));
app.use(
  "/portal/call",
  cors({
    origin: "*",
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["content-type", "accept"],
  }),
);

app.get("/portal", (c) => c.json(manifest));

app.post("/portal/call", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(error("request body is not valid JSON", "INVALID_PARAMS"), 400);
  }

  if (!isRecord(body) || typeof body.tool !== "string") {
    return c.json(error("'tool' must be a string", "INVALID_PARAMS"), 400);
  }

  if (body.tool !== "ping") {
    return c.json(error(`tool '${body.tool}' not in manifest`, "NOT_FOUND"), 404);
  }

  const params = isRecord(body.params) ? body.params : {};
  return c.json({ ok: true, result: { pong: true, msg: params.msg ?? null } });
});

function error(message: string, code: string) {
  return { ok: false as const, error: message, code };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });
```

## Verify

```sh
PORT=3000 pnpm exec tsx src/server.ts
curl http://localhost:3000/portal
pnpm conformance http://localhost:3000/portal
```
