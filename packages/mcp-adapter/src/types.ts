import type { PortalProvider } from "@visitportal/provider";

export interface McpServerOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  name?: string;
  brief?: string;
  callEndpoint?: string;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface McpServerInfo {
  name: string;
  version: string;
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpCallToolResult {
  content?: unknown[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface McpToolMapping {
  portalName: string;
  mcpName: string;
  description?: string;
  paramsSchema?: Record<string, unknown>;
}

export interface McpPortalAdapter {
  readonly manifest: PortalProvider["manifest"];
  readonly portal: PortalProvider;
  readonly serverInfo: McpServerInfo;
  readonly tools: readonly McpToolMapping[];
  close(): Promise<void>;
}
