import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serve as servePortal, type Manifest } from "@visitportal/provider";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { rateLimit } from "./rate-limit.ts";
import { registry } from "./tools/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, "..", "portal.json");

const staticManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
const portal = servePortal({
  manifest: staticManifest,
  handlers: Object.fromEntries([...registry].map(([name, tool]) => [name, tool.handler])),
});

export function createApp(): Hono {
  const app = new Hono();

  // CORS per spec v0.1.5 Appendix C (normative for browser-resident visitors).
  app.use("/portal", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"], maxAge: 86400 }));
  app.use(
    "/.well-known/portal.json",
    cors({ origin: "*", allowMethods: ["GET", "OPTIONS"], maxAge: 86400 }),
  );
  app.use(
    "/portal/call",
    cors({
      origin: "*",
      allowMethods: ["POST", "OPTIONS"],
      allowHeaders: ["content-type", "accept"],
      maxAge: 86400,
    }),
  );

  // Rate limit /portal/call only — /portal is cache-friendly at the edge.
  app.use("/portal/call", rateLimit());

  app.get("/", (c) => c.redirect("/portal"));

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.get("/portal", (c) => c.json(portal.manifest));

  // Alternate discovery per spec v0.1.5 Appendix E (draft). Providers MAY
  // serve the manifest at /.well-known/portal.json in addition to /portal;
  // if both are served they MUST return byte-identical manifests.
  app.get("/.well-known/portal.json", (c) => c.json(portal.manifest));

  app.post("/portal/call", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { ok: false as const, error: "request body is not valid JSON", code: "INVALID_PARAMS" },
        400,
      );
    }

    const result = await portal.dispatch(body, { request: c.req.raw, signal: c.req.raw.signal });
    const headers = result.headers ?? {};
    for (const name of Object.keys(headers)) {
      const value = headers[name];
      if (value !== undefined) c.header(name, value);
    }
    return c.json(result.body, result.status);
  });

  return app;
}

const entry = process.argv[1];
const isMain = entry ? resolve(fileURLToPath(import.meta.url)) === resolve(entry) : false;

if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: createApp().fetch, port }, (info) => {
    console.log(`trending-demo (Star Screener) listening on http://localhost:${info.port}`);
    console.log("  GET  /portal");
    console.log("  GET  /.well-known/portal.json  (byte-identical alias; spec Appendix E draft)");
    console.log("  POST /portal/call");
  });
}
