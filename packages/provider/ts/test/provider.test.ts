import { describe, expect, test } from "vitest";
import {
  ManifestBuildError,
  ensureManifest,
  invalidParams,
  manifest,
  rateLimited,
  serve,
} from "../src/index.ts";

describe("@visitportal/provider manifest()", () => {
  test("builds a valid manifest from tool definitions", () => {
    const built = manifest({
      name: "Test Provider",
      brief: "A provider used in tests.",
      call_endpoint: "/portal/call",
      tools: [
        {
          name: "ping",
          description: "returns pong",
          handler: async () => ({ pong: true }),
        },
      ],
    });

    expect(built.portal_version).toBe("0.1");
    expect(built.auth).toBe("none");
    expect(built.pricing).toEqual({ model: "free" });
    expect(built.tools).toEqual([{ name: "ping", description: "returns pong" }]);
  });

  test("rejects duplicate tool names", () => {
    expect(() =>
      manifest({
        name: "Dupes",
        brief: "bad",
        call_endpoint: "/portal/call",
        tools: [
          { name: "ping", handler: async () => ({}) },
          { name: "ping", handler: async () => ({}) },
        ],
      }),
    ).toThrow(ManifestBuildError);
  });

  test("validates supplied manifests too", () => {
    const built = ensureManifest({
      portal_version: "0.1",
      name: "Supplied",
      brief: "Already built.",
      tools: [{ name: "ping" }],
      call_endpoint: "/portal/call",
      auth: "none",
      pricing: { model: "free" },
    });

    expect(built.name).toBe("Supplied");
  });
});

describe("@visitportal/provider serve()", () => {
  test("dispatches a successful tool call", async () => {
    const portal = serve({
      name: "Test Provider",
      brief: "A provider used in tests.",
      call_endpoint: "/portal/call",
      tools: [
        {
          name: "echo",
          params: { msg: { type: "string", required: true } },
          async handler(params) {
            return { echoed: params.msg };
          },
        },
      ],
    });

    const res = await portal.dispatch({ tool: "echo", params: { msg: "hi" } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, result: { echoed: "hi" } });
  });

  test("maps thrown provider errors to Portal envelopes", async () => {
    const portal = serve({
      name: "Test Provider",
      brief: "A provider used in tests.",
      call_endpoint: "/portal/call",
      tools: [
        {
          name: "echo",
          async handler() {
            throw invalidParams("msg required");
          },
        },
      ],
    });

    const res = await portal.dispatch({ tool: "echo", params: {} });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ ok: false, error: "msg required", code: "INVALID_PARAMS" });
  });

  test("rejects malformed call bodies before handlers run", async () => {
    const portal = serve({
      name: "Test Provider",
      brief: "A provider used in tests.",
      call_endpoint: "/portal/call",
      tools: [{ name: "ping", async handler() { return { pong: true }; } }],
    });

    await expect(portal.dispatch([])).resolves.toMatchObject({
      status: 400,
      body: { ok: false, code: "INVALID_PARAMS" },
    });
    await expect(portal.dispatch({ tool: "", params: {} })).resolves.toMatchObject({
      status: 400,
      body: { ok: false, code: "INVALID_PARAMS" },
    });
  });

  test("treats missing or null params as {}", async () => {
    const portal = serve({
      name: "Test Provider",
      brief: "A provider used in tests.",
      call_endpoint: "/portal/call",
      tools: [
        {
          name: "ping",
          async handler(params) {
            return { keys: Object.keys(params) };
          },
        },
      ],
    });

    await expect(portal.dispatch({ tool: "ping" })).resolves.toMatchObject({
      status: 200,
      body: { ok: true, result: { keys: [] } },
    });
    await expect(portal.dispatch({ tool: "ping", params: null })).resolves.toMatchObject({
      status: 200,
      body: { ok: true, result: { keys: [] } },
    });
  });

  test("supports an existing manifest + handlers map", async () => {
    const portal = serve({
      manifest: {
        portal_version: "0.1",
        name: "Wrapped",
        brief: "Static manifest.",
        tools: [{ name: "ping", description: "returns pong" }],
        call_endpoint: "/portal/call",
        auth: "none",
        pricing: { model: "free" },
      },
      handlers: {
        ping: async () => ({ pong: true }),
      },
    });

    const res = await portal.dispatch({ tool: "ping", params: {} });
    expect(res.body).toEqual({ ok: true, result: { pong: true } });
  });

  test("throws when manifest and handlers disagree", () => {
    expect(() =>
      serve({
        manifest: {
          portal_version: "0.1",
          name: "Mismatch",
          brief: "bad",
          tools: [{ name: "ping" }],
          call_endpoint: "/portal/call",
          auth: "none",
          pricing: { model: "free" },
        },
        handlers: {},
      }),
    ).toThrow(ManifestBuildError);
  });
});

describe("@visitportal/provider fetch()", () => {
  test("serves /portal and /.well-known/portal.json byte-identically", async () => {
    const portal = serve({
      name: "Fetch Provider",
      brief: "Fetch-native helper.",
      call_endpoint: "/portal/call",
      tools: [{ name: "ping", async handler() { return { pong: true }; } }],
    });

    const [a, b] = await Promise.all([
      portal.fetch(new Request("https://example.com/portal")),
      portal.fetch(new Request("https://example.com/.well-known/portal.json")),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await a.text()).toBe(await b.text());
  });

  test("OPTIONS /portal/call returns spec-shaped CORS headers", async () => {
    const portal = serve({
      name: "Fetch Provider",
      brief: "Fetch-native helper.",
      call_endpoint: "/portal/call",
      tools: [{ name: "ping", async handler() { return { pong: true }; } }],
    });

    const res = await portal.fetch(
      new Request("https://example.com/portal/call", {
        method: "OPTIONS",
        headers: {
          Origin: "https://app.example.com",
          "Access-Control-Request-Method": "POST",
        },
      }),
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  test("credentialed auth echoes Origin on /portal/call", async () => {
    const portal = serve({
      name: "Secure Provider",
      brief: "Echoes origin.",
      call_endpoint: "/portal/call",
      auth: "api_key",
      tools: [{ name: "ping", async handler() { return { pong: true }; } }],
    });

    const res = await portal.fetch(
      new Request("https://example.com/portal/call", {
        method: "POST",
        headers: {
          Origin: "https://app.example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({ tool: "ping", params: {} }),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("vary")).toBe("Origin");
  });

  test("handler-supplied Retry-After survives onto the HTTP response", async () => {
    const portal = serve({
      name: "Limited Provider",
      brief: "Rate-limited.",
      call_endpoint: "/portal/call",
      tools: [
        {
          name: "ping",
          async handler() {
            throw rateLimited("slow down", { retryAfter: 9 });
          },
        },
      ],
    });

    const res = await portal.fetch(
      new Request("https://example.com/portal/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: "ping", params: {} }),
      }),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("9");
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "slow down",
      code: "RATE_LIMITED",
    });
  });

  test("malformed JSON gets a 400 INVALID_PARAMS envelope", async () => {
    const portal = serve({
      name: "Fetch Provider",
      brief: "Fetch-native helper.",
      call_endpoint: "/portal/call",
      tools: [{ name: "ping", async handler() { return { pong: true }; } }],
    });

    const res = await portal.fetch(
      new Request("https://example.com/portal/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not valid json",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "request body is not valid JSON",
      code: "INVALID_PARAMS",
    });
  });
});
