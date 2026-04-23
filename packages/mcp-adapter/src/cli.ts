#!/usr/bin/env node
import { createServer } from "node:http";
import { URL } from "node:url";
import { adaptMcpServer } from "./adapter.ts";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const mcpValue = readFlag("--mcp");
if (!mcpValue) {
  console.error('error: --mcp "<command>" is required');
  process.exit(2);
}

const [command, ...commandArgs] = splitCommand(mcpValue);
if (!command) {
  console.error("error: --mcp did not contain a command");
  process.exit(2);
}

const port = Number(readFlag("--port") ?? "8080");
const host = readFlag("--host") ?? "127.0.0.1";
const name = readFlag("--name");
const brief = readFlag("--brief");
const adapterOptions = {
  command,
  args: commandArgs,
  ...(name !== undefined ? { name } : {}),
  ...(brief !== undefined ? { brief } : {}),
};

const adapter = await adaptMcpServer(adapterOptions);

const server = createServer(async (req, res) => {
  const fullUrl = new URL(req.url ?? "/", `http://${host}:${port}`);
  const headers = Object.fromEntries(
    Object.entries(req.headers).flatMap(([key, value]) =>
      Array.isArray(value) ? [[key, value.join(", ")]] : value === undefined ? [] : [[key, value]],
    ),
  );

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    body = Buffer.concat(chunks).toString("utf8");
  }

  const method = req.method ?? "GET";
  const request = new Request(fullUrl, {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
  });
  const response = await adapter.portal.fetch(request);

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
});

server.listen(port, host, () => {
  console.log(`visitportal-mcp-adapter listening on http://${host}:${port}`);
  console.log(`  MCP: ${mcpValue}`);
  console.log(`  Portal manifest: http://${host}:${port}/portal`);
});

const shutdown = async () => {
  server.close();
  await adapter.close();
};

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});

function readFlag(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function splitCommand(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if ((char === '"' || char === "'") && quote === null) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (char === " " && quote === null) {
      if (current.length > 0) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0) parts.push(current);
  return parts;
}

function printHelp(): void {
  console.log(`visitportal-mcp-adapter

USAGE:
  visitportal-mcp-adapter --mcp "<command ...>" [--port 8080] [--host 127.0.0.1]

FLAGS:
  --mcp    Command used to launch the MCP stdio server
  --port   Local HTTP port to expose as a Portal (default 8080)
  --host   Bind host (default 127.0.0.1)
  --name   Override manifest name
  --brief  Override manifest brief
`);
}
