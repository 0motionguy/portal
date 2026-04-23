import { type Manifest, type PortalProvider, internal, serve } from "@visitportal/provider";
import { StdioMcpClient } from "./stdio-client.ts";
import type {
  McpCallToolResult,
  McpPortalAdapter,
  McpServerOptions,
  McpTool,
  McpToolMapping,
} from "./types.ts";

export async function adaptMcpServer(options: McpServerOptions): Promise<McpPortalAdapter> {
  const client = await StdioMcpClient.connect(options);
  const tools = await client.listTools();
  if (tools.length === 0) {
    await client.close();
    throw new Error("MCP server exposed no tools");
  }

  const mappings = buildMappings(tools);
  const manifest: Manifest = {
    portal_version: "0.1",
    name: options.name ?? `${client.serverInfo.name} (MCP adapter)`,
    brief:
      options.brief ??
      `Portal adapter for MCP server '${client.serverInfo.name}'. Tool calls are forwarded over stdio.`,
    tools: mappings.map((tool) => ({
      name: tool.portalName,
      ...(tool.description !== undefined ? { description: tool.description } : {}),
      ...(tool.paramsSchema !== undefined ? { paramsSchema: tool.paramsSchema } : {}),
    })),
    call_endpoint: options.callEndpoint ?? "/portal/call",
    auth: "none",
    pricing: { model: "free" },
  };

  const handlers = Object.fromEntries(
    mappings.map((tool) => [
      tool.portalName,
      async (params: Record<string, unknown>) => {
        const result = await client.callTool(tool.mcpName, params);
        if (result.isError) {
          throw internal(renderError(result));
        }
        return normalizeResult(result);
      },
    ]),
  );

  const portal = serve({ manifest, handlers });
  return {
    manifest,
    portal,
    serverInfo: client.serverInfo,
    tools: mappings,
    close: () => client.close(),
  };
}

function buildMappings(tools: readonly McpTool[]): McpToolMapping[] {
  const used = new Set<string>();
  return tools.map((tool) => {
    const portalName = uniquePortalName(tool.name, used);
    used.add(portalName);
    return {
      portalName,
      mcpName: tool.name,
      description: buildDescription(tool, portalName),
      paramsSchema: normalizeInputSchema(tool.inputSchema),
    };
  });
}

function uniquePortalName(name: string, used: Set<string>): string {
  const base = sanitizeToolName(name);
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function sanitizeToolName(name: string): string {
  let out = name.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  out = out.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (!/^[a-z]/.test(out)) out = `tool_${out}`;
  if (out.length === 0) out = "tool";
  return out.slice(0, 64);
}

function buildDescription(tool: McpTool, portalName: string): string {
  const desc = tool.description ?? tool.title ?? `MCP tool '${tool.name}'.`;
  if (portalName === tool.name) return trim500(desc);
  return trim500(`${desc} Original MCP tool: ${tool.name}.`);
}

function trim500(s: string): string {
  return s.length <= 500 ? s : `${s.slice(0, 497)}...`;
}

function normalizeInputSchema(
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (schema && Object.keys(schema).length > 0) return schema;
  return { type: "object", properties: {} };
}

function normalizeResult(result: McpCallToolResult): unknown {
  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    return result.structuredContent;
  }
  if (
    Array.isArray(result.content) &&
    result.content.length === 1 &&
    isRecord(result.content[0]) &&
    result.content[0].type === "text" &&
    typeof result.content[0].text === "string"
  ) {
    return result.content[0].text;
  }
  if (!Array.isArray(result.content) || result.content.length === 0) return null;
  return { content: result.content };
}

function renderError(result: McpCallToolResult): string {
  if (
    Array.isArray(result.content) &&
    result.content.length === 1 &&
    isRecord(result.content[0]) &&
    result.content[0].type === "text" &&
    typeof result.content[0].text === "string"
  ) {
    return result.content[0].text;
  }
  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    return JSON.stringify(result.structuredContent);
  }
  return "MCP tool returned isError:true";
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export type { Manifest, PortalProvider };
