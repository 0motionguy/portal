// In-memory fixed-window rate limit for the reference Portal.
//
// Budget: 60 requests / minute / IP on POST /portal/call. The manifest
// endpoint (GET /portal) is CDN-cacheable and is deliberately NOT limited
// at the origin — protect that at the edge (Fly / Vercel / Cloudflare).
//
// Storage is a process-local Map keyed by IP. This is sufficient for the
// single-Fly-machine reference deploy. At > 1 instance you'd push buckets
// into Redis; keeping it in-memory is the whole point of a reference
// implementation judges can read in one sitting.
//
// Self-cleaning: if the bucket map grows beyond CLEANUP_THRESHOLD, walk
// it once and drop every expired entry. Bounded memory without a timer.

import type { Context, MiddlewareHandler } from "hono";

interface Bucket {
  count: number;
  resetAt: number;
}

const LIMIT = 60;
const WINDOW_MS = 60_000;
const CLEANUP_THRESHOLD = 10_000;

function extractIp(c: Context): string {
  // Fly.io sets fly-client-ip to the original client IP, already stripped
  // of Fly's own proxy hops. Prefer it when present.
  const fly = c.req.header("fly-client-ip");
  if (fly) return fly.trim();
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

export function rateLimit(): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();

  function gc(now: number) {
    if (buckets.size <= CLEANUP_THRESHOLD) return;
    for (const [k, v] of buckets) {
      if (v.resetAt < now) buckets.delete(k);
    }
  }

  return async (c, next) => {
    const now = Date.now();
    gc(now);

    const ip = extractIp(c);
    let b = buckets.get(ip);
    if (!b || b.resetAt < now) {
      b = { count: 0, resetAt: now + WINDOW_MS };
      buckets.set(ip, b);
    }
    b.count++;

    const resetSec = Math.ceil(b.resetAt / 1000);

    if (b.count > LIMIT) {
      const retryAfter = Math.max(0, Math.ceil((b.resetAt - now) / 1000));
      c.header("X-RateLimit-Limit", String(LIMIT));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(resetSec));
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { ok: false as const, error: "rate limit exceeded", code: "RATE_LIMITED" as const },
        429,
      );
    }

    c.header("X-RateLimit-Limit", String(LIMIT));
    c.header("X-RateLimit-Remaining", String(Math.max(0, LIMIT - b.count)));
    c.header("X-RateLimit-Reset", String(resetSec));
    await next();
  };
}
