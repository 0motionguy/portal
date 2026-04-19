# Portal — Project Operating Rules

## Mission
Ship the open standard for drive-by LLM client visits. Reference implementation, SDKs (TypeScript + Python), MCP adapter, reproducible benchmark, live demo. Seven days. For the "Built with Opus 4.7" Claude Code hackathon (Apr 21–28, 2026).

## Operating principles
1. Plan-first. Before any file change, state the intent in one sentence.
2. Small diffs. One concern per commit. Never touch unrelated files.
3. Spec-first, code second. If code contradicts the spec, we fix one or the other intentionally.
4. Integrity > marketing. Real measured numbers. If the benchmark disagrees with published claims, we update the claims — never the other way.
5. Subagents for parallel work. Use the Task tool. One concern per subagent.
6. Minimum surface area. Every feature needs a justification. No premature abstractions.

## What NOT to do
- Do not add authentication layers until Phase 7 (optional extensions).
- Do not import AGP, ClawPulse, AGNT, or 8004 in base Portal packages. Those are optional extensions documented separately. Base Portal must stay neutral and unowned.
- Do not rewrite the spec once published without version-bumping.
- Do not skip tests on any SDK function.
- Do not rewrite existing Star Screener code when integrating. Layer Portal on top as a thin adapter.

## Style
- TypeScript: strict mode, no `any`, Biome for format + lint.
- Python: type hints, ruff, black.
- Commits: conventional (feat:, fix:, docs:, chore:).
- PR ceiling: 400 lines.

## Verification standard
Every claim on visitportal.dev must be verifiable by running `pnpm bench` or `curl`. Assume every judge will try.

## Positioning guardrails
Portal is **not** a competitor to MCP, A2A, or Skills. It is a complementary subset for drive-by visits. Every piece of public copy must credit MCP as the foundation and position Portal as "the visitor-side half of the open agent web."
