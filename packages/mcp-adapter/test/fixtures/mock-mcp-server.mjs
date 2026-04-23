import { createInterface } from "node:readline";

const tools = [
  {
    name: "echo-tool",
    description: "Echo text back to the caller.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "message to echo" },
      },
      required: ["text"],
    },
  },
  {
    name: "sum",
    description: "Add two numbers.",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" },
      },
      required: ["a", "b"],
    },
  },
  {
    name: "broken",
    description: "Always errors.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);

  if (msg.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion ?? "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "Mock MCP", version: "0.1.0" },
      },
    });
    return;
  }

  if (msg.method === "notifications/initialized") return;

  if (msg.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: { tools },
    });
    return;
  }

  if (msg.method === "tools/call") {
    const name = msg.params?.name;
    const args = msg.params?.arguments ?? {};

    if (name === "echo-tool") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          content: [{ type: "text", text: String(args.text ?? "") }],
          structuredContent: { echoed: String(args.text ?? "") },
        },
      });
      return;
    }

    if (name === "sum") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          content: [{ type: "text", text: String(Number(args.a ?? 0) + Number(args.b ?? 0)) }],
        },
      });
      return;
    }

    if (name === "broken") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          isError: true,
          content: [{ type: "text", text: "mock tool failure" }],
        },
      });
      return;
    }

    send({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32601, message: `unknown tool: ${name}` },
    });
  }
});
