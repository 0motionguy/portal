# Portal quickstart - Express

This is the smallest useful Express implementation: one manifest route and one call route.

## Install

```sh
pnpm add express cors
pnpm add -D @types/express @types/cors tsx typescript
```

## `src/server.ts`

```ts
import cors from "cors";
import express from "express";

const app = express();
app.use(express.json({ limit: "1mb" }));

const manifest = {
  portal_version: "0.1",
  name: "Express Portal",
  brief: "A minimal Portal served from Express.",
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

app.get("/portal", cors(), (_req, res) => {
  res.json(manifest);
});

app.options("/portal/call", cors());
app.post("/portal/call", cors(), (req, res) => {
  const body = req.body as { tool?: unknown; params?: unknown };

  if (typeof body.tool !== "string") {
    res.status(400).json(error("'tool' must be a string", "INVALID_PARAMS"));
    return;
  }

  if (body.tool !== "ping") {
    res.status(404).json(error(`tool '${body.tool}' not in manifest`, "NOT_FOUND"));
    return;
  }

  const params = isRecord(body.params) ? body.params : {};
  res.json({ ok: true, result: { pong: true, msg: params.msg ?? null } });
});

function error(message: string, code: string) {
  return { ok: false as const, error: message, code };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

app.listen(Number(process.env.PORT ?? 3000), () => {
  console.log("Portal listening on http://localhost:3000/portal");
});
```

## Verify

```sh
PORT=3000 pnpm exec tsx src/server.ts
curl http://localhost:3000/portal
pnpm conformance http://localhost:3000/portal
```
