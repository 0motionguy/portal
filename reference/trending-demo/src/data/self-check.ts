import { maintainers, repos } from "./index.ts";

interface Issue {
  kind: string;
  detail: string;
}

const issues: Issue[] = [];

if (repos.length < 20) {
  issues.push({
    kind: "count",
    detail: `repos.length === ${repos.length}, expected ≥ 20`,
  });
}

const repoIds = new Set<string>();
for (const r of repos) {
  if (repoIds.has(r.name_with_owner)) {
    issues.push({
      kind: "duplicate_repo",
      detail: `duplicate name_with_owner: ${r.name_with_owner}`,
    });
  }
  repoIds.add(r.name_with_owner);
}

const maintainerHandles = new Set(maintainers.map((m) => m.handle));

for (const r of repos) {
  if (!maintainerHandles.has(r.maintainer)) {
    issues.push({
      kind: "missing_maintainer",
      detail: `repo "${r.name_with_owner}" references unknown maintainer "${r.maintainer}"`,
    });
  }
}

for (const m of maintainers) {
  for (const repoName of m.repos) {
    if (!repoIds.has(repoName)) {
      issues.push({
        kind: "missing_repo",
        detail: `maintainer "${m.handle}" references unknown repo "${repoName}"`,
      });
    }
  }
}

const langCounts = new Map<string, number>();
for (const r of repos) {
  langCounts.set(r.language, (langCounts.get(r.language) ?? 0) + 1);
}

const tsJs = (langCounts.get("TypeScript") ?? 0) + (langCounts.get("JavaScript") ?? 0);
const python = langCounts.get("Python") ?? 0;
const rustGo = (langCounts.get("Rust") ?? 0) + (langCounts.get("Go") ?? 0);

console.log("== trending-demo seed self-check ==");
console.log(`repos:       ${repos.length}`);
console.log(`maintainers: ${maintainers.length}`);
console.log(`TS/JS:       ${tsJs}`);
console.log(`Python:      ${python}`);
console.log(`Rust/Go:     ${rustGo}`);
console.log(`languages:   ${[...langCounts.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`);

const deltas = repos.map((r) => r.delta_week).sort((a, b) => a - b);
const medianDelta = deltas[Math.floor(deltas.length / 2)] ?? 0;
const minDelta = deltas[0] ?? 0;
const maxDelta = deltas[deltas.length - 1] ?? 0;
console.log(`delta_week:  min=${minDelta} median=${medianDelta} max=${maxDelta}`);

const emptyTopics = repos.filter((r) => r.topics.length === 0).length;
console.log(`empty-topic repos: ${emptyTopics}`);

if (issues.length > 0) {
  console.error("\nFAIL:");
  for (const i of issues) {
    console.error(` - [${i.kind}] ${i.detail}`);
  }
  process.exit(1);
}

console.log("\nOK — seed integrity verified.");
