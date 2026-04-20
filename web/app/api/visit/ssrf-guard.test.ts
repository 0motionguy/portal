import { describe, expect, test } from "vitest";
import { type GuardDeps, guardUrl } from "./ssrf-guard";

// Helper: build a deps bundle with a controllable DNS stub and NODE_ENV.
function deps(opts: { env?: string; resolve?: Record<string, string[]> } = {}): GuardDeps {
  return {
    getEnv: () => opts.env,
    dnsLookup: async (host: string) => {
      const ips = opts.resolve?.[host];
      if (!ips) throw new Error(`no stub for '${host}'`);
      return ips.map((address) => ({
        address,
        family: address.includes(":") ? 6 : 4,
      }));
    },
  };
}

describe("guardUrl — loopback & env gating", () => {
  test("allows localhost in dev", async () => {
    const r = await guardUrl("http://localhost:3075/portal", deps({ env: "development" }));
    expect(r.ok).toBe(true);
  });

  test("rejects localhost in production", async () => {
    const r = await guardUrl("http://localhost:3075/portal", deps({ env: "production" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not allowed in production|http:\/\/ not allowed/);
  });

  test("rejects plain http:// to a public host in production", async () => {
    const r = await guardUrl(
      "http://example.com/portal",
      deps({ env: "production", resolve: { "example.com": ["93.184.216.34"] } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("http://");
  });

  test("allows https:// to a public host", async () => {
    const r = await guardUrl(
      "https://example.com/portal",
      deps({ resolve: { "example.com": ["93.184.216.34"] } }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("guardUrl — literal IP rejection", () => {
  test("rejects RFC1918 192.168.1.1 literal", async () => {
    const r = await guardUrl("https://192.168.1.1/portal", deps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("private");
  });

  test("rejects 10.0.0.1 literal", async () => {
    const r = await guardUrl("https://10.0.0.1/portal", deps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("private");
  });

  test("rejects 169.254.169.254 (cloud metadata) literal", async () => {
    const r = await guardUrl("https://169.254.169.254/latest/meta-data/", deps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/linkLocal|link-local/);
  });

  test("rejects IPv6 unique-local fd00::1 literal", async () => {
    const r = await guardUrl("https://[fd00::1]/portal", deps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/uniqueLocal|private|reserved/);
  });

  test("allows a public IPv4 literal", async () => {
    const r = await guardUrl("https://93.184.216.34/portal", deps());
    expect(r.ok).toBe(true);
  });
});

describe("guardUrl — DNS rebind defence", () => {
  test("rejects a DNS name that resolves to a private IP", async () => {
    // This is the HIGH-severity audit case: attacker controls the name,
    // which points at an internal IP. Must NOT pass.
    const r = await guardUrl(
      "https://rebind.attacker.com/portal",
      deps({ resolve: { "rebind.attacker.com": ["192.168.1.50"] } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("192.168.1.50");
    if (!r.ok) expect(r.error).toContain("resolves to");
  });

  test("rejects when any resolved IP is private (multi-answer rebind)", async () => {
    const r = await guardUrl(
      "https://multi.attacker.com/portal",
      deps({
        resolve: { "multi.attacker.com": ["93.184.216.34", "10.0.0.5"] },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("10.0.0.5");
  });

  test("rejects when DNS lookup fails", async () => {
    const r = await guardUrl(
      "https://nxdomain.example/portal",
      deps({ resolve: {} }), // no entry -> stub throws
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("DNS lookup failed");
  });

  test("accepts a DNS name that resolves to a public IP", async () => {
    const r = await guardUrl(
      "https://example.com/portal",
      deps({ resolve: { "example.com": ["93.184.216.34"] } }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("guardUrl — protocol guard", () => {
  test("rejects file://", async () => {
    const r = await guardUrl("file:///etc/passwd", deps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("file");
  });

  test("rejects gopher://", async () => {
    const r = await guardUrl("gopher://example.com/portal", deps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("gopher");
  });

  test("rejects malformed URL", async () => {
    const r = await guardUrl("not a url", deps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not a valid URL");
  });
});
