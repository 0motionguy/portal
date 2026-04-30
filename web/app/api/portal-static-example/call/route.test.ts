import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest } from "@visitportal/spec/runner";
import { describe, expect, it } from "vitest";
import { OPTIONS, POST } from "./route";

const here = dirname(fileURLToPath(import.meta.url));
const staticManifestPath = resolve(
  here,
  "..",
  "..",
  "..",
  "..",
  "public",
  "portal-static-example.json",
);
const staticManifestText = readFileSync(staticManifestPath, "utf8");

const ORIGIN = "https://www.visitportal.dev";

async function call(
  tool: string,
  params: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await POST(
    new Request(`${ORIGIN}/api/portal-static-example/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool, params }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("static-fallback Portal — manifest parity", () => {
  it("static JSON manifest validates against the spec schema", () => {
    const parsed = JSON.parse(staticManifestText);
    const result = validateManifest(parsed);
    expect(result.ok).toBe(true);
  });

  it("static JSON manifest matches the dispatcher's tool set (one source of truth check)", () => {
    const parsed = JSON.parse(staticManifestText) as { tools: Array<{ name: string }> };
    const declaredTools = parsed.tools.map((t) => t.name).sort();
    expect(declaredTools).toEqual(["posts", "whoami"]);
  });
});

describe("static-fallback Portal — dispatcher", () => {
  it("whoami returns the static-fallback identifier", async () => {
    const { status, body } = await call("whoami", {});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const result = body.result as Record<string, unknown>;
    expect(result.pattern).toBe("static-fallback");
  });

  it("posts returns 3 posts by default", async () => {
    const { status, body } = await call("posts", {});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect((body.result as unknown[]).length).toBe(3);
  });

  it("posts honors a limit of 1", async () => {
    const { status, body } = await call("posts", { limit: 1 });
    expect(status).toBe(200);
    expect((body.result as unknown[]).length).toBe(1);
  });

  it("posts with limit=4 returns HTTP 400 + INVALID_PARAMS", async () => {
    const { status, body } = await call("posts", { limit: 4 });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("INVALID_PARAMS");
  });

  it("unknown tool returns HTTP 404 + NOT_FOUND envelope", async () => {
    const { status, body } = await call("nope", {});
    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("OPTIONS preflight returns 204 with CORS headers", async () => {
    const res = await OPTIONS(
      new Request(`${ORIGIN}/api/portal-static-example/call`, {
        method: "OPTIONS",
        headers: { origin: "https://example.com" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toMatch(/POST/);
  });
});
