import { validateManifest } from "@visitportal/spec";
import { ManifestBuildError } from "./errors.ts";
import type { Manifest, ManifestOptions, Tool, ToolDefinition } from "./types.ts";

export function manifest(options: ManifestOptions): Manifest {
  const built: Manifest = {
    portal_version: options.portal_version ?? "0.1",
    name: options.name,
    brief: options.brief,
    tools: options.tools.map(stripHandler),
    call_endpoint: options.call_endpoint,
    auth: options.auth ?? "none",
    pricing: options.pricing ?? { model: "free" },
  };

  return ensureManifest(built);
}

export function ensureManifest(input: Manifest): Manifest {
  const duplicateNames = findDuplicateToolNames(input.tools);
  if (duplicateNames.length > 0) {
    throw new ManifestBuildError(
      duplicateNames.map((name) => `duplicate tool name: '${name}'`),
    );
  }

  const result = validateManifest(input);
  if (!result.ok) {
    throw new ManifestBuildError(
      result.errors.map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim()),
    );
  }

  return input;
}

function stripHandler(tool: Tool | ToolDefinition): Tool {
  const out: Tool = { name: tool.name };
  if (tool.description !== undefined) out.description = tool.description;
  if (tool.params !== undefined) out.params = tool.params;
  if (tool.paramsSchema !== undefined) out.paramsSchema = tool.paramsSchema;
  return out;
}

function findDuplicateToolNames(tools: readonly Tool[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const tool of tools) {
    if (seen.has(tool.name)) duplicates.add(tool.name);
    seen.add(tool.name);
  }
  return [...duplicates];
}
