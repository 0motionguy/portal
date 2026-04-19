import { NextResponse } from "next/server";
import { leanValidate } from "@/lib/lean-validator";

// GET /api/visit?url=<portal-url>
//
// Same-origin proxy for the LiveVisit widget. The browser cannot fetch
// arbitrary Portal URLs (CORS) — this route does it server-side and
// returns a strict discriminated-union JSON response.
//
// Security posture:
//   1. Only https:// is permitted for non-loopback hosts — the loopback
//      exception (localhost / 127.0.0.1 / ::1) exists so the dev reference
//      portal on :3075 works. Every other http:// URL is rejected as a
//      potential SSRF against the internal network.
//   2. A hard 5 s timeout via AbortController bounds the wait.
//   3. A 1 MB response cap prevents memory-blowup manifests.
//   4. Redirects are followed up to 3 hops; each hop revalidates the host
//      against the same SSRF rules (redirects cannot escape to a private
//      address).
//   5. No client request headers are forwarded — the server constructs
//      its own minimal request.
//   6. Errors are returned as short, sanitised strings; raw stack traces
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

  if (!target) {
    return jsonError("url", "missing 'url' query parameter", 400);
  }

  const guard = guardUrl(target);
  if (!guard.ok) {
    return jsonError("url", guard.error, 400);
  }

  const started = Date.now();
  const fetched = await fetchManifest(guard.url);
  const durationMs = Date.now() - started;

  if (!fetched.ok) {
    return jsonError(fetched.stage, fetched.error, 502);
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(fetched.text);
  } catch (err) {
    return jsonError("parse", sanitise(err, "response body was not valid JSON"), 502);
  }

  const result = leanValidate(manifest);
  if (!result.ok) {
    return NextResponse.json<VisitResponse>(
      {
        ok: false,
        stage: "validate",
        error: "manifest failed schema validation",
        errors: result.errors,
      },
      { status: 422 },
    );
  }

  return NextResponse.json<VisitResponse>({
    ok: true,
    manifest,
    rawBytes: fetched.rawBytes,
    durationMs,
    status: fetched.status,
    finalUrl: fetched.finalUrl,
    validated: true,
  });
}

// ---------- helpers ----------

type Stage = "url" | "fetch" | "parse" | "validate";

function jsonError(stage: Stage, error: string, status: number) {
  return NextResponse.json<VisitResponse>({ ok: false, stage, error }, { status });
}

interface UrlGuardOk {
  ok: true;
  url: URL;
}
interface UrlGuardBad {
  ok: false;
  error: string;
}

function guardUrl(raw: string): UrlGuardOk | UrlGuardBad {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "url: not a valid URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: `url: protocol '${u.protocol.replace(/:$/, "")}' not allowed` };
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol === "http:" && !isLoopback(host)) {
    return {
      ok: false,
      error: "url: plain http:// is only allowed for localhost / 127.0.0.1 / ::1",
    };
  }
  // Even for https://, block obviously-private literal addresses to reduce
  // the SSRF surface. Real-world Portals live on public hosts.
  if (isPrivateOrReserved(host) && !isLoopback(host)) {
    return { ok: false, error: `url: host '${host}' is a private or reserved address` };
  }
  return { ok: true, url: u };
}

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

// Blocks IPv4 literal ranges that should never be addressed from a public
// fetcher: RFC1918, link-local, CGNAT, metadata services. Public DNS names
// that resolve to private IPs still slip through this check — this is a
// defence-in-depth measure, not a complete SSRF solution.
function isPrivateOrReserved(host: string): boolean {
  // IPv4 literal?
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b, _c, _d] = m.slice(1).map((s) => Number.parseInt(s, 10));
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + AWS/GCP metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 0) return true;
    if (a >= 224) return true; // multicast / reserved
  }
  // IPv6 literal? Block unique-local, link-local, and loopback cases
  // beyond ::1 which is already handled by isLoopback.
  if (host.includes(":")) {
    const h = host.replace(/^\[|\]$/g, "").toLowerCase();
    if (h.startsWith("fc") || h.startsWith("fd")) return true; // fc00::/7
    if (h.startsWith("fe80")) return true; // link-local
    if (h.startsWith("ff")) return true; // multicast
  }
  return false;
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
        if (!loc) return { ok: false, stage: "fetch", error: `${res.status} without Location header` };
        if (hop === MAX_REDIRECTS) {
          return { ok: false, stage: "fetch", error: `too many redirects (> ${MAX_REDIRECTS})` };
        }
        let next: URL;
        try {
          next = new URL(loc, currentUrl);
        } catch {
          return { ok: false, stage: "fetch", error: "malformed redirect target" };
        }
        const guard = guardUrl(next.toString());
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
        return { ok: false, stage: "fetch", error: `response body exceeded ${MAX_BODY_BYTES} bytes` };
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
