import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { validateManifest } from "@visitportal/spec/runner";
import { registry } from "./tools/index.ts";
import { NotFoundError, ParamError } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, "..", "portal.json");

interface ManifestFile {
  portal_version: string;
  name: string;
  brief: string;
  tools: unknown[];
  call_endpoint: string;
  auth?: string;
  pricing?: { model: string; rate?: string };
}

const staticManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestFile;

function publicUrl(): string {
  const raw = process.env.PORTAL_PUBLIC_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

function buildManifest(): ManifestFile {
  return { ...staticManifest, call_endpoint: `${publicUrl()}/portal/call` };
}

type ErrorCode = "NOT_FOUND" | "INVALID_PARAMS" | "UNAUTHORIZED" | "RATE_LIMITED" | "INTERNAL";

function errorEnvelope(message: string, code: ErrorCode) {
  return { ok: false as const, error: message, code };
}

export function createApp(): Hono {
  const app = new Hono();

  // TODO: add CORS middleware — see spec-v0.1.1.md Appendix C (Phase 6 web work).

  app.get("/", (c) => c.redirect("/portal"));

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.get("/portal", (c) => {
    const manifest = buildManifest();
    const result = validateManifest(manifest);
    if (!result.ok) {
      const detail = result.errors
        .map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`)
        .join("; ");
      return c.text(`manifest failed internal validation: ${detail}`, 500);
    }
    return c.json(manifest);
  });

  app.post("/portal/call", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorEnvelope("request body is not valid JSON", "INVALID_PARAMS"));
    }

    if (!isRecord(body)) {
      return c.json(errorEnvelope("request body must be a JSON object", "INVALID_PARAMS"));
    }

    const toolName = body.tool;
    if (typeof toolName !== "string" || toolName.length === 0) {
      return c.json(errorEnvelope("'tool' must be a non-empty string", "INVALID_PARAMS"));
    }

    const rawParams = body.params ?? {};
    if (!isRecord(rawParams)) {
      return c.json(errorEnvelope("'params' must be an object", "INVALID_PARAMS"));
    }

    const tool = registry.get(toolName);
    if (!tool) {
      return c.json(errorEnvelope(`tool '${toolName}' not in manifest`, "NOT_FOUND"));
    }

    try {
      const result = await tool.handler(rawParams);
      return c.json({ ok: true as const, result });
    } catch (err) {
      if (err instanceof ParamError) {
        return c.json(errorEnvelope(err.message, "INVALID_PARAMS"));
      }
      if (err instanceof NotFoundError) {
        return c.json(errorEnvelope(err.message, "NOT_FOUND"));
      }
      const msg = err instanceof Error ? err.message : String(err);
      return c.json(errorEnvelope(msg, "INTERNAL"));
    }
  });

  return app;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

const entry = process.argv[1];
const isMain = entry ? resolve(fileURLToPath(import.meta.url)) === resolve(entry) : false;

if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: createApp().fetch, port }, (info) => {
    console.log(`star-screener listening on http://localhost:${info.port}`);
    console.log(`  GET  /portal`);
    console.log(`  POST /portal/call`);
  });
}
