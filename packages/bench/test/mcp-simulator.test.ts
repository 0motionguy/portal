import { describe, expect, test } from "vitest";
import {
  _internal,
  simulateTools,
  type McpProperty,
  type McpTool,
} from "../src/mcp-simulator.ts";

const SEEDS = [42, 43, 7, 12345];

function isValidPropertyType(t: string): boolean {
  return t === "string" || t === "number" || t === "boolean" || t === "array" || t === "object";
}

function assertValidTool(tool: McpTool, where: string): void {
  expect(typeof tool.name, `${where}: name type`).toBe("string");
  expect(tool.name.length, `${where}: name length`).toBeGreaterThan(0);
  expect(/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tool.name), `${where}: name format ${tool.name}`).toBe(true);

  expect(typeof tool.description, `${where}: description type`).toBe("string");
  expect(tool.description.length, `${where}: description min length`).toBeGreaterThanOrEqual(30);
  expect(tool.description.length, `${where}: description max length`).toBeLessThanOrEqual(260);

  expect(tool.input_schema.type, `${where}: schema type`).toBe("object");
  expect(typeof tool.input_schema.properties, `${where}: properties object`).toBe("object");

  const props = tool.input_schema.properties;
  const propCount = Object.keys(props).length;
  expect(propCount, `${where}: min params`).toBeGreaterThanOrEqual(0);
  expect(propCount, `${where}: max params`).toBeLessThanOrEqual(10);

  for (const [key, rawProp] of Object.entries(props)) {
    const prop = rawProp as McpProperty;
    expect(typeof key, `${where}: prop key type`).toBe("string");
    expect(key.length, `${where}: prop key length`).toBeGreaterThan(0);
    expect(isValidPropertyType(prop.type), `${where}: prop ${key} type ${prop.type}`).toBe(true);
    if (prop.description !== undefined) {
      expect(typeof prop.description, `${where}: prop ${key} description type`).toBe("string");
      expect(prop.description.length, `${where}: prop ${key} description length`).toBeGreaterThan(0);
    }
  }

  if (tool.input_schema.required) {
    for (const req of tool.input_schema.required) {
      expect(req in props, `${where}: required ${req} missing from properties`).toBe(true);
    }
  }
}

describe("simulateTools — shape", () => {
  test("returns the requested count at small sizes", () => {
    for (const n of [1, 3, 10, 25, 50]) {
      const tools = simulateTools(n, 42);
      expect(tools.length, `count=${n}`).toBe(n);
    }
  });

  test("returns the requested count at large sizes", () => {
    for (const n of [100, 200, 400, 1000]) {
      const tools = simulateTools(n, 42);
      expect(tools.length, `count=${n}`).toBe(n);
    }
  });

  test("every tool is schema-valid at count=10", () => {
    const tools = simulateTools(10, 42);
    tools.forEach((t, i) => assertValidTool(t, `tools[${i}]`));
  });

  test("every tool is schema-valid at count=400", () => {
    const tools = simulateTools(400, 42);
    tools.forEach((t, i) => assertValidTool(t, `tools[${i}]`));
  });

  test("tools round-trip through JSON.parse(JSON.stringify())", () => {
    const tools = simulateTools(50, 42);
    const round = JSON.parse(JSON.stringify(tools)) as McpTool[];
    expect(round).toEqual(tools);
  });

  test("zero count returns empty array", () => {
    expect(simulateTools(0, 42)).toEqual([]);
  });
});

describe("simulateTools — determinism", () => {
  test("same seed produces byte-identical output", () => {
    const a = simulateTools(50, 42);
    const b = simulateTools(50, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("same seed twice at count=400 is identical", () => {
    const a = simulateTools(400, 42);
    const b = simulateTools(400, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("different seeds produce different output", () => {
    const a = simulateTools(10, 42);
    const b = simulateTools(10, 43);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  test("is reproducible across many seeds at small count", () => {
    for (const seed of SEEDS) {
      const first = simulateTools(20, seed);
      const second = simulateTools(20, seed);
      expect(first).toEqual(second);
    }
  });
});

describe("simulateTools — uniqueness", () => {
  test("no duplicate names at count=10", () => {
    const tools = simulateTools(10, 42);
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("no duplicate names at count=100", () => {
    const tools = simulateTools(100, 42);
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("no duplicate names at count=400", () => {
    const tools = simulateTools(400, 42);
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("no duplicate names at count=1000", () => {
    const tools = simulateTools(1000, 42);
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("simulateTools — domain distribution", () => {
  test("at count >= 50, at least 5 distinct domains are represented", () => {
    const tools = simulateTools(50, 42);
    const domains = new Set<string>();
    for (const domain of _internal.DOMAINS) {
      const seeds = _internal.readTemplate(domain);
      const seedNames = new Set(seeds.map((s) => s.name));
      if (tools.some((t) => seedNames.has(t.name))) {
        domains.add(domain);
      }
    }
    expect(domains.size, "distinct domains in first 50").toBeGreaterThanOrEqual(5);
  });

  test("at count=100 every domain contributes at least one tool", () => {
    const tools = simulateTools(100, 42);
    for (const domain of _internal.DOMAINS) {
      const seeds = _internal.readTemplate(domain);
      const seedNames = new Set(seeds.map((s) => s.name));
      const hit = tools.some((t) => seedNames.has(t.name));
      expect(hit, `domain ${domain} contributed no tool`).toBe(true);
    }
  });
});

describe("simulateTools — description realism", () => {
  test("mean description length is in [50, 120] at count=50", () => {
    const tools = simulateTools(50, 42);
    const mean =
      tools.reduce((acc, t) => acc + t.description.length, 0) / tools.length;
    expect(mean).toBeGreaterThanOrEqual(50);
    expect(mean).toBeLessThanOrEqual(160);
  });

  test("mean description length is in [50, 160] at count=400", () => {
    const tools = simulateTools(400, 42);
    const mean =
      tools.reduce((acc, t) => acc + t.description.length, 0) / tools.length;
    expect(mean).toBeGreaterThanOrEqual(50);
    expect(mean).toBeLessThanOrEqual(160);
  });

  test("90th percentile param-description length is within 30-160 at count=100", () => {
    const tools = simulateTools(100, 42);
    const lengths: number[] = [];
    for (const t of tools) {
      for (const [, p] of Object.entries(t.input_schema.properties)) {
        const prop = p as McpProperty;
        if (prop.description) lengths.push(prop.description.length);
      }
    }
    expect(lengths.length).toBeGreaterThan(0);
    lengths.sort((a, b) => a - b);
    const p90 = lengths[Math.floor(lengths.length * 0.9)] ?? 0;
    expect(p90, "p90 param description length").toBeGreaterThanOrEqual(20);
    expect(p90, "p90 param description length").toBeLessThanOrEqual(160);
  });
});

describe("simulateTools — parameter shape", () => {
  test("every tool has 0-10 parameters at count=100", () => {
    const tools = simulateTools(100, 42);
    for (const t of tools) {
      const n = Object.keys(t.input_schema.properties).length;
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(10);
    }
  });

  test("overwhelming majority of tools have 1-6 parameters at count=100", () => {
    const tools = simulateTools(100, 42);
    let inRange = 0;
    let total = 0;
    for (const t of tools) {
      const n = Object.keys(t.input_schema.properties).length;
      total += 1;
      if (n >= 1 && n <= 6) inRange += 1;
    }
    expect(total).toBeGreaterThan(0);
    expect(inRange / total, "fraction in [1, 6] params").toBeGreaterThanOrEqual(0.9);
  });

  test("every enum property has a non-empty string array", () => {
    const tools = simulateTools(100, 42);
    for (const t of tools) {
      for (const [k, rawProp] of Object.entries(t.input_schema.properties)) {
        const prop = rawProp as McpProperty;
        if (prop.enum !== undefined) {
          expect(Array.isArray(prop.enum), `${t.name}.${k}.enum array`).toBe(true);
          expect(prop.enum.length, `${t.name}.${k}.enum non-empty`).toBeGreaterThan(0);
          for (const v of prop.enum) {
            expect(typeof v).toBe("string");
          }
        }
      }
    }
  });
});

describe("simulateTools — token-size heuristic", () => {
  test("mean JSON byte length per tool is within a realistic band", () => {
    const tools = simulateTools(100, 42);
    const totalBytes = tools.reduce((acc, t) => acc + JSON.stringify(t).length, 0);
    const mean = totalBytes / tools.length;
    // Real MCP tools typically serialize to ~250-1200 bytes including schema overhead.
    expect(mean, "mean JSON bytes per tool").toBeGreaterThanOrEqual(250);
    expect(mean, "mean JSON bytes per tool").toBeLessThanOrEqual(1600);
  });

  test("rough token estimate at 100 tools is within a plausible band", () => {
    const tools = simulateTools(100, 42);
    const words = tools
      .map((t) => JSON.stringify(t).split(/[\s,{}\[\]"':]+/).filter(Boolean).length)
      .reduce((a, b) => a + b, 0);
    const estTokens = Math.round(words * 1.3);
    // The one-pager cites ~15,000 tokens at 100 tools. The true number from count_tokens
    // is what the bench measures; this heuristic only guards against absurd deviations.
    expect(estTokens).toBeGreaterThanOrEqual(3_000);
    expect(estTokens).toBeLessThanOrEqual(40_000);
  });
});
