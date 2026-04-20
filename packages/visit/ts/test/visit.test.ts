import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { createServer, type Server } from "node:http";
import {
  CallFailed,
  ManifestInvalid,
  PortalNotFound,
  ToolNotInManifest,
  type Portal,
  type VisitEvent,
  type VisitOptions,
  visit,
} from "../src/index.ts";

// Tiny in-process HTTP server so these tests don't depend on network or on
// the trending-demo reference. Each test can mount its own handler via the
// `route()` helper to shape GET /portal and POST /portal/call responses.

type Handler = (req: {
  method: string;
  path: string;
  body: unknown;
  raw: string;
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
      const r = currentHandler({ method, path: url, body, raw });
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

// All tests hit the in-process http://127.0.0.1:PORT server, so the SDK's
// new default-deny-on-plain-http guard would reject every call without
// this opt-in. Loopback is the only host on which allowInsecure has effect.
const DEV: VisitOptions = { allowInsecure: true };

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
    const p = await visit(`${baseUrl}/portal`, DEV);
    expect(p.manifest.name).toBe("Test");
    expect(p.manifest.tools.map((t) => t.name)).toEqual(["ping", "echo"]);
    expect(p.url).toBe(`${baseUrl}/portal`);
  });

  test("throws PortalNotFound on HTTP 404", async () => {
    route(() => ({ status: 404, body: { error: "nope" } }));
    await expect(visit(`${baseUrl}/portal`, DEV)).rejects.toBeInstanceOf(PortalNotFound);
  });

  test("throws PortalNotFound on network failure", async () => {
    await expect(
      visit("http://127.0.0.1:1/portal", { ...DEV, retries: 0 }),
    ).rejects.toBeInstanceOf(PortalNotFound);
  });

  test("throws ManifestInvalid when schema validation fails", async () => {
    route(() => ({
      status: 200,
      body: { portal_version: "0.1", tools: [], call_endpoint: "https://x.y/portal/call" },
    }));
    await expect(visit(`${baseUrl}/portal`, DEV)).rejects.toBeInstanceOf(ManifestInvalid);
  });

  test("throws ManifestInvalid when body is not JSON", async () => {
    route(() => ({ status: 200, body: "<html/>" }));
    await expect(visit(`${baseUrl}/portal`, DEV)).rejects.toBeInstanceOf(ManifestInvalid);
  });

  test("honors timeout option", async () => {
    await expect(
      visit("http://127.0.0.1:1/portal", { ...DEV, timeoutMs: 50, retries: 0 }),
    ).rejects.toBeInstanceOf(PortalNotFound);
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
    const p: Portal = await visit(`${baseUrl}/portal`, DEV);
    const r = await p.call("echo", { msg: "hi" });
    expect(r).toEqual({ tool: "echo", echoed: "hi" });
  });

  test("throws ToolNotInManifest for a tool not listed in the manifest", async () => {
    route(() => ({ status: 200, body: validManifest(`${baseUrl}/portal/call`) }));
    const p = await visit(`${baseUrl}/portal`, DEV);
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
    const p = await visit(`${baseUrl}/portal`, DEV);
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
    const p = await visit(`${baseUrl}/portal`, DEV);
    await expect(p.call("echo", { msg: "hi" })).rejects.toBeInstanceOf(CallFailed);
  });

  test("throws CallFailed on transport failure (4xx/5xx)", async () => {
    route(({ method, path }) => {
      if (method === "GET" && path === "/portal") {
        return { status: 200, body: validManifest(`${baseUrl}/portal/call`) };
      }
      return { status: 400, body: { error: "bad" } };
    });
    const p = await visit(`${baseUrl}/portal`, DEV);
    const err = await p.call("echo", { msg: "hi" }).catch((e) => e);
    expect(err).toBeInstanceOf(CallFailed);
    expect((err as CallFailed).code).toBe("INTERNAL");
  });
});

describe("Portal.hasTool() + .tools", () => {
  test("hasTool reflects the manifest", async () => {
    route(() => ({ status: 200, body: validManifest(`${baseUrl}/portal/call`) }));
    const p = await visit(`${baseUrl}/portal`, DEV);
    expect(p.hasTool("ping")).toBe(true);
    expect(p.hasTool("missing")).toBe(false);
    expect(p.tools).toEqual(["ping", "echo"]);
  });
});

describe("conformance vectors round-trip", () => {
  // Every MV-0x manifest vector advertises a fixed https://example.com/... or
  // http://localhost call_endpoint, which will always differ from the test
  // server's 127.0.0.1:PORT origin. The same-origin warn is correct behavior;
  // silence it here so the test output stays focused on schema validation.
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("every manifest_valid vector validates via visit()", async () => {
    const { getVectors } = await import("@visitportal/spec/runner");
    const v = getVectors();
    for (const entry of v.manifest_valid) {
      route(() => ({ status: 200, body: entry.manifest }));
      const p = await visit(`${baseUrl}/portal`, DEV);
      expect(p.manifest.portal_version).toMatch(/^0\.1/);
    }
  });

  test("every manifest_invalid vector is rejected as ManifestInvalid", async () => {
    const { getVectors } = await import("@visitportal/spec/runner");
    const v = getVectors();
    for (const entry of v.manifest_invalid) {
      route(() => ({ status: 200, body: entry.manifest }));
      await expect(visit(`${baseUrl}/portal`, DEV)).rejects.toBeInstanceOf(ManifestInvalid);
    }
  });
});

// -----------------------------------------------------------------------------
// Hardening (Sev-2): size cap, HTTPS enforcement, same-origin, retry, hooks
// -----------------------------------------------------------------------------

describe("hardening · size cap", () => {
  test("manifest larger than maxBytes is rejected", async () => {
    const bigBrief = "x".repeat(2_000_000); // 2 MB brief, pushes body > 1 MB default
    const bigManifest = { ...validManifest(`${baseUrl}/portal/call`), brief: bigBrief };
    route(() => ({ status: 200, body: bigManifest }));
    await expect(visit(`${baseUrl}/portal`, DEV)).rejects.toBeInstanceOf(PortalNotFound);
  });

  test("custom maxBytes honoured (tight cap rejects normal-sized manifest)", async () => {
    route(() => ({ status: 200, body: validManifest(`${baseUrl}/portal/call`) }));
    await expect(
      visit(`${baseUrl}/portal`, { ...DEV, maxBytes: 50 }),
    ).rejects.toBeInstanceOf(PortalNotFound);
  });
});

describe("hardening · HTTPS enforcement", () => {
  test("http:// URL rejected by default (no allowInsecure)", async () => {
    route(() => ({ status: 200, body: validManifest(`${baseUrl}/portal/call`) }));
    const err = await visit(`${baseUrl}/portal`).catch((e) => e);
    expect(err).toBeInstanceOf(PortalNotFound);
    expect((err as Error).message).toMatch(/http:\/\//);
  });

  test("http://<non-loopback> rejected even with allowInsecure:true", async () => {
    await expect(
      visit("http://example.com/portal", { allowInsecure: true, retries: 0 }),
    ).rejects.toBeInstanceOf(PortalNotFound);
  });

  test("http://localhost accepted with allowInsecure:true (loopback exception)", async () => {
    route(() => ({ status: 200, body: validManifest(`${baseUrl}/portal/call`) }));
    // baseUrl is http://127.0.0.1:PORT — that's loopback under the allowInsecure rule.
    const p = await visit(`${baseUrl}/portal`, DEV);
    expect(p.manifest.name).toBe("Test");
  });

  test("manifest.call_endpoint with plain http:// rejected as ManifestInvalid", async () => {
    route(() => ({
      status: 200,
      body: { ...validManifest(`${baseUrl}/portal/call`), call_endpoint: "http://evil.example.com/portal/call" },
    }));
    // Visit URL is loopback http:// (allowed), but call_endpoint is http://<public>
    // which the manifest.schema.json now rejects at parse time; the SDK catches
    // it either at schema validation OR at the post-validate HTTPS re-check.
    await expect(visit(`${baseUrl}/portal`, DEV)).rejects.toBeInstanceOf(ManifestInvalid);
  });
});

describe("hardening · same-origin check", () => {
  test("call_endpoint on a different origin: default warns once, returns Portal", async () => {
    // Third-party origin that shares the https:// requirement so the visit
    // succeeds and the same-origin code path is what triggers.
    const crossOrigin = validManifest("https://other.example.com/portal/call");
    route(() => ({ status: 200, body: crossOrigin }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const p = await visit(`${baseUrl}/portal`, DEV);
      expect(p.manifest.name).toBe("Test");
      expect(warn).toHaveBeenCalledTimes(1);
      const msg = warn.mock.calls[0]?.[0] as string;
      expect(msg).toContain("call_endpoint origin");
      expect(msg).toContain("differs from manifest origin");
    } finally {
      warn.mockRestore();
    }
  });

  test("call_endpoint on a different origin + strictSameOrigin:true: throws ManifestInvalid", async () => {
    const crossOrigin = validManifest("https://other.example.com/portal/call");
    route(() => ({ status: 200, body: crossOrigin }));
    await expect(
      visit(`${baseUrl}/portal`, { ...DEV, strictSameOrigin: true }),
    ).rejects.toBeInstanceOf(ManifestInvalid);
  });
});

describe("hardening · retry on transport + 5xx", () => {
  test("500 response is retried, second 200 is returned", async () => {
    let hits = 0;
    route(({ method, path }) => {
      if (method === "GET" && path === "/portal") {
        hits++;
        if (hits === 1) return { status: 500, body: { error: "first fail" } };
        return { status: 200, body: validManifest(`${baseUrl}/portal/call`) };
      }
      return { status: 404, body: "" };
    });
    const p = await visit(`${baseUrl}/portal`, DEV);
    expect(p.manifest.name).toBe("Test");
    expect(hits).toBe(2);
  });

  test("400 response is NOT retried", async () => {
    let hits = 0;
    route(() => {
      hits++;
      return { status: 400, body: { error: "nope" } };
    });
    await expect(visit(`${baseUrl}/portal`, DEV)).rejects.toBeInstanceOf(PortalNotFound);
    expect(hits).toBe(1);
  });

  test("retries: 0 disables retry", async () => {
    let hits = 0;
    route(() => {
      hits++;
      return { status: 500, body: "" };
    });
    await expect(
      visit(`${baseUrl}/portal`, { ...DEV, retries: 0 }),
    ).rejects.toBeInstanceOf(PortalNotFound);
    expect(hits).toBe(1);
  });
});

describe("hardening · onEvent hook", () => {
  test("emits visit.start, visit.end, call.start, call.end in order", async () => {
    route(({ method, path }) => {
      if (method === "GET" && path === "/portal") {
        return { status: 200, body: validManifest(`${baseUrl}/portal/call`) };
      }
      return { status: 200, body: { ok: true, result: { pong: true } } };
    });

    const events: VisitEvent[] = [];
    const p = await visit(`${baseUrl}/portal`, { ...DEV, onEvent: (e) => events.push(e) });
    await p.call("ping", {});

    expect(events.map((e) => e.kind)).toEqual([
      "visit.start",
      "visit.end",
      "call.start",
      "call.end",
    ]);

    const visitEnd = events[1] as Extract<VisitEvent, { kind: "visit.end" }>;
    expect(visitEnd.url).toBe(`${baseUrl}/portal`);
    expect(visitEnd.ms).toBeGreaterThanOrEqual(0);
    expect(visitEnd.bytes).toBeGreaterThan(0);

    const callEnd = events[3] as Extract<VisitEvent, { kind: "call.end" }>;
    expect(callEnd.tool).toBe("ping");
    expect(callEnd.ok).toBe(true);
  });

  test("call.end carries ok:false when the call throws CallFailed", async () => {
    route(({ method, path }) => {
      if (method === "GET" && path === "/portal") {
        return { status: 200, body: validManifest(`${baseUrl}/portal/call`) };
      }
      return {
        status: 200,
        body: { ok: false, error: "bad", code: "INVALID_PARAMS" },
      };
    });
    const events: VisitEvent[] = [];
    const p = await visit(`${baseUrl}/portal`, { ...DEV, onEvent: (e) => events.push(e) });
    await p.call("ping", {}).catch(() => {});
    const callEnd = events.find((e) => e.kind === "call.end") as
      | Extract<VisitEvent, { kind: "call.end" }>
      | undefined;
    expect(callEnd).toBeDefined();
    expect(callEnd?.ok).toBe(false);
  });

  test("throwing onEvent hook does not break the SDK", async () => {
    route(() => ({ status: 200, body: validManifest(`${baseUrl}/portal/call`) }));
    const p = await visit(`${baseUrl}/portal`, {
      ...DEV,
      onEvent: () => {
        throw new Error("user hook blew up");
      },
    });
    expect(p.manifest.name).toBe("Test");
  });
});
