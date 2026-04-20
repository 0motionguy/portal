// Tiny mock Portal for smoke-testing the live conformance runner.
// Not part of the published spec package — but bundled with the conformance
// tools so anyone can verify the runner works end-to-end without deploying.
//
//   tsx packages/spec/conformance/mock-server.ts
//   # then in another shell:
//   pnpm conformance http://127.0.0.1:3999/portal

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 3999);

const manifest = {
  portal_version: "0.1",
  name: "Mock",
  brief: "Smoke-test Portal for the conformance runner.",
  tools: [{ name: "echo", description: "returns the params verbatim" }],
  call_endpoint: `http://127.0.0.1:${PORT}/portal/call`,
  auth: "none",
  pricing: { model: "free" },
};

const server = createServer(async (req, res) => {
  const url = req.url ?? "/";
  if (req.method === "GET" && url === "/portal") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(manifest));
    return;
  }
  if (req.method === "POST" && url === "/portal/call") {
    const body = await readBody(req);
    let parsed: { tool: string; params: Record<string, unknown> };
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "invalid JSON body", code: "INVALID_PARAMS" }));
      return;
    }
    if (parsed.tool === "echo") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: parsed.params }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: false,
        error: `tool '${parsed.tool}' not in manifest`,
        code: "NOT_FOUND",
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock portal listening on http://127.0.0.1:${PORT}/portal`);
});
