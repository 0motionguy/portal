import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  JsonRpcError,
  McpCallToolResult,
  McpServerInfo,
  McpServerOptions,
  McpTool,
} from "./types.ts";

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface InitializeResult {
  serverInfo?: McpServerInfo;
  protocolVersion?: string;
}

const CLIENT_PROTOCOL_VERSION = "2025-03-26";

export class McpProtocolError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(message: string, code: number, data?: unknown) {
    super(message);
    this.name = "McpProtocolError";
    this.code = code;
    this.data = data;
  }
}

export class StdioMcpClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string | number, PendingRequest>();
  private readonly exitPromise: Promise<void>;
  private readonly stderrLines: string[] = [];
  private nextId = 1;
  private closed = false;
  serverInfo: McpServerInfo = { name: "unknown", version: "0.0.0" };

  private constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child;
    this.exitPromise = new Promise((resolve) => {
      child.once("exit", () => {
        this.closed = true;
        const error = new Error(this.buildExitMessage());
        for (const request of this.pending.values()) {
          request.reject(error);
        }
        this.pending.clear();
        resolve();
      });
    });
    this.attachReaders();
  }

  static async connect(options: McpServerOptions): Promise<StdioMcpClient> {
    const child = spawn(options.command, options.args ?? [], {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: "pipe",
    });

    const client = new StdioMcpClient(child);
    await client.initialize();
    return client;
  }

  async listTools(): Promise<McpTool[]> {
    const out: McpTool[] = [];
    let cursor: string | undefined;

    while (true) {
      const result = (await this.request("tools/list", cursor ? { cursor } : undefined)) as {
        tools?: unknown;
        nextCursor?: unknown;
      };
      if (Array.isArray(result.tools)) {
        for (const tool of result.tools) {
          if (isRecord(tool) && typeof tool.name === "string") {
            out.push({
              name: tool.name,
              ...(typeof tool.title === "string" ? { title: tool.title } : {}),
              ...(typeof tool.description === "string" ? { description: tool.description } : {}),
              ...(isRecord(tool.inputSchema) ? { inputSchema: tool.inputSchema } : {}),
            });
          }
        }
      }
      cursor = typeof result.nextCursor === "string" ? result.nextCursor : undefined;
      if (!cursor) return out;
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallToolResult> {
    const result = (await this.request("tools/call", {
      name,
      arguments: args,
    })) as {
      content?: unknown;
      structuredContent?: unknown;
      isError?: unknown;
    };

    return {
      content: Array.isArray(result.content) ? result.content : [],
      ...(isRecord(result.structuredContent)
        ? { structuredContent: result.structuredContent }
        : {}),
      ...(result.isError === true ? { isError: true } : {}),
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.child.stdin.end();
    const timedOut = await Promise.race([
      this.exitPromise.then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 200)),
    ]);
    if (timedOut) this.child.kill();
    await this.exitPromise;
  }

  private attachReaders(): void {
    const rl = createInterface({ input: this.child.stdout });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this.stderrLines.push(trimmed);
        if (this.stderrLines.length > 10) this.stderrLines.shift();
      }
    });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return;
      let message: unknown;
      try {
        message = JSON.parse(trimmed) as unknown;
      } catch {
        for (const request of this.pending.values()) {
          request.reject(new Error(`invalid MCP stdout line: ${trimmed}`));
        }
        this.pending.clear();
        return;
      }
      this.handleMessage(message);
    });
  }

  private handleMessage(message: unknown): void {
    if (!isRecord(message)) return;

    if ("id" in message && ("result" in message || "error" in message)) {
      this.handleResponse(message as unknown as JsonRpcResponse);
      return;
    }

    if ("method" in message && typeof message.method === "string") {
      this.handleServerRequest(message as unknown as JsonRpcRequest);
    }
  }

  private handleResponse(message: JsonRpcResponse): void {
    const request = this.pending.get(message.id);
    if (!request) return;
    this.pending.delete(message.id);

    if (message.error) {
      request.reject(
        new McpProtocolError(message.error.message, message.error.code, message.error.data),
      );
      return;
    }
    request.resolve(message.result);
  }

  private handleServerRequest(message: JsonRpcRequest): void {
    if (message.id === undefined) return;

    if (message.method === "ping") {
      this.write({ jsonrpc: "2.0", id: message.id, result: {} });
      return;
    }

    if (message.method === "roots/list") {
      this.write({ jsonrpc: "2.0", id: message.id, result: { roots: [] } });
      return;
    }

    this.write({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32601,
        message: `Unsupported server request: ${message.method}`,
      },
    });
  }

  private async initialize(): Promise<void> {
    const result = (await this.request("initialize", {
      protocolVersion: CLIENT_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "@visitportal/mcp-adapter",
        version: "0.0.0",
      },
    })) as InitializeResult;

    if (result.serverInfo) this.serverInfo = result.serverInfo;
    this.notify("notifications/initialized");
  }

  private async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const payload =
      params === undefined
        ? { jsonrpc: "2.0" as const, id, method }
        : { jsonrpc: "2.0" as const, id, method, params };

    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.write(payload);
    return promise;
  }

  private notify(method: string, params?: Record<string, unknown>): void {
    const payload =
      params === undefined
        ? { jsonrpc: "2.0" as const, method }
        : { jsonrpc: "2.0" as const, method, params };
    this.write(payload);
  }

  private write(message: unknown): void {
    if (this.closed) throw new Error("MCP client already closed");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private buildExitMessage(): string {
    if (this.stderrLines.length === 0) return "MCP server exited";
    return `MCP server exited: ${this.stderrLines.join(" | ")}`;
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
