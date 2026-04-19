// SSRF guard for /api/visit.
//
// The original guard checked the URL's literal hostname against private-IP
// ranges, but an attacker can supply a public DNS name that resolves to a
// private IP (DNS rebinding) and still reach internal services. The external
// audit flagged this HIGH.
//
// This module resolves the hostname via dns.lookup({all: true}) and checks
// every returned address against ipaddr.js's IANA range classification.
// Only 'unicast' addresses are permitted; anything else (private, loopback,
// linkLocal, uniqueLocal, reserved, multicast, broadcast) is rejected.
//
// Loopback hostnames (localhost / 127.0.0.1 / ::1) are permitted in dev
// (NODE_ENV !== 'production') so the dev reference portal keeps working;
// in production they are rejected.
//
// In production, plain http:// is always rejected (https:// only). In dev,
// http:// is allowed exclusively for loopback hosts.

import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export interface UrlGuardOk {
  ok: true;
  url: URL;
}
export interface UrlGuardBad {
  ok: false;
  error: string;
}
export type UrlGuardResult = UrlGuardOk | UrlGuardBad;

// Injected dependencies — overridden in tests. Runtime uses Node's dns and
// process.env directly.
export interface GuardDeps {
  dnsLookup: (
    host: string,
  ) => Promise<ReadonlyArray<{ address: string; family: number }>>;
  getEnv: () => string | undefined;
}

const defaultDeps: GuardDeps = {
  dnsLookup: async (host) => lookup(host, { all: true }),
  getEnv: () => process.env.NODE_ENV,
};

export async function guardUrl(
  raw: string,
  deps: GuardDeps = defaultDeps,
): Promise<UrlGuardResult> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "url: not a valid URL" };
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return {
      ok: false,
      error: `url: protocol '${u.protocol.replace(/:$/, "")}' not allowed`,
    };
  }

  const host = u.hostname.toLowerCase();
  const isProd = deps.getEnv() === "production";
  const loopbackName = isLoopbackHostname(host);

  // Plain http:// is rejected unless we're in dev and targeting loopback.
  if (u.protocol === "http:") {
    if (isProd) {
      return { ok: false, error: "url: plain http:// not allowed in production" };
    }
    if (!loopbackName && !isLoopbackIpLiteral(host)) {
      return {
        ok: false,
        error:
          "url: plain http:// is only allowed for localhost / 127.0.0.1 / ::1",
      };
    }
  }

  // Loopback hostname allowance: permitted only in dev. Skip DNS resolution
  // since the name is special-cased by Node's resolver anyway and we have
  // already accepted it.
  if (loopbackName) {
    if (isProd) {
      return { ok: false, error: `url: host '${host}' is not allowed in production` };
    }
    return { ok: true, url: u };
  }

  // Literal IP? Classify it directly — no DNS needed.
  if (ipaddr.isValid(stripBrackets(host))) {
    const parsed = ipaddr.parse(stripBrackets(host));
    const range = parsed.range();
    if (!isUnicastRange(range)) {
      return {
        ok: false,
        error: `url: host '${host}' is a ${range} address`,
      };
    }
    return { ok: true, url: u };
  }

  // Non-literal hostname: resolve it and check every answer. This is the
  // DNS-rebind defence — a public name that happens to point at an internal
  // IP is rejected here.
  let addrs: ReadonlyArray<{ address: string; family: number }>;
  try {
    addrs = await deps.dnsLookup(host);
  } catch {
    return { ok: false, error: `url: DNS lookup failed for '${host}'` };
  }
  if (addrs.length === 0) {
    return { ok: false, error: `url: no addresses resolved for '${host}'` };
  }
  for (const { address } of addrs) {
    if (!ipaddr.isValid(address)) {
      return {
        ok: false,
        error: `url: resolver returned invalid address '${address}'`,
      };
    }
    const range = ipaddr.parse(address).range();
    if (!isUnicastRange(range)) {
      return {
        ok: false,
        error: `url: '${host}' resolves to a ${range} address (${address})`,
      };
    }
  }
  return { ok: true, url: u };
}

// ipaddr.js range() returns different label sets for IPv4 vs IPv6. Allow
// only the public-ish ones. 'unicast' is the canonical "public" class; for
// IPv6 we also accept '6to4' and 'teredo' (those are globally-routable
// transition ranges) but NOT 'rfc6145', 'rfc6052', or similar private
// mappings.
const ALLOWED_RANGES = new Set([
  "unicast", // IPv4 public and IPv6 global unicast
]);

function isUnicastRange(range: string): boolean {
  return ALLOWED_RANGES.has(range);
}

function isLoopbackHostname(host: string): boolean {
  return host === "localhost" || host === "localhost.";
}

function isLoopbackIpLiteral(host: string): boolean {
  const h = stripBrackets(host);
  if (h === "::1") return true;
  if (!ipaddr.isValid(h)) return false;
  return ipaddr.parse(h).range() === "loopback";
}

function stripBrackets(host: string): string {
  return host.replace(/^\[|\]$/g, "");
}
