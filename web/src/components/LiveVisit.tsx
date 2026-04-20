"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Interactive "visit a portal live" widget. Lives in section §06 of the
// one-pager. Form submission → /api/visit proxy → terminal-styled output
// streams in line by line for a live feel.
//
// State machine: idle → fetching → success | error
//
// The API response is a discriminated union mirrored on both sides of
// the wire; see web/app/api/visit/route.ts for the server-side type.

type Line =
  | { kind: "info"; text: string }
  | { kind: "ok"; text: string }
  | { kind: "warn"; text: string }
  | { kind: "err"; text: string };

interface ApiSuccess {
  ok: true;
  manifest: Manifest;
  rawBytes: number;
  durationMs: number;
  status: number;
  finalUrl: string;
  validated: true;
}
interface ApiError {
  ok: false;
  stage: "url" | "fetch" | "parse" | "validate";
  error: string;
  errors?: string[];
}
type ApiResponse = ApiSuccess | ApiError;

interface Manifest {
  name?: unknown;
  tools?: unknown;
  [k: string]: unknown;
}

type Phase = "idle" | "fetching" | "success" | "error";

const DEFAULT_URL = "https://demo.visitportal.dev/portal";
const LINE_STAGGER_MS = 110;

export default function LiveVisit(): React.ReactElement {
  const [url, setUrl] = useState<string>(DEFAULT_URL);
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const stagger = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Drop pending stagger timers on unmount or restart.
  const clearStagger = useCallback((): void => {
    for (const t of stagger.current) clearTimeout(t);
    stagger.current = [];
  }, []);
  useEffect(() => clearStagger, [clearStagger]);

  // Render lines one-by-one. Each line lands on its own setTimeout so the
  // browser has a chance to paint between them — cheaper than requestAnimationFrame
  // loops and predictable.
  const renderStaggered = useCallback(
    (nextLines: Line[], onComplete?: () => void): void => {
      clearStagger();
      setLines([]);
      nextLines.forEach((line, i) => {
        const t = setTimeout(() => {
          setLines((prev) => [...prev, line]);
          if (i === nextLines.length - 1 && onComplete) onComplete();
        }, i * LINE_STAGGER_MS);
        stagger.current.push(t);
      });
    },
    [clearStagger],
  );

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (phase === "fetching") return;
      clearStagger();
      setPhase("fetching");
      setLines([{ kind: "info", text: `→ GET ${url} ...` }]);

      let resp: ApiResponse;
      try {
        const r = await fetch(`/api/visit?url=${encodeURIComponent(url)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        resp = (await r.json()) as ApiResponse;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "network error";
        renderStaggered(
          [
            { kind: "err", text: `→ proxy error: ${msg}` },
            { kind: "warn", text: "  (check the dev server logs)" },
          ],
          () => setPhase("error"),
        );
        return;
      }

      if (resp.ok) {
        const { manifest, rawBytes, durationMs, status } = resp;
        const name = typeof manifest.name === "string" ? manifest.name : "(unnamed)";
        const tools = Array.isArray(manifest.tools) ? manifest.tools : [];
        const toolNames = tools
          .map((t) => (isRecord(t) && typeof t.name === "string" ? t.name : null))
          .filter((n): n is string => n !== null);
        const tokens = Math.ceil(rawBytes / 4);

        const out: Line[] = [
          { kind: "ok", text: `→ GET /portal ............. ${status} OK (${durationMs}ms)` },
          { kind: "info", text: `→ manifest name: "${name}"` },
          {
            kind: "info",
            text:
              toolNames.length > 0
                ? `→ ${toolNames.length} tools: ${toolNames.join(", ")}`
                : "→ manifest declared zero tools",
          },
          { kind: "info", text: "→ validated against spec lean-validator  ✓" },
          {
            kind: "info",
            text: `→ context cost: ~${tokens.toLocaleString()} tokens*`,
          },
        ];
        renderStaggered(out, () => setPhase("success"));
        return;
      }

      // Error branch — narrow on `stage` so messages name the failure
      // honestly.
      const stageLabel = resp.stage.toUpperCase();
      const errs: Line[] = [{ kind: "err", text: `→ ${stageLabel} failed: ${resp.error}` }];
      if (resp.errors && resp.errors.length > 0) {
        for (const e of resp.errors.slice(0, 8)) {
          errs.push({ kind: "warn", text: `    · ${e}` });
        }
        if (resp.errors.length > 8) {
          errs.push({ kind: "warn", text: `    · (+${resp.errors.length - 8} more)` });
        }
      }
      renderStaggered(errs, () => setPhase("error"));
    },
    [url, phase, clearStagger, renderStaggered],
  );

  return (
    <div className="live-visit">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lv-term">
        <div className="lv-chrome">
          <div className="lv-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="lv-title">visit a portal — live</div>
          <div className="lv-spacer" aria-hidden="true" />
        </div>

        <form className="lv-form" onSubmit={onSubmit}>
          <span className="lv-prompt" aria-hidden="true">
            ~/scratch <span className="lv-caret">❯</span>
          </span>
          <input
            className="lv-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-service/portal"
            spellCheck={false}
            autoComplete="off"
            inputMode="url"
            aria-label="Portal URL"
            required
          />
          <button
            className="lv-btn"
            type="submit"
            disabled={phase === "fetching"}
            aria-live="polite"
          >
            {phase === "fetching" ? "visiting..." : "VISIT"}
          </button>
        </form>

        <div className="lv-out" aria-live="polite" aria-atomic="false">
          {lines.length === 0 ? (
            <div className="lv-placeholder">
              press VISIT to fetch the manifest over the wire. the fetch is proxied through{" "}
              <span className="lv-inline">/api/visit</span> so CORS-free servers work too.
            </div>
          ) : (
            lines.map((line, i) => (
              // Lines are append-only in render order; index is stable for the
              // lifetime of a given visit and the list never reorders.
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only render list
              <div key={i} className={`lv-line lv-${line.kind}`}>
                {line.text}
              </div>
            ))
          )}
          {phase === "success" && (
            <div className="lv-foot">
              * estimated at 4 chars/token; the{" "}
              <a href="/bench" className="lv-link">
                bench
              </a>{" "}
              uses real Anthropic <span className="lv-inline">count_tokens</span>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

// Scoped styles — inline so this component stays self-contained with the
// one-pager's `--term-*` tokens (defined in :root at the top of styles).
const CSS = `
  .live-visit { margin: 28px 0 16px; }
  .lv-term {
    background: var(--term-bg);
    color: var(--term-fg);
    border-radius: 8px;
    box-shadow: 0 40px 80px -20px rgba(24, 24, 24, 0.3), 0 0 0 1px rgba(24, 24, 24, 0.1);
    overflow: hidden;
    font-family: 'Geist Mono', monospace;
  }
  .lv-chrome {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    background: #232120;
    border-bottom: 1px solid rgba(238, 231, 213, 0.08);
  }
  .lv-dots { display: flex; gap: 8px; }
  .lv-dots span {
    width: 12px; height: 12px; border-radius: 50%;
  }
  .lv-dots span:nth-child(1) { background: #c4623f; }
  .lv-dots span:nth-child(2) { background: #d4a574; }
  .lv-dots span:nth-child(3) { background: #7fa87c; }
  .lv-title {
    flex: 1;
    text-align: center;
    font-size: 12px;
    color: var(--term-dim);
    letter-spacing: 0.02em;
  }
  .lv-spacer { width: 52px; } /* balance the dots block */

  .lv-form {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 20px 28px 12px;
    font-size: 13px;
    flex-wrap: wrap;
  }
  .lv-prompt {
    color: var(--term-dim);
    white-space: nowrap;
  }
  .lv-caret { color: var(--term-coral); }
  .lv-input {
    flex: 1;
    min-width: 220px;
    background: transparent;
    color: var(--term-fg);
    font: inherit;
    padding: 6px 10px;
    border: 1px solid rgba(238, 231, 213, 0.14);
    border-radius: 4px;
    caret-color: var(--term-coral);
    outline: none;
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }
  .lv-input:focus {
    border-color: var(--term-coral);
    box-shadow: 0 0 0 2px rgba(232, 139, 106, 0.25);
  }
  .lv-input::placeholder { color: var(--term-dim); }
  .lv-btn {
    background: var(--term-coral);
    color: #1a1817;
    font: inherit;
    font-size: 12px;
    letter-spacing: 0.04em;
    font-weight: 600;
    padding: 6px 14px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 120ms ease, opacity 120ms ease;
  }
  .lv-btn:hover:not(:disabled) { background: #d27957; }
  .lv-btn:disabled { opacity: 0.55; cursor: progress; }

  .lv-out {
    padding: 8px 28px 24px;
    font-size: 13px;
    line-height: 1.7;
    min-height: 120px;
    border-top: 1px dashed rgba(238, 231, 213, 0.07);
    margin-top: 8px;
  }
  .lv-placeholder {
    color: var(--term-dim);
    padding-top: 8px;
    font-size: 12px;
    line-height: 1.6;
  }
  .lv-line {
    white-space: pre-wrap;
    word-break: break-word;
    animation: lv-fade-in 220ms ease-out both;
  }
  .lv-info { color: var(--dim-soft); }
  .lv-ok   { color: var(--term-green); }
  .lv-warn { color: var(--term-amber); }
  .lv-err  { color: var(--term-coral); }
  .lv-inline {
    font-family: inherit;
    background: rgba(238, 231, 213, 0.08);
    padding: 1px 6px;
    border-radius: 3px;
    color: var(--term-fg);
  }
  .lv-link {
    color: var(--term-amber);
    text-decoration: underline;
    text-decoration-color: rgba(212, 165, 116, 0.4);
    text-underline-offset: 2px;
  }
  .lv-link:hover { color: var(--term-coral); }
  .lv-foot {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed rgba(238, 231, 213, 0.07);
    font-size: 11px;
    color: var(--term-dim);
  }

  @keyframes lv-fade-in {
    from { opacity: 0; transform: translateY(2px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 560px) {
    .lv-form { padding: 16px 18px 10px; }
    .lv-out  { padding: 8px 18px 20px; }
  }
`;
