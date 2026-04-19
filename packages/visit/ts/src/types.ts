export type ParamType = "string" | "number" | "boolean" | "object" | "array";

export interface ParamEntry {
  type: ParamType;
  required?: boolean;
  description?: string;
}

export interface Tool {
  name: string;
  description?: string;
  params?: Record<string, ParamEntry>;
  paramsSchema?: Record<string, unknown>;
}

export interface Manifest {
  portal_version: string;
  name: string;
  brief: string;
  tools: Tool[];
  call_endpoint: string;
  auth?: "none" | "api_key" | "erc8004";
  pricing?: { model: "free" | "x402"; rate?: string };
}

export interface VisitOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export interface CallOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}
