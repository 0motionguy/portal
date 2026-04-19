import type { SeedData } from "./types.ts";

export const fixture: SeedData = {
  repos: [
    {
      name_with_owner: "agnt-network/portal",
      stars: 4210,
      delta_week: 1240,
      language: "TypeScript",
      description: "Open HTTP standard for drive-by LLM client visits.",
      topics: ["llm", "protocol", "http", "mcp"],
      maintainer: "mirkobd",
    },
    {
      name_with_owner: "anthropics/claude-code",
      stars: 18330,
      delta_week: 890,
      language: "TypeScript",
      description: "Claude Code CLI — Anthropic's official agentic coding tool.",
      topics: ["cli", "agents", "anthropic"],
      maintainer: "anthropic-ops",
    },
    {
      name_with_owner: "rustlang/cargo-trace",
      stars: 2104,
      delta_week: 612,
      language: "Rust",
      description: "Async tracing overlay for Cargo builds.",
      topics: ["rust", "tracing", "build-tools"],
      maintainer: "mirkobd",
    },
  ],
  maintainers: [
    {
      handle: "mirkobd",
      display_name: "Mirko B. Dolger",
      bio: "Full-stack operator. Protocols, infra, systems.",
      repos: ["agnt-network/portal", "rustlang/cargo-trace"],
    },
    {
      handle: "anthropic-ops",
      display_name: "Anthropic Engineering",
      bio: "Operational tooling team at Anthropic.",
      repos: ["anthropics/claude-code"],
    },
  ],
};
