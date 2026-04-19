import { type Portal } from "@visitportal/visit";
import type { CliFlags } from "./cli.ts";

const PROBE_TOOL_NAME = "__visitportal_cli_probe__";

export interface CommandResult {
  exitCode: number;
  output?: string;
}

export async function run(
  command: "info" | "call" | "conformance",
  portal: Portal,
  rest: readonly string[],
  flags: CliFlags,
): Promise<CommandResult> {
  switch (command) {
    case "info":
      return info(portal, flags);
    case "call":
      return call(portal, rest, flags);
    case "conformance":
      return conformance(portal, flags);
  }
}

function info(portal: Portal, flags: CliFlags): CommandResult {
  const m = portal.manifest;
  if (flags.json) {
    return { exitCode: 0, output: JSON.stringify(m, null, 2) };
  }
  const lines: string[] = [
    `Portal · ${m.name}`,
    `  ${m.brief}`,
    "",
    `  portal_version: ${m.portal_version}`,
    `  auth:           ${m.auth ?? "none"}`,
    `  pricing:        ${m.pricing?.model ?? "free"}${m.pricing?.rate ? ` (${m.pricing.rate})` : ""}`,
    `  call_endpoint:  ${m.call_endpoint}`,
    "",
    `  tools (${m.tools.length}):`,
  ];
  for (const t of m.tools) {
    const params = t.params ? Object.keys(t.params) : [];
    const paramSummary =
      t.params !== undefined
        ? `(${params.length ? params.join(", ") : "no params"})`
        : t.paramsSchema
          ? "(JSON Schema)"
          : "(free-form)";
    lines.push(`    · ${t.name} ${paramSummary}`);
    if (t.description) lines.push(`        ${t.description}`);
  }
  return { exitCode: 0, output: lines.join("\n") };
}

async function call(
  portal: Portal,
  rest: readonly string[],
  flags: CliFlags,
): Promise<CommandResult> {
  const tool = rest[0];
  if (!tool) {
    return {
      exitCode: 2,
      output: "error: 'call' requires a tool name. See `visit-portal --help`.",
    };
  }
  const params = flags.params ?? {};
  const result = await portal.call<unknown>(tool, params);
  return {
    exitCode: 0,
    output: flags.json ? JSON.stringify(result, null, 2) : stringify(result),
  };
}

async function conformance(portal: Portal, flags: CliFlags): Promise<CommandResult> {
  const failures: string[] = [];
  const passes: string[] = [];
  passes.push(`manifest valid (tools: ${portal.tools.length})`);

  // Probe with a tool name that MUST NOT exist on the provider. We go direct
  // to call_endpoint (bypassing @visitportal/visit.call, which would throw
  // ToolNotInManifest client-side before the request ever hits the wire —
  // that would let non-conforming providers falsely PASS).
  try {
    const res = await fetch(portal.manifest.call_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: PROBE_TOOL_NAME, params: {} }),
    });
    if (!res.ok) {
      failures.push(
        `NOT_FOUND probe got HTTP ${res.status} — expected 200 with NOT_FOUND envelope`,
      );
    } else {
      const body = (await res.json()) as unknown;
      if (!isNotFoundEnvelope(body)) {
        failures.push(
          `NOT_FOUND probe returned wrong envelope: ${JSON.stringify(body)}`,
        );
      } else {
        passes.push("NOT_FOUND probe round-tripped with correct envelope");
      }
    }
  } catch (e) {
    failures.push(`NOT_FOUND probe failed unexpectedly: ${describe(e)}`);
  }

  const body = flags.json
    ? JSON.stringify({ passes, failures }, null, 2)
    : [
        ...passes.map((p) => `  ✓ ${p}`),
        ...failures.map((f) => `  ✗ ${f}`),
      ].join("\n");
  return { exitCode: failures.length === 0 ? 0 : 1, output: body };
}

function isNotFoundEnvelope(
  x: unknown,
): x is { ok: false; code: "NOT_FOUND"; error: string } {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    r.ok === false && r.code === "NOT_FOUND" && typeof r.error === "string"
  );
}

function stringify(x: unknown): string {
  if (typeof x === "string") return x;
  return JSON.stringify(x, null, 2);
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
