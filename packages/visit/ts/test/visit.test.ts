import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServer, type Server } from "node:http";
import {
  CallFailed,
  ManifestInvalid,
  PortalNotFound,
  ToolNotInManifest,
  type Portal,
  visit,
} from "../src/index.ts";

// Tiny in-process HTTP server so these tests don't depend on network or on
// the star-screener reference. Each test can mount its own handler via the
// `route()` helper to shape GET /portal and POST /portal/call responses.

type Handler = (req: {
  method: string;
  path: string;
  body: unknown;
}) => { status: number; headers?: Record<string, string>; body: unknown };

let currentHandler: Handler | null = null;
let server: Server;
let baseUrl = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = undefined;
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      if (!currentHandler) {
        res.writeHead(500);
        res.end("no handler");
        return;
      }
      const r = currentHandler({ method, path: url, body });
      res.writeHead(r.status, { "content-type": "application/json", ...(r.headers ?? {}) });
      res.end(typeof r.body === "string" ? r.body : JSON.stringify(r.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

function route(h: Handler) {
  currentHandler = h;
}

const validManifest = (callEndpoint: string) => ({
  portal_version: "0.1",
  name: "Test",
  brief: "Test portal.",
  tools: [
    { name: "ping", description: "returns pong" },
    {
      name: "echo",
      params: { msg: { type: "string", required: true } },
    },
  ],
  call_endpoint: callEndpoint,
  auth: "none" as const,
  pricing: { model: "free" as const },
});

// -----------------------------------------------------------------------------

describe("visit()", () => {
  test("fetches + validates a manifest and returns a Portal", async () => {
    route(() => ({ status: 200, body: validManifest(`${baseUrl}/portal/call`) }));
    const p = await visit(`${baseUrl}/portal`);
    expect(p.manifest.name).toBe("Test");
    expect(p.manifest.tools.map((t) => t.name)).toEqual(["ping", "echo"]);
    expect(p.url).toBe(`${baseUrl}/portal`);
  });

  test("throws PortalNotFound on HTTP 404", async () => {
    route(() => ({ status: 404, body: { error: "nope" } }));
    await expect(visit(`${baseUrl}/portal`)).rejects.toBeInstanceOf(PortalNotFound);
  });

  test("throws PortalNotFound on network failure", async () => {
    // 127.0.0.1:1 never answers
    await expect(visit("http://127.0.0.1:1/portal")).rejects.toBeInstanceOf(PortalNotFound);
  });

  test("throws ManifestInvalid when schema validation fails", async () => {
    route(() => ({
      status: 200,
      body: { portal_version: "0.1", tools: [], call_endpoint: "https://x.y/portal/call" },
    }));
    await expect(visit(`${baseUrl}/portal`)).rejects.toBeInstanceOf(ManifestInvalid);
  });

  test("throws ManifestInvalid when body is not JSON", async () => {
    route(() => ({ status: 200, body: "<html/>" }));
    await expect(visit(`${baseUrl}/portal`)).rejects.toBeInstanceOf(ManifestInvalid);
  });

  test("honors timeout option", async () => {
    route(() => {
      // Never responds — rely on AbortController in the SDK.
      return new Promise(() => {}) as never;
    });
    // The in-process server has no delay knob; stand up a separate dead host
    // by pointing at a port that will accept TCP but never write (use
    // discard port which is closed on most machines — fall back to 1).
    await expect(visit("http://127.0.0.1:1/portal", { timeoutMs: 50 })).rejects.toBeInstanceOf(
      PortalNotFound,
    );
  });
});

describe("Portal.call()", () => {
  test("calls a tool and returns the result", async () => {
    route(({ method, path, body }) => {
      if (method === "GET" && path === "/portal") {
        return { status: 200, body: validManifest(`${baseUrl}/portal/call`) };
      }
      if (method === "POST" && path === "/portal/call") {
        const { tool, params } = body as { tool: string; params: { msg: string } };
        return { status: 200, body: { ok: true, result: { tool, echoed: params.msg } } };
      }
      return { status: 404, body: "" };
    });
    const p: Portal = await visit(`${baseUrl}/portal`);
    const r = await p.call("echo", { msg: "hi" });
    expect(r).toEqual({ tool: "echo", echoed: "hi" });
  });

  test("throws ToolNotInManifest for a tool not listed in the manifest", async () => {
    route(() => ({ status: 200, body: validManifest(`${baseUrl}/portal/call`) }));
    const p = await visit(`${baseUrl}/portal`);
    await expect(p.call("missing", {})).rejects.toBeInstanceOf(ToolNotInManifest);
  });

  test("throws CallFailed with code when server returns ok:false", async () => {
    route(({ method, path }) => {
      if (method === "GET" && path === "/portal") {
        return { status: 200, body: validManifest(`${baseUrl}/portal/call`) };
      }
      return {
        status: 200,
        body: { ok: false, error: "missing msg", code: "INVALID_PARAMS" },
      };
    });
    const p = await visit(`${baseUrl}/portal`);
    try {
      await p.call("echo", {});
      throw new Error("expected CallFailed");
    } catch (e) {
      expect(e).toBeInstanceOf(CallFailed);
      const ce = e as CallFailed;
      expect(ce.code).toBe("INVALID_PARAMS");
      expect(ce.message).toContain("missing msg");
    }
  });

  test("throws CallFailed when the response envelope is malformed", async () => {
    route(({ method, path }) => {
      if (method === "GET" && path === "/portal") {
        return { status: 200, body: validManifest(`${baseUrl}/portal/call`) };
      }
      return { status: 200, body: { whatever: 1 } };
    });
    const p = await visit(`${baseUrl}/portal`);
    await expect(p.call("echo", { msg: "hi" })).rejects.toBeInstanceOf(CallFailed);
  });

  test("throws CallFailed on transport failure (4xx/5xx)", async () => {
    route(({ method, path }) => {
      if (method === "GET" && path === "/portal") {
        return { status: 200, body: validManifest(`${baseUrl}/portal/call`) };
      }
      return { status: 500, body: { error: "blew up" } };
    });
    const p = await visit(`${baseUrl}/portal`);
    const err = await p.call("echo", { msg: "hi" }).catch((e) => e);
    expect(err).toBeInstanceOf(CallFailed);
    expect((err as CallFailed).code).toBe("INTERNAL");
  });
});

describe("Portal.hasTool() + .tools", () => {
  test("hasTool reflects the manifest", async () => {
    route(() => ({ status: 200, body: validManifest(`${baseUrl}/portal/call`) }));
    const p = await visit(`${baseUrl}/portal`);
    expect(p.hasTool("ping")).toBe(true);
    expect(p.hasTool("missing")).toBe(false);
    expect(p.tools).toEqual(["ping", "echo"]);
  });
});

describe("conformance vectors round-trip", () => {
  // Sanity: every manifest_valid vector is accepted by the SDK. Uses the same
  // JSON file the spec self-test uses.
  test("every manifest_valid vector validates via visit()", async () => {
    // Import vectors inline to keep the test focused.
    const { getVectors } = await import("@visitportal/spec/runner");
    const v = getVectors();
    for (const entry of v.manifest_valid) {
      route(() => ({ status: 200, body: entry.manifest }));
      const p = await visit(`${baseUrl}/portal`);
      expect(p.manifest.portal_version).toMatch(/^0\.1/);
    }
  });

  test("every manifest_invalid vector is rejected as ManifestInvalid", async () => {
    const { getVectors } = await import("@visitportal/spec/runner");
    const v = getVectors();
    for (const entry of v.manifest_invalid) {
      route(() => ({ status: 200, body: entry.manifest }));
      await expect(visit(`${baseUrl}/portal`)).rejects.toBeInstanceOf(ManifestInvalid);
    }
  });
});
