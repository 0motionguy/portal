// Single source of truth for manifest validation — keeps the web /api/visit
// proxy byte-for-byte decision-equivalent with the visitor SDK and the spec
// self-test. Previously a local copy at web/src/lib/lean-validator.ts
// drifted (accepted any http:// host instead of https-with-loopback-only).
import { leanValidate } from "@visitportal/spec/lean-validator";
import { NextResponse } from "next/server";
import { check as rateLimitCheck } from "./rate-limit";
import { guardUrl } from "./ssrf-guard";

// GET /api/visit?url=<portal-url>
//
// Same-origin proxy for the LiveVisit widget. The browser cannot fetch
// arbitrary Portal URLs (CORS) — this route does it server-side and
// returns a strict discriminated-union JSON response. Callers can paste
// either a `/portal` or a `/.well-known/portal.json` URL — both are valid
// manifest-discovery endpoints per spec Appendix E (draft in v0.1,
// normative in v0.2).
//
// Security posture:
//   1. In production only https:// is permitted. In dev, plain http:// is
//      allowed exclusively for loopback hosts so the dev reference portal
//      on :3075 works.
//   2. Every hostname is resolved via dns.lookup({all: true}) and each
//      returned IP is classified by ipaddr.js. Only 'unicast' (public)
//      addresses are accepted; any private / loopback / link-local /
//      unique-local / reserved / multicast / broadcast hit is rejected.
//      This defeats DNS rebinding.
//   3. A hard 5 s timeout via AbortController bounds the wait.
//   4. A 1 MB response cap prevents memory-blowup manifests.
//   5. Redirects are followed up to 3 hops; each hop re-runs the SSRF
//      guard (redirects cannot escape to a private address).
//   6. No client request headers are forwarded — the server constructs
//      its own minimal request.
//   7. Errors are returned as short, sanitised strings; raw stack traces
//      never cross the network boundary.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 1_000_000; // 1 MB
const MAX_REDIRECTS = 3;

type VisitResponse =
  | {
      ok: true;
      manifest: unknown;
      rawBytes: number;
      durationMs: number;
      status: number;
      finalUrl: string;
      validated: true;
    }
  | {
      ok: false;
      stage: "url" | "fetch" | "parse" | "validate";
      error: string;
      errors?: string[];
    };

export async function GET(req: Request): Promise<NextResponse<VisitResponse>> {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");

  // Rate limit per client IP before any outbound work. When Upstash env vars
  // are absent (dev), check() returns ok:true with an empty headers map.
  const ip = getClientIp(req);
  const rl = await rateLimitCheck(ip);
  const respond = (body: VisitResponse, status: number): NextResponse<VisitResponse> => {
    const res = NextResponse.json<VisitResponse>(body, { status });
    for (const [k, v] of Object.entries(rl.headers)) res.headers.set(k, v);
    return res;
  };

  if (!rl.ok) {
    return respond({ ok: false, stage: "url", error: "rate limit exceeded" }, 429);
  }

  if (!target) {
    return respond({ ok: false, stage: "url", error: "missing 'url' query parameter" }, 400);
  }

  const guard = await guardUrl(target);
  if (!guard.ok) {
    return respond({ ok: false, stage: "url", error: guard.error }, 400);
  }

  const started = Date.now();
  const fetched = await fetchManifest(guard.url);
  const durationMs = Date.now() - started;

  if (!fetched.ok) {
    return respond({ ok: false, stage: fetched.stage, error: fetched.error }, 502);
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(fetched.text);
  } catch (err) {
    return respond(
      { ok: false, stage: "parse", error: sanitise(err, "response body was not valid JSON") },
      502,
    );
  }

  const result = leanValidate(manifest);
  if (!result.ok) {
    return respond(
      {
        ok: false,
        stage: "validate",
        error: "manifest failed schema validation",
        errors: result.errors,
      },
      422,
    );
  }

  return respond(
    {
      ok: true,
      manifest,
      rawBytes: fetched.rawBytes,
      durationMs,
      status: fetched.status,
      finalUrl: fetched.finalUrl,
      validated: true,
    },
    200,
  );
}

// ---------- helpers ----------

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip")?.trim();
  if (xri) return xri;
  return "anon";
}

interface FetchOk {
  ok: true;
  text: string;
  rawBytes: number;
  status: number;
  finalUrl: string;
}
interface FetchBad {
  ok: false;
  stage: "fetch";
  error: string;
}

async function fetchManifest(url: URL): Promise<FetchOk | FetchBad> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let currentUrl = url;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(currentUrl.toString(), {
        method: "GET",
        signal: controller.signal,
        redirect: "manual",
        headers: {
          Accept: "application/json",
          "User-Agent": "visitportal.dev/live-visit (+https://visitportal.dev)",
        },
        cache: "no-store",
      });

      // Handle redirects manually so each hop re-enters the SSRF guard.
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc)
          return { ok: false, stage: "fetch", error: `${res.status} without Location header` };
        if (hop === MAX_REDIRECTS) {
          return { ok: false, stage: "fetch", error: `too many redirects (> ${MAX_REDIRECTS})` };
        }
        let next: URL;
        try {
          next = new URL(loc, currentUrl);
        } catch {
          return { ok: false, stage: "fetch", error: "malformed redirect target" };
        }
        const guard = await guardUrl(next.toString());
        if (!guard.ok) {
          return { ok: false, stage: "fetch", error: `redirect blocked: ${guard.error}` };
        }
        currentUrl = guard.url;
        continue;
      }

      if (!res.ok) {
        return { ok: false, stage: "fetch", error: `HTTP ${res.status} ${res.statusText}` };
      }

      const text = await readCapped(res, MAX_BODY_BYTES);
      if (text === null) {
        return {
          ok: false,
          stage: "fetch",
          error: `response body exceeded ${MAX_BODY_BYTES} bytes`,
        };
      }
      return {
        ok: true,
        text,
        rawBytes: byteLength(text),
        status: res.status,
        finalUrl: currentUrl.toString(),
      };
    }
    return { ok: false, stage: "fetch", error: "redirect loop" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (controller.signal.aborted) {
      return { ok: false, stage: "fetch", error: `timeout after ${FETCH_TIMEOUT_MS}ms` };
    }
    return { ok: false, stage: "fetch", error: sanitise(msg, "network error") };
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res: Response, limit: number): Promise<string | null> {
  if (!res.body) {
    const text = await res.text();
    return byteLength(text) > limit ? null : text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(buf);
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

function sanitise(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : fallback;
  // Strip anything that looks like a stack trace line.
  const firstLine = msg.split(/\r?\n/)[0] ?? fallback;
  return firstLine.slice(0, 240);
}
