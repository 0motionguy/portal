import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type McpPropertyType = "string" | "number" | "boolean" | "array" | "object";

export interface McpProperty {
  type: McpPropertyType;
  description?: string;
  enum?: string[];
  items?: unknown;
}

export interface McpTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, McpProperty>;
    required?: string[];
  };
}

const DOMAINS = [
  "filesystem",
  "github",
  "search",
  "database",
  "http",
  "communication",
  "knowledge",
] as const;

type Domain = (typeof DOMAINS)[number];

const VARIANT_PREFIXES: Record<Domain, readonly string[]> = {
  filesystem: ["scoped", "cached", "tenant", "project", "snapshot", "versioned", "mirror"],
  github: ["org", "enterprise", "internal", "mirror", "cached", "legacy", "v2"],
  search: ["ranked", "scoped", "personalized", "filtered", "boosted", "recent", "cached"],
  database: ["readonly", "staging", "primary", "replica", "archive", "analytics", "audit"],
  http: ["retrying", "authed", "signed", "streaming", "traced", "cached", "batched"],
  communication: ["org", "workspace", "team", "broadcast", "scheduled", "templated", "encrypted"],
  knowledge: ["project", "workspace", "team", "archived", "versioned", "scoped", "public"],
};

const VARIANT_SUFFIXES: Record<Domain, readonly string[]> = {
  filesystem: [
    "by_glob",
    "by_size",
    "by_mtime",
    "recursive",
    "shallow",
    "with_metadata",
    "streaming",
  ],
  github: [
    "by_label",
    "by_author",
    "by_date",
    "by_milestone",
    "by_reviewer",
    "with_reviews",
    "with_checks",
  ],
  search: [
    "by_domain",
    "by_language",
    "by_date",
    "by_type",
    "with_snippets",
    "with_embeddings",
    "ranked",
  ],
  database: [
    "by_schema",
    "by_owner",
    "by_index",
    "with_stats",
    "with_plan",
    "by_tablespace",
    "with_constraints",
  ],
  http: ["with_retry", "with_timeout", "with_proxy", "with_auth", "streaming", "binary", "json"],
  communication: [
    "by_channel",
    "by_user",
    "by_date",
    "threaded",
    "with_attachments",
    "pinned_only",
    "unread_only",
  ],
  knowledge: [
    "by_type",
    "by_tag",
    "by_depth",
    "with_relations",
    "with_observations",
    "shortest_path",
    "ranked",
  ],
};

const moduleDir = dirname(fileURLToPath(import.meta.url));
const templateDir = join(moduleDir, "templates");

const templateCache = new Map<Domain, readonly McpTool[]>();

function readTemplate(domain: Domain): readonly McpTool[] {
  const cached = templateCache.get(domain);
  if (cached) return cached;
  const raw = readFileSync(join(templateDir, `${domain}.json`), "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`[mcp-simulator] template ${domain}.json is not an array`);
  }
  const tools = parsed.map((t, i) => validateTool(t, `${domain}[${i}]`));
  templateCache.set(domain, tools);
  return tools;
}

function validateTool(value: unknown, where: string): McpTool {
  if (typeof value !== "object" || value === null) {
    throw new Error(`[mcp-simulator] ${where}: not an object`);
  }
  const obj = value as Record<string, unknown>;
  const name = obj.name;
  const description = obj.description;
  const inputSchema = obj.input_schema;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`[mcp-simulator] ${where}: missing name`);
  }
  if (typeof description !== "string" || description.length === 0) {
    throw new Error(`[mcp-simulator] ${where}: missing description`);
  }
  if (typeof inputSchema !== "object" || inputSchema === null) {
    throw new Error(`[mcp-simulator] ${where}: missing input_schema`);
  }
  const schema = inputSchema as Record<string, unknown>;
  if (schema.type !== "object") {
    throw new Error(`[mcp-simulator] ${where}: input_schema.type must be 'object'`);
  }
  const properties = schema.properties;
  if (typeof properties !== "object" || properties === null) {
    throw new Error(`[mcp-simulator] ${where}: input_schema.properties missing`);
  }
  const required = schema.required;
  if (required !== undefined && !Array.isArray(required)) {
    throw new Error(`[mcp-simulator] ${where}: input_schema.required must be an array`);
  }
  const normalized: McpTool = {
    name,
    description,
    input_schema: {
      type: "object",
      properties: properties as Record<string, McpProperty>,
      ...(required ? { required: required as string[] } : {}),
    },
  };
  return normalized;
}

function seedRng(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickIndex(rng: () => number, length: number): number {
  return Math.floor(rng() * length) % length;
}

function cloneTool(t: McpTool): McpTool {
  return JSON.parse(JSON.stringify(t)) as McpTool;
}

function loadAllTemplates(): Array<{ domain: Domain; tools: readonly McpTool[] }> {
  return DOMAINS.map((domain) => ({ domain, tools: readTemplate(domain) }));
}

function balancedSample(count: number, seed: number): McpTool[] {
  const all = loadAllTemplates();
  const rng = seedRng(seed);
  const perDomain: Array<McpTool[]> = all.map(({ tools }) => {
    const pool = tools.map(cloneTool);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = pool[i] as McpTool;
      pool[i] = pool[j] as McpTool;
      pool[j] = tmp;
    }
    return pool;
  });

  const picked: McpTool[] = [];
  const seenNames = new Set<string>();
  let cursor = 0;
  while (picked.length < count) {
    const bucket = perDomain[cursor % DOMAINS.length];
    cursor += 1;
    if (!bucket || bucket.length === 0) continue;
    const next = bucket.shift();
    if (!next) continue;
    if (seenNames.has(next.name)) continue;
    seenNames.add(next.name);
    picked.push(next);
    if (perDomain.every((b) => b.length === 0)) break;
  }
  return picked;
}

function buildVariantName(
  base: McpTool,
  domain: Domain,
  rng: () => number,
  used: Set<string>,
): string {
  const prefixes = VARIANT_PREFIXES[domain];
  const suffixes = VARIANT_SUFFIXES[domain];
  for (let attempt = 0; attempt < 64; attempt++) {
    const kind = rng();
    let candidate: string;
    if (kind < 0.4) {
      const suffix = suffixes[pickIndex(rng, suffixes.length)] as string;
      candidate = `${base.name}_${suffix}`;
    } else if (kind < 0.75) {
      const prefix = prefixes[pickIndex(rng, prefixes.length)] as string;
      candidate = `${prefix}_${base.name}`;
    } else {
      const prefix = prefixes[pickIndex(rng, prefixes.length)] as string;
      const suffix = suffixes[pickIndex(rng, suffixes.length)] as string;
      candidate = `${prefix}_${base.name}_${suffix}`;
    }
    if (!used.has(candidate)) return candidate;
  }
  let counter = 2;
  while (used.has(`${base.name}_v${counter}`)) counter += 1;
  return `${base.name}_v${counter}`;
}

function describeVariant(base: McpTool, variantName: string, domain: Domain): string {
  const head = (base.description.split(". ")[0] ?? base.description).trim();
  const extras = variantExtras(variantName, base.name);
  const tag = extras.length > 0 ? `${extras} ${domain}` : domain;
  const lead = `${head} (${tag} variant).`;
  return clampDescription(lead);
}

function variantExtras(variant: string, base: string): string {
  const idx = variant.indexOf(base);
  if (idx < 0) return "";
  const prefix = variant.slice(0, idx).replace(/_+$/, "").replace(/_/g, " ");
  const suffix = variant
    .slice(idx + base.length)
    .replace(/^_+/, "")
    .replace(/_/g, " ");
  const parts = [prefix, suffix].filter((p) => p.length > 0);
  return parts.join(" · ");
}

function clampDescription(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) return normalized;
  const cut = normalized.slice(0, 177);
  const lastSpace = cut.lastIndexOf(" ");
  const boundary = lastSpace > 120 ? lastSpace : 177;
  return `${normalized.slice(0, boundary).trim()}...`;
}

function variantTool(base: McpTool, domain: Domain, rng: () => number, used: Set<string>): McpTool {
  const name = buildVariantName(base, domain, rng, used);
  used.add(name);
  const clone = cloneTool(base);
  clone.name = name;
  clone.description = describeVariant(base, name, domain);
  return clone;
}

export function simulateTools(count: number, seed = 1): McpTool[] {
  if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
    throw new Error(`[mcp-simulator] count must be a non-negative integer, got ${count}`);
  }
  if (count === 0) return [];
  const all = loadAllTemplates();
  const seedTotal = all.reduce((acc, { tools }) => acc + tools.length, 0);

  if (count <= seedTotal) {
    return balancedSample(count, seed);
  }

  const base = balancedSample(seedTotal, seed);
  const used = new Set<string>(base.map((t) => t.name));
  const rng = seedRng(seed ^ 0xa5a5a5a5);
  const synthetic: McpTool[] = [];
  let cursor = 0;
  while (base.length + synthetic.length < count) {
    const domain = DOMAINS[cursor % DOMAINS.length] as Domain;
    cursor += 1;
    const pool = readTemplate(domain);
    if (pool.length === 0) continue;
    const baseTool = pool[pickIndex(rng, pool.length)] as McpTool;
    const next = variantTool(baseTool, domain, rng, used);
    synthetic.push(next);
  }
  return [...base, ...synthetic];
}

export const _internal = {
  DOMAINS,
  readTemplate,
  seedRng,
  clampDescription,
};
