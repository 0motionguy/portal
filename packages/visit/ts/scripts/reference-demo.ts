// Runs the reference adopter end-to-end for demo purposes. Not a spec
// conformance tool — for that use runSmokeConformance() or validateAgainstVectors()
// from @visitportal/spec, or the `visit-portal conformance <url>` CLI subcommand.
//
// Usage: tsx scripts/reference-demo.ts <portal-url>
//   defaults to http://localhost:3075/portal (reference Portal dev server).

import { CallFailed, ToolNotInManifest, visit } from "../src/index.ts";

const url = process.argv[2] ?? "http://localhost:3075/portal";

console.log(`→ visit(${url})`);
const p = await visit(url);
console.log(`  manifest OK: name='${p.manifest.name}' tools=[${p.tools.join(", ")}]`);

console.log("→ top_gainers({limit: 3})");
const top = await p.call<Array<{ name_with_owner: string; delta_week: number }>>("top_gainers", {
  limit: 3,
});
for (const r of top) console.log(`  ${r.name_with_owner} (+${r.delta_week})`);

console.log("→ search_repos({query: 'llm', limit: 2})");
const hits = await p.call<Array<{ name_with_owner: string }>>("search_repos", {
  query: "llm",
  limit: 2,
});
for (const r of hits) console.log(`  ${r.name_with_owner}`);

console.log("→ maintainer_profile (unknown handle, expect NOT_FOUND)");
try {
  await p.call("maintainer_profile", { handle: "ghost" });
  console.error("  FAIL: expected CallFailed");
  process.exit(1);
} catch (e) {
  if (!(e instanceof CallFailed)) throw e;
  if (e.code !== "NOT_FOUND") {
    console.error(`  FAIL: expected NOT_FOUND, got ${e.code}`);
    process.exit(1);
  }
  console.log(`  got CallFailed(NOT_FOUND): ${e.message.slice(0, 80)}`);
}

console.log("→ call a tool not in the manifest (expect ToolNotInManifest)");
try {
  await p.call("nonexistent", {});
  console.error("  FAIL: expected ToolNotInManifest");
  process.exit(1);
} catch (e) {
  if (!(e instanceof ToolNotInManifest)) throw e;
  console.log(`  got ToolNotInManifest: ${e.message.slice(0, 80)}`);
}

console.log("OK · integration green");
