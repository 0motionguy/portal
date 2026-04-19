#!/usr/bin/env -S node --import tsx
import {
  CallFailed,
  ManifestInvalid,
  type Portal,
  PortalNotFound,
  ToolNotInManifest,
  visit,
} from "@visitportal/visit";
import { run, type CommandResult } from "./commands.ts";

const argv = process.argv.slice(2);
const { command, url, rest, flags } = parseArgs(argv);

if (flags.help || !command) {
  printHelp();
  process.exit(flags.help ? 0 : 2);
}
if (!url) {
  process.stderr.write("error: missing <portal-url>\n\n");
  printHelp();
  process.exit(2);
}

try {
  const portal = await visit(url, { timeoutMs: flags.timeout ?? 10_000 });
  const result = await run(command, portal, rest, flags);
  emit(result);
  process.exit(result.exitCode);
} catch (e) {
  process.exit(handleError(e));
}

function emit(result: CommandResult): void {
  if (result.output !== undefined) {
    process.stdout.write(result.output);
    if (!result.output.endsWith("\n")) process.stdout.write("\n");
  }
}

function handleError(e: unknown): number {
  if (e instanceof PortalNotFound) {
    process.stderr.write(`error: could not reach portal at ${e.url}\n  ${describe(e.reason)}\n`);
    return 3;
  }
  if (e instanceof ManifestInvalid) {
    process.stderr.write(`error: manifest at ${e.url} is invalid\n`);
    for (const msg of e.errors.slice(0, 5)) process.stderr.write(`  ${msg}\n`);
    return 4;
  }
  if (e instanceof ToolNotInManifest) {
    process.stderr.write(`error: ${e.message}\n`);
    return 5;
  }
  if (e instanceof CallFailed) {
    process.stderr.write(`error: ${e.message}\n`);
    return 6;
  }
  process.stderr.write(`error: ${describe(e)}\n`);
  return 1;
}

interface ParsedArgs {
  command: "info" | "call" | "conformance" | null;
  url: string | null;
  rest: string[];
  flags: CliFlags;
}

export interface CliFlags {
  help: boolean;
  json: boolean;
  timeout?: number;
  params?: Record<string, unknown>;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags: CliFlags = { help: false, json: false };
  const rest: string[] = [];
  let command: ParsedArgs["command"] = null;
  let url: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i] as string;
    if (tok === "-h" || tok === "--help") {
      flags.help = true;
      continue;
    }
    if (tok === "--json") {
      flags.json = true;
      continue;
    }
    if (tok === "--timeout") {
      const next = argv[++i];
      if (next) flags.timeout = Number(next);
      continue;
    }
    if (tok === "--params") {
      const next = argv[++i];
      if (next) {
        try {
          flags.params = JSON.parse(next) as Record<string, unknown>;
        } catch {
          process.stderr.write(`error: --params must be valid JSON\n`);
          process.exit(2);
        }
      }
      continue;
    }
    if (!command) {
      if (tok === "info" || tok === "call" || tok === "conformance") {
        command = tok;
      } else {
        process.stderr.write(`error: unknown command '${tok}'\n\n`);
        printHelp();
        process.exit(2);
      }
      continue;
    }
    if (!url) {
      url = tok;
      continue;
    }
    rest.push(tok);
  }
  return { command, url, rest, flags };
}

function printHelp(): void {
  process.stdout.write(
    `visit-portal — drive-by tool invocation against any Portal

USAGE:
  visit-portal info <portal-url>
  visit-portal call <portal-url> <tool> [--params '{...}']
  visit-portal conformance <portal-url>

COMMANDS:
  info         Fetch the manifest, print name/brief/tools summary.
  call         Invoke one tool; pass params as JSON via --params.
  conformance  Validate manifest + probe NOT_FOUND round-trip.

FLAGS:
  --json             Emit JSON (for piping into jq / scripts).
  --timeout <ms>     Fetch + call timeout (default 10000).
  -h, --help         This help.

EXAMPLES:
  visit-portal info http://localhost:3075/portal
  visit-portal call http://localhost:3075/portal top_gainers --params '{"limit":3}'
  visit-portal conformance http://localhost:3075/portal
`,
  );
}

export type { Portal };

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
