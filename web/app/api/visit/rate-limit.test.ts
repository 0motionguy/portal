import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import lazily inside each test so module-level `warned` + `limiter` state
// resets cleanly for every case.
async function loadModule() {
  vi.resetModules();
  return import("./rate-limit");
}

describe("rate-limit — no-env fallback", () => {
  const origUrl = process.env.UPSTASH_REDIS_REST_URL;
  const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // `delete` is required here — assigning `undefined` to a process.env key
  // coerces to the string "undefined" (Node.js env vars are always strings),
  // which my hardened rate-limit.ts would then pass to new Redis() and
  // attempt a real network call. biome's unsafe-fix converted `delete` to
  // `= undefined` here and broke the test; restored with biome-ignore.
  beforeEach(() => {
    // biome-ignore lint/performance/noDelete: env var MUST be absent, not the string "undefined"
    delete process.env.UPSTASH_REDIS_REST_URL;
    // biome-ignore lint/performance/noDelete: env var MUST be absent, not the string "undefined"
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    if (origUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = origUrl;
    // biome-ignore lint/performance/noDelete: env var MUST be absent, not the string "undefined"
    else delete process.env.UPSTASH_REDIS_REST_URL;
    if (origToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = origToken;
    // biome-ignore lint/performance/noDelete: env var MUST be absent, not the string "undefined"
    else delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("returns ok:true with empty headers when env vars are missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { check } = await loadModule();

    const r = await check("127.0.0.1");
    expect(r.ok).toBe(true);
    expect(r.headers).toEqual({});
    expect(r.retryAfter).toBeUndefined();

    warn.mockRestore();
  });

  it("warns exactly once across multiple calls in the same module instance", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { check } = await loadModule();

    await check("1.2.3.4");
    await check("5.6.7.8");
    await check("anon");
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  it("does not throw when only one of the two env vars is set", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    // token deliberately unset
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { check } = await loadModule();

    const r = await check("10.0.0.1");
    expect(r.ok).toBe(true);
    expect(r.headers).toEqual({});

    warn.mockRestore();
  });
});
