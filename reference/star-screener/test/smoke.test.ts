import { describe, expect, it } from "vitest";
import { validateManifest } from "@visitportal/spec/runner";
import { createApp } from "../src/server.ts";

const app = createApp();

async function call(tool: string, params: Record<string, unknown>): Promise<unknown> {
  const res = await app.request("/portal/call", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, params }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as unknown;
}

describe("star-screener smoke", () => {
  it("GET /portal returns a valid manifest with an absolute call_endpoint", async () => {
    const res = await app.request("/portal");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { call_endpoint: string };
    const check = validateManifest(body);
    expect(check.ok).toBe(true);
    expect(body.call_endpoint).toMatch(/^https?:\/\/.+\/portal\/call$/);
  });

  it("top_gainers returns N repos", async () => {
    const body = (await call("top_gainers", { limit: 3 })) as {
      ok: true;
      result: unknown[];
    };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.result)).toBe(true);
    expect(body.result.length).toBe(3);
  });

  it("unknown tool returns NOT_FOUND envelope", async () => {
    const body = (await call("no_such_tool", {})) as {
      ok: false;
      code: string;
      error: string;
    };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
    expect(typeof body.error).toBe("string");
  });

  it("top_gainers with non-numeric limit returns INVALID_PARAMS", async () => {
    const body = (await call("top_gainers", { limit: "ten" })) as {
      ok: false;
      code: string;
    };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("INVALID_PARAMS");
  });

  it("maintainer_profile with unknown handle returns NOT_FOUND", async () => {
    const body = (await call("maintainer_profile", { handle: "nobody-12345" })) as {
      ok: false;
      code: string;
    };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("GET /healthz returns { ok: true }", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
