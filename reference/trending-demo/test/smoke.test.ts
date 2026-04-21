import { validateManifest } from "@visitportal/spec/runner";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server.ts";

const app = createApp();

async function call(
  tool: string,
  params: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.request("/portal/call", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, params }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

describe("trending-demo smoke", () => {
  it("GET /portal returns a valid manifest with an absolute call_endpoint", async () => {
    const res = await app.request("/portal");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { call_endpoint: string };
    const check = validateManifest(body);
    expect(check.ok).toBe(true);
    expect(body.call_endpoint).toMatch(/^https?:\/\/.+\/portal\/call$/);
  });

  it("top_gainers returns N repos with HTTP 200", async () => {
    const { status, body } = await call("top_gainers", { limit: 3 });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.result)).toBe(true);
    expect((body.result as unknown[]).length).toBe(3);
  });

  it("unknown tool returns HTTP 404 + NOT_FOUND envelope", async () => {
    const { status, body } = await call("no_such_tool", {});
    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
    expect(typeof body.error).toBe("string");
  });

  it("top_gainers with non-numeric limit returns HTTP 400 + INVALID_PARAMS", async () => {
    const { status, body } = await call("top_gainers", { limit: "ten" });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("INVALID_PARAMS");
  });

  it("maintainer_profile with unknown handle returns HTTP 404 + NOT_FOUND", async () => {
    const { status, body } = await call("maintainer_profile", { handle: "nobody-12345" });
    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("malformed JSON returns HTTP 400 + INVALID_PARAMS", async () => {
    const res = await app.request("/portal/call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not valid json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("INVALID_PARAMS");
  });

  it("GET /healthz returns { ok: true }", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("GET /.well-known/portal.json returns byte-identical manifest to /portal", async () => {
    const [a, b] = await Promise.all([
      app.request("/portal"),
      app.request("/.well-known/portal.json"),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const aText = await a.text();
    const bText = await b.text();
    // Byte-for-byte parity — spec Appendix E is explicit about this.
    expect(bText).toBe(aText);
    // And the content is a valid manifest either way.
    const parsed = JSON.parse(bText) as { call_endpoint: string };
    expect(parsed.call_endpoint).toMatch(/^https?:\/\/.+\/portal\/call$/);
  });
});

describe("trending-demo CORS (spec v0.1.1 Appendix C)", () => {
  it("OPTIONS /portal/call returns 204 with Allow-Origin:* and allowed methods include POST", async () => {
    const res = await app.request("/portal/call", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const methods = (res.headers.get("access-control-allow-methods") ?? "").toUpperCase();
    expect(methods).toContain("POST");
  });

  it("OPTIONS /portal returns 204 with Allow-Origin:* and allowed methods include GET", async () => {
    const res = await app.request("/portal", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const methods = (res.headers.get("access-control-allow-methods") ?? "").toUpperCase();
    expect(methods).toContain("GET");
  });

  it("OPTIONS /.well-known/portal.json returns 204 with Allow-Origin:* and GET in Allow-Methods", async () => {
    const res = await app.request("/.well-known/portal.json", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const methods = (res.headers.get("access-control-allow-methods") ?? "").toUpperCase();
    expect(methods).toContain("GET");
  });
});

describe("trending-demo rate limit (60 req/min/IP)", () => {
  it("70 rapid calls from one IP: 1–60 pass (200), 61+ return 429 with Retry-After", async () => {
    // Fresh app so this test's bucket doesn't share state with the smoke tests.
    const isolated = createApp();
    const ip = "203.0.113.1";
    const makeReq = () =>
      isolated.request("/portal/call", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ tool: "top_gainers", params: { limit: 1 } }),
      });

    for (let i = 1; i <= 60; i++) {
      const r = await makeReq();
      expect(r.status).toBe(200);
      // Every passing response carries the standard headers.
      expect(r.headers.get("x-ratelimit-limit")).toBe("60");
      const remaining = Number(r.headers.get("x-ratelimit-remaining"));
      expect(remaining).toBe(60 - i);
    }

    const blocked = await makeReq();
    expect(blocked.status).toBe(429);
    const retryAfter = blocked.headers.get("retry-after");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(0);
    const body = (await blocked.json()) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("RATE_LIMITED");

    // A second request after the first 429 is still blocked within the same window.
    const stillBlocked = await makeReq();
    expect(stillBlocked.status).toBe(429);
  });
});
