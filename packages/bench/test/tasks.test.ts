import { type Server, createServer } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  AnthropicApiError,
  type CountTokensRequest,
  type MessageRequest,
  type MessageResponse,
  TASKS,
  createAnthropicClient,
  createMockClient,
} from "../src/tasks/index.ts";

interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

type Responder = (req: RecordedRequest) => {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
};

let server: Server;
let baseUrl = "";
let responder: Responder | null = null;
const recorded: RecordedRequest[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = undefined;
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      const record: RecordedRequest = {
        method: req.method ?? "GET",
        path: req.url ?? "/",
        headers: req.headers,
        body,
      };
      recorded.push(record);
      if (!responder) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { type: "test_missing_responder" } }));
        return;
      }
      const out = responder(record);
      res.writeHead(out.status, {
        "content-type": "application/json",
        ...(out.headers ?? {}),
      });
      res.end(typeof out.body === "string" ? out.body : JSON.stringify(out.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  recorded.length = 0;
  responder = null;
});

afterEach(() => {
  responder = null;
});

function makeClient(overrides: { apiKey?: string; maxRetries?: number } = {}) {
  return createAnthropicClient({
    apiKey: overrides.apiKey ?? "sk-test-123",
    baseUrl,
    sleep: async () => {},
    ...(overrides.maxRetries !== undefined ? { maxRetries: overrides.maxRetries } : {}),
  });
}

describe("TASKS", () => {
  test("has exactly 3 entries", () => {
    expect(TASKS).toHaveLength(3);
  });

  test("covers the three reference tools exactly once each", () => {
    const tools = TASKS.map((t) => t.expectedTool).sort();
    expect(tools).toEqual(["maintainer_profile", "search_repos", "top_gainers"]);
  });

  test("all three tasks share the same system prompt (experimental control)", () => {
    const [a, b, c] = TASKS;
    if (!a || !b || !c) throw new Error("unexpected TASKS length");
    expect(a.system).toBe(b.system);
    expect(b.system).toBe(c.system);
  });

  test("system prompt is short, neutral, and mentions no tool name", () => {
    const sys = TASKS[0]?.system ?? "";
    expect(sys.length).toBeGreaterThan(0);
    expect(sys.length).toBeLessThan(400);
    expect(sys).not.toMatch(/top_gainers|search_repos|maintainer_profile/);
    expect(sys.toLowerCase()).not.toContain("portal");
    expect(sys.toLowerCase()).not.toContain("mcp");
  });

  test("each task id is unique and matches the expected literal union", () => {
    const ids = TASKS.map((t) => t.id).sort();
    expect(ids).toEqual(["find_trending_ai", "search_agent_protocol", "summarize_repo"]);
  });

  test("user messages cold-read to the right tool", () => {
    const byId = new Map(TASKS.map((t) => [t.id, t] as const));
    const gainers = byId.get("find_trending_ai");
    const profile = byId.get("summarize_repo");
    const search = byId.get("search_agent_protocol");
    if (!gainers || !profile || !search) throw new Error("missing tasks");
    expect(gainers.user.toLowerCase()).toContain("top");
    expect(profile.user.toLowerCase()).toContain("maintainer");
    expect(profile.user).toContain("charliermarsh");
    expect(search.user.toLowerCase()).toContain("search");
  });
});

describe("createAnthropicClient.countTokens", () => {
  test("POSTs to /v1/messages/count_tokens with the correct headers and body", async () => {
    responder = () => ({ status: 200, body: { input_tokens: 42 } });
    const client = makeClient({ apiKey: "sk-abc" });
    const req: CountTokensRequest = {
      model: "claude-sonnet-4-5",
      system: "you are helpful",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
    };
    const res = await client.countTokens(req);
    expect(res.input_tokens).toBe(42);
    expect(recorded).toHaveLength(1);
    const r = recorded[0];
    if (!r) throw new Error("missing request");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/v1/messages/count_tokens");
    expect(r.headers["x-api-key"]).toBe("sk-abc");
    expect(r.headers["anthropic-version"]).toBe("2023-06-01");
    expect(r.headers["content-type"]).toContain("application/json");
    expect(r.body).toEqual(req);
  });

  test("retries on 429 then 503 and eventually succeeds", async () => {
    let calls = 0;
    responder = () => {
      calls++;
      if (calls === 1)
        return { status: 429, body: { error: { type: "rate_limit_error", message: "slow down" } } };
      if (calls === 2)
        return { status: 503, body: { error: { type: "overloaded_error", message: "busy" } } };
      return { status: 200, body: { input_tokens: 9 } };
    };
    const client = makeClient();
    const res = await client.countTokens({
      model: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "x" }],
    });
    expect(res.input_tokens).toBe(9);
    expect(calls).toBe(3);
  });

  test("gives up after 3 retries on persistent 429 and throws AnthropicApiError", async () => {
    let calls = 0;
    responder = () => {
      calls++;
      return { status: 429, body: { error: { type: "rate_limit_error", message: "nope" } } };
    };
    const client = makeClient({ maxRetries: 3 });
    const err = await client
      .countTokens({ model: "claude-sonnet-4-5", messages: [{ role: "user", content: "x" }] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnthropicApiError);
    expect((err as AnthropicApiError).status).toBe(429);
    expect((err as AnthropicApiError).code).toBe("rate_limit_error");
    expect(calls).toBe(4);
  });

  test("surfaces 400 invalid_request_error without retry", async () => {
    let calls = 0;
    responder = () => {
      calls++;
      return {
        status: 400,
        body: {
          type: "error",
          error: { type: "invalid_request_error", message: "model foo not found" },
        },
      };
    };
    const client = makeClient();
    const err = await client
      .countTokens({ model: "claude-bogus", messages: [{ role: "user", content: "x" }] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnthropicApiError);
    expect((err as AnthropicApiError).status).toBe(400);
    expect((err as AnthropicApiError).code).toBe("invalid_request_error");
    expect((err as AnthropicApiError).message).toContain("model foo not found");
    expect(calls).toBe(1);
  });

  test("captures request-id header on error", async () => {
    responder = () => ({
      status: 401,
      headers: { "request-id": "req_xyz_123" },
      body: { error: { type: "authentication_error", message: "bad key" } },
    });
    const client = makeClient();
    const err = await client
      .countTokens({ model: "claude-sonnet-4-5", messages: [{ role: "user", content: "x" }] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnthropicApiError);
    expect((err as AnthropicApiError).requestId).toBe("req_xyz_123");
    expect((err as AnthropicApiError).code).toBe("authentication_error");
  });

  test("throws on malformed success body", async () => {
    responder = () => ({ status: 200, body: { wrong_field: 1 } });
    const client = makeClient();
    const err = await client
      .countTokens({ model: "claude-sonnet-4-5", messages: [{ role: "user", content: "x" }] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnthropicApiError);
    expect((err as AnthropicApiError).code).toBe("invalid_response");
  });
});

describe("createAnthropicClient.sendMessage", () => {
  test("POSTs to /v1/messages with max_tokens and returns content + usage", async () => {
    responder = () => ({
      status: 200,
      body: {
        id: "msg_abc",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5",
        content: [
          {
            type: "tool_use",
            id: "toolu_01",
            name: "top_gainers",
            input: { limit: 3 },
          },
        ],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: { input_tokens: 120, output_tokens: 25 },
      },
    });
    const client = makeClient();
    const req: MessageRequest = {
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: "sys",
      messages: [{ role: "user", content: "top 3" }],
      tools: [
        {
          name: "top_gainers",
          description: "Top N repos by weekly delta",
          input_schema: { type: "object", properties: { limit: { type: "number" } } },
        },
      ],
      tool_choice: { type: "auto" },
    };
    const res: MessageResponse = await client.sendMessage(req);
    expect(res.stop_reason).toBe("tool_use");
    expect(res.usage.input_tokens).toBe(120);
    expect(res.usage.output_tokens).toBe(25);
    expect(res.content).toHaveLength(1);
    const block = res.content[0];
    if (!block) throw new Error("no block");
    expect(block.type).toBe("tool_use");
    expect(block.name).toBe("top_gainers");

    expect(recorded).toHaveLength(1);
    const r = recorded[0];
    if (!r) throw new Error("no request");
    expect(r.path).toBe("/v1/messages");
    expect(r.method).toBe("POST");
    const sent = r.body as MessageRequest;
    expect(sent.max_tokens).toBe(1024);
    expect(sent.tool_choice).toEqual({ type: "auto" });
    expect(sent.tools?.[0]?.name).toBe("top_gainers");
  });

  test("surfaces non-2xx as AnthropicApiError with the correct code", async () => {
    responder = () => ({
      status: 413,
      body: { type: "error", error: { type: "request_too_large", message: "too big" } },
    });
    const client = makeClient();
    const err = await client
      .sendMessage({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: "x" }],
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnthropicApiError);
    expect((err as AnthropicApiError).status).toBe(413);
    expect((err as AnthropicApiError).code).toBe("request_too_large");
  });

  test("baseUrl is respected (trailing slash tolerated)", async () => {
    responder = () => ({ status: 200, body: { input_tokens: 1 } });
    const client = createAnthropicClient({
      apiKey: "sk",
      baseUrl: `${baseUrl}/`,
      sleep: async () => {},
    });
    await client.countTokens({
      model: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "x" }],
    });
    expect(recorded[0]?.path).toBe("/v1/messages/count_tokens");
  });

  test("uses injected fetchImpl", async () => {
    let called = 0;
    const fakeFetch: typeof fetch = async (url, init) => {
      called++;
      void url;
      void init;
      return new Response(JSON.stringify({ input_tokens: 5 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = createAnthropicClient({
      apiKey: "sk",
      baseUrl,
      fetchImpl: fakeFetch,
      sleep: async () => {},
    });
    const res = await client.countTokens({
      model: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "x" }],
    });
    expect(res.input_tokens).toBe(5);
    expect(called).toBe(1);
    expect(recorded).toHaveLength(0);
  });
});

describe("createMockClient", () => {
  test("countTokens is deterministic: same input → same output", async () => {
    const a = createMockClient();
    const b = createMockClient({ seed: 42 });
    const req: CountTokensRequest = {
      model: "claude-sonnet-4-5",
      system: "system prompt",
      messages: [{ role: "user", content: "hello world" }],
      tools: [
        {
          name: "t",
          description: "d",
          input_schema: { type: "object", properties: {} },
        },
      ],
    };
    const r1 = await a.countTokens(req);
    const r2 = await a.countTokens(req);
    const r3 = await b.countTokens(req);
    expect(r1.input_tokens).toBe(r2.input_tokens);
    expect(r1.input_tokens).toBe(r3.input_tokens);
    expect(r1.input_tokens).toBeGreaterThan(0);
  });

  test("countTokens scales with tool count", async () => {
    const client = createMockClient();
    const base: CountTokensRequest = {
      model: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "x" }],
    };
    const tool = {
      name: "sample_tool",
      description: "a tool that does a thing",
      input_schema: {
        type: "object",
        properties: { q: { type: "string", description: "query" } },
        required: ["q"],
      },
    };
    const few = await client.countTokens({ ...base, tools: [tool] });
    const many = await client.countTokens({
      ...base,
      tools: Array.from({ length: 50 }, () => tool),
    });
    expect(many.input_tokens).toBeGreaterThan(few.input_tokens);
  });

  test("sendMessage returns tool_use when tools are present", async () => {
    const client = createMockClient();
    const res = await client.sendMessage({
      model: "claude-sonnet-4-5",
      max_tokens: 256,
      messages: [{ role: "user", content: "go" }],
      tools: [
        {
          name: "top_gainers",
          description: "x",
          input_schema: { type: "object", properties: {} },
        },
      ],
    });
    expect(res.stop_reason).toBe("tool_use");
    expect(res.content).toHaveLength(1);
    const block = res.content[0];
    if (!block) throw new Error("no block");
    expect(block.type).toBe("tool_use");
    expect(block.name).toBe("top_gainers");
    expect(res.usage.output_tokens).toBe(30);
  });

  test("sendMessage returns text when no tools are present", async () => {
    const client = createMockClient();
    const res = await client.sendMessage({
      model: "claude-sonnet-4-5",
      max_tokens: 256,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.stop_reason).toBe("end_turn");
    const block = res.content[0];
    if (!block) throw new Error("no block");
    expect(block.type).toBe("text");
  });

  test("sendMessage usage.input_tokens equals countTokens output", async () => {
    const client = createMockClient();
    const req: MessageRequest = {
      model: "claude-sonnet-4-5",
      max_tokens: 256,
      system: "sys",
      messages: [{ role: "user", content: "hello" }],
      tools: [
        {
          name: "t",
          description: "x",
          input_schema: { type: "object", properties: {} },
        },
      ],
    };
    const count = await client.countTokens(req);
    const msg = await client.sendMessage(req);
    expect(msg.usage.input_tokens).toBe(count.input_tokens);
  });
});
