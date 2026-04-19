import type { BenchTask } from "./index.ts";

// The system prompt is held constant across all three tasks — it is the
// experimental control. Only the user message varies. Keep it short, neutral,
// and free of protocol-specific framing or hints about which tool to pick.
const SYSTEM_PROMPT =
  "You are an assistant with access to tools. When a user asks about trending repos, " +
  "call the appropriate tool. Do not speculate — always prefer a tool call.";

export const TASKS: readonly BenchTask[] = [
  {
    id: "find_trending_ai",
    name: "Find trending AI repos this week",
    system: SYSTEM_PROMPT,
    user:
      "Find me the top 3 AI-related repos trending on GitHub this week. " +
      "Return them as a short list with repo name and star delta.",
    expectedTool: "top_gainers",
    expectedParams: { limit: 3 },
  },
  {
    id: "summarize_repo",
    name: "Summarize repo activity for a maintainer",
    system: SYSTEM_PROMPT,
    user:
      "Give me a profile for the GitHub maintainer 'charliermarsh' — " +
      "who they are and what they work on.",
    expectedTool: "maintainer_profile",
    expectedParams: { handle: "charliermarsh" },
  },
  {
    id: "search_agent_protocol",
    name: "Search repos matching 'agent protocol'",
    system: SYSTEM_PROMPT,
    user: "Search for repos about 'agent protocol'. Give me the top 5 matches.",
    expectedTool: "search_repos",
    expectedParams: { query: "agent protocol", limit: 5 },
  },
] as const;
