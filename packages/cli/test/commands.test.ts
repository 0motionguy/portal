import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServer, type Server } from "node:http";
import { visit } from "@visitportal/visit";
import { run } from "../src/commands.ts";

// Spin up an in-process Portal for the CLI commands. Same shape as the SDK's
// own tests — the CLI is just a consumer.

let server: Server;
let baseUrl = "";

const manifest = (callEndpoint: string) => ({
  portal_version: "0.1",
  name: "Test",
  brief: "A test portal for the CLI.",
  tools: [
    {
      name: "echo",
      description: "returns the params back",
      params: { msg: { type: "string", required: true } },
    },
  ],
  call_endpoint: callEndpoint,
  auth: "none" as const,
  pricing: { model: "free" as const },
});

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "";
    const method = req.method ?? "";
    if (method === "GET" && url === "/portal") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(manifest(`${baseUrl}/portal/call`)));
      return;
    }
    if (method === "POST" && url === "/portal/call") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          tool: string;
          params: { msg?: string };
        };
        res.writeHead(200, { "content-type": "application/json" });
        if (body.tool === "echo") {
          res.end(JSON.stringify({ ok: true, result: { echoed: body.params.msg } }));
          return;
        }
        res.end(
          JSON.stringify({
            ok: false,
            error: `tool '${body.tool}' not in manifest`,
            code: "NOT_FOUND",
          }),
        );
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe("info", () => {
  test("prints a summary including tool names", async () => {
    const p = await visit(`${baseUrl}/portal`);
    const r = await run("info", p, [], { help: false, json: false });
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("Portal · Test");
    expect(r.output).toContain("echo");
    expect(r.output).toContain("msg");
  });

  test("json mode emits valid parseable JSON", async () => {
    const p = await visit(`${baseUrl}/portal`);
    const r = await run("info", p, [], { help: false, json: true });
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.output ?? "") as { name: string };
    expect(parsed.name).toBe("Test");
  });
});

describe("call", () => {
  test("invokes a tool and returns stringified result", async () => {
    const p = await visit(`${baseUrl}/portal`);
    const r = await run("call", p, ["echo"], {
      help: false,
      json: false,
      params: { msg: "hi" },
    });
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("echoed");
    expect(r.output).toContain("hi");
  });

  test("errors when tool name is missing", async () => {
    const p = await visit(`${baseUrl}/portal`);
    const r = await run("call", p, [], { help: false, json: false });
    expect(r.exitCode).toBe(2);
    expect(r.output).toContain("requires a tool name");
  });

  test("json mode", async () => {
    const p = await visit(`${baseUrl}/portal`);
    const r = await run("call", p, ["echo"], {
      help: false,
      json: true,
      params: { msg: "x" },
    });
    const parsed = JSON.parse(r.output ?? "") as { echoed: string };
    expect(parsed.echoed).toBe("x");
  });
});

describe("conformance", () => {
  test("passes when manifest valid and NOT_FOUND probe round-trips", async () => {
    const p = await visit(`${baseUrl}/portal`);
    const r = await run("conformance", p, [], { help: false, json: false });
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("manifest valid");
    expect(r.output).toContain("NOT_FOUND probe");
  });
});
