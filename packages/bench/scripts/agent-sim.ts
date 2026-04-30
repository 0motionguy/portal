// agent-sim — drive a real Claude run against an in-process Portal.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... pnpm tsx packages/bench/scripts/agent-sim.ts
//
// Optional env:
//   AGENT_SIM_MODEL   Claude model id (default: claude-haiku-4-5-20251001)
//   AGENT_SIM_TASK    "list_repos" (default) | "whoami"
//   AGENT_SIM_MAX     max iterations (default 5)
//
// Exits 0 on success (≥1 tool call, end_turn reached, final answer non-empty).
// Exits 1 on any failure mode.

import { visit } from "@visitportal/visit";
import { runAgentLoop } from "../src/agent/loop.ts";
import { createAgentSimPortal } from "../src/agent/portal-bridge.ts";
import { createAnthropicClient } from "../src/tasks/anthropic-client.ts";

const TASKS = {
  list_repos: {
    system:
      "You are a research assistant. Use the available tools to answer the user. When you call a tool, use only the parameters declared in its input_schema. After you have the data, return a short final answer.",
    user: "Use the available Portal to list the top 2 trending agent-protocol repositories. Cite each repo's owner/name and 7-day star count.",
  },
  whoami: {
    system: "You are a debugging assistant. Use the available tools to identify yourself.",
    user: "Call whoami and report what the Portal says.",
  },
} as const;

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY not set. This script makes real Claude API calls; for the in-CI mocked version, see packages/bench/test/agent-sim.test.ts.",
    );
    process.exit(1);
  }

  const model = process.env.AGENT_SIM_MODEL ?? "claude-haiku-4-5-20251001";
  const taskKey = (process.env.AGENT_SIM_TASK ?? "list_repos") as keyof typeof TASKS;
  const task = TASKS[taskKey] ?? TASKS.list_repos;
  const maxIterations = Number.parseInt(process.env.AGENT_SIM_MAX ?? "5", 10);

  const { fetchImpl, baseUrl } = createAgentSimPortal();
  const portal = await visit(baseUrl, { fetchImpl });
  const client = createAnthropicClient({ apiKey });

  console.log(`# agent-sim · model=${model} · task=${taskKey} · target=${baseUrl}`);
  console.log(`# manifest: ${portal.tools.length} tools — ${portal.tools.join(", ")}`);
  console.log(`# user: ${task.user}\n`);

  const t0 = Date.now();
  const result = await runAgentLoop({
    client,
    portal,
    system: task.system,
    userPrompt: task.user,
    model,
    maxIterations,
  });
  const ms = Date.now() - t0;

  console.log("# tool calls:");
  for (const call of result.toolCalls) {
    const status = call.ok ? "ok" : "ERR";
    console.log(
      `  [${status}] ${call.tool}(${JSON.stringify(call.params)}) → ${truncate(
        JSON.stringify(call.result),
        200,
      )}`,
    );
  }
  console.log(`\n# stop_reason: ${result.stopReason}`);
  console.log(`# iterations: ${result.iterations}`);
  console.log(
    `# tokens: in=${result.totalInputTokens} out=${result.totalOutputTokens} · wall=${ms}ms`,
  );
  if (result.error) console.log(`# error: ${result.error}`);

  console.log("\n# final answer:");
  console.log(result.finalAnswer ?? "(no text in last response)");

  const success =
    result.toolCalls.length >= 1 &&
    result.stopReason === "end_turn" &&
    typeof result.finalAnswer === "string" &&
    result.finalAnswer.length > 0 &&
    result.toolCalls.every((c) => c.ok);

  if (!success) {
    console.error("\nagent-sim failed");
    process.exit(1);
  }
  console.log("\nagent-sim ok");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

await main();
