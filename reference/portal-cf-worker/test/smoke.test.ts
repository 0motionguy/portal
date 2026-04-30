import { validateManifest } from "@visitportal/spec/runner";
import { describe, expect, it } from "vitest";
import worker from "../src/worker.ts";

const ORIGIN = "https://portal-cf-worker.example.workers.dev";

async function get(path: string): Promise<Response> {
  return worker.fetch(new Request(`${ORIGIN}${path}`));
}

async function call(
  tool: string,
  params: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await worker.fetch(
    new Request(`${ORIGIN}/portal/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool, params }),
    }),
  );
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

describe("portal-cf-worker smoke", () => {
  it("GET /portal returns a valid manifest with a root-relative call_endpoint", async () => {
    const res = await get("/portal");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    const body = (await res.json()) as { call_endpoint: string };
    const check = validateManifest(body);
    expect(check.ok).toBe(true);
    expect(body.call_endpoint).toBe("/portal/call");
  });

  it("GET /.well-known/portal.json returns byte-identical manifest to /portal", async () => {
    const [a, b] = await Promise.all([get("/portal"), get("/.well-known/portal.json")]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const aText = await a.text();
    const bText = await b.text();
    expect(bText).toBe(aText);
  });

  it("whoami succeeds with HTTP 200 and a documented payload", async () => {
    const { status, body } = await call("whoami", {});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const result = body.result as Record<string, unknown>;
    expect(result.runtime).toBe("cloudflare-workers");
    expect(result.portal_version).toBe("0.1");
  });

  it("reverse round-trips a string", async () => {
    const { status, body } = await call("reverse", { text: "hello" });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect((body.result as { reversed: string }).reversed).toBe("olleh");
  });

  it("reverse with non-string returns HTTP 400 + INVALID_PARAMS", async () => {
    const { status, body } = await call("reverse", { text: 42 });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("INVALID_PARAMS");
  });

  it("unknown tool returns HTTP 404 + NOT_FOUND envelope", async () => {
    const { status, body } = await call("no_such_tool", {});
    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("malformed JSON returns HTTP 400 + INVALID_PARAMS", async () => {
    const res = await worker.fetch(
      new Request(`${ORIGIN}/portal/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not valid json",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("INVALID_PARAMS");
  });

  it("OPTIONS /portal/call returns 204 with CORS headers", async () => {
    const res = await worker.fetch(
      new Request(`${ORIGIN}/portal/call`, {
        method: "OPTIONS",
        headers: { origin: "https://example.com" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toMatch(/POST/);
  });

  it("GET /healthz returns { ok: true }", async () => {
    const res = await get("/healthz");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("unknown route returns HTTP 404 + NOT_FOUND envelope", async () => {
    const res = await get("/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
  });
});

describe("portal-cf-worker · PE-002 paid tool (premium_data)", () => {
  it("manifest declares pricing.model: 'x402'", async () => {
    const res = await get("/portal");
    const body = (await res.json()) as { pricing?: { model?: string } };
    expect(body.pricing?.model).toBe("x402");
  });

  it("premium_data without X-Payment returns HTTP 402 + PAYMENT_REQUIRED + x402.accepts", async () => {
    const { status, body } = await call("premium_data", {});
    expect(status).toBe(402);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("PAYMENT_REQUIRED");
    const x402 = body.x402 as Record<string, unknown>;
    expect(x402).toBeDefined();
    expect(x402.x402Version).toBe(1);
    const accepts = x402.accepts as Array<Record<string, unknown>>;
    expect(accepts.length).toBe(1);
    const first = accepts[0];
    if (!first) throw new Error("expected at least one accept entry");
    expect(first.scheme).toBe("exact");
    expect(first.network).toBe("base-sepolia");
    expect(first.amount).toBe("10000");
    const resource = x402.resource as Record<string, unknown>;
    expect(resource.id).toBe("cf-worker-premium-data-v1");
  });

  it("premium_data with X-Payment header runs the handler and returns the paid fact", async () => {
    const xPayment = btoa(JSON.stringify({ scheme: "exact", signed: "0xdemo" }));
    const res = await worker.fetch(
      new Request(`${ORIGIN}/portal/call`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-payment": xPayment },
        body: JSON.stringify({ tool: "premium_data", params: {} }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    const result = body.result as Record<string, unknown>;
    expect(result.paid).toBe(true);
    expect(typeof result.fact).toBe("string");
  });

  it("free tools (whoami, reverse) stay free with x402 sibling enabled", async () => {
    const a = await call("whoami", {});
    expect(a.status).toBe(200);
    expect(a.body.ok).toBe(true);
    const b = await call("reverse", { text: "abc" });
    expect(b.status).toBe(200);
    expect(b.body.ok).toBe(true);
  });
});
