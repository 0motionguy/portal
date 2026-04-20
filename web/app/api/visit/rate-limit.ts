// Sliding-window IP rate limiter for /api/visit.
//
// Budget: 10 req / minute / IP. Fits inside Upstash's free-tier 10k req/day
// allowance. Prevents the route from being used as an outbound proxy for
// arbitrary scanning.
//
// Module is side-effect-free at import time — the Redis client + Ratelimit
// instance are constructed lazily on the first check() call and only when
// both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are present in
// the environment. If either is missing (local dev, preview without secrets)
// check() returns { ok: true, headers: {} } after a one-time console.warn
// so the endpoint keeps working.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateLimitResult {
  ok: boolean;
  headers: Record<string, string>;
  retryAfter?: number;
}

let limiter: Ratelimit | null = null;
let warned = false;
let constructFailed = false;

function getLimiter(): Ratelimit | null {
  if (limiter) return limiter;
  if (constructFailed) return null; // don't retry on every request once we've failed once
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    if (!warned) {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — /api/visit rate limiting is DISABLED",
      );
      warned = true;
    }
    return null;
  }
  try {
    limiter = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      analytics: false,
      prefix: "visitportal:api-visit",
    });
    return limiter;
  } catch (err) {
    // Bad URL, bad token format, or any other client-construction error.
    // Fail-open so one misconfigured env var doesn't take the whole endpoint
    // offline. One-shot warn; don't retry per request.
    constructFailed = true;
    console.warn(
      "[rate-limit] Failed to construct Upstash client, rate limiting DISABLED:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

export async function check(ip: string): Promise<RateLimitResult> {
  const l = getLimiter();
  if (!l) return { ok: true, headers: {} };

  let success: boolean;
  let limit: number;
  let remaining: number;
  let reset: number;
  try {
    // Ratelimit.limit returns { success, limit, remaining, reset } where
    // `reset` is a unix epoch timestamp in milliseconds.
    ({ success, limit, remaining, reset } = await l.limit(ip));
  } catch (err) {
    // Fail-open on Redis errors — a rate-limit outage shouldn't take the
    // endpoint offline. Log so operators still see the problem.
    console.warn(
      "[rate-limit] Upstash call failed, allowing request through:",
      err instanceof Error ? err.message : String(err),
    );
    return { ok: true, headers: {} };
  }

  const resetSec = Math.ceil(reset / 1000);
  const retryAfter = Math.max(0, resetSec - Math.floor(Date.now() / 1000));

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(resetSec),
  };
  if (success) return { ok: true, headers };
  return {
    ok: false,
    headers: { ...headers, "Retry-After": String(retryAfter) },
    retryAfter,
  };
}
