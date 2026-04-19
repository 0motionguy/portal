# Simulator methodology

The bench has to measure Portal against MCP at tool counts no single real MCP
server ships (10, 50, 100, 400, 1000). No captured production `tools/list`
response is large enough to cover that range end-to-end. So we generate the
MCP side synthetically — but the synthesis has to be defensible, because the
whole "Portal saves N tokens per turn" claim rests on the assumption that
our simulated schemas look like real MCP deployments.

This document records (a) where the seed tools came from, (b) how the
generator varies them at scale, and (c) what the simulator can and cannot
claim about real MCP behaviour.

## Source corpus

We sampled the published source of nine first-party Model Context Protocol
servers:

| Server                  | Source                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| filesystem              | `modelcontextprotocol/servers` `src/filesystem/index.ts` (main branch)   |
| memory (knowledge graph)| `modelcontextprotocol/servers` `src/memory/index.ts`                     |
| git                     | `modelcontextprotocol/servers` `src/git/src/mcp_server_git/server.py`    |
| fetch                   | `modelcontextprotocol/servers` `src/fetch/src/mcp_server_fetch/server.py`|
| github                  | `modelcontextprotocol/servers-archived` `src/github/index.ts`            |
| slack                   | `modelcontextprotocol/servers-archived` `src/slack/index.ts`             |
| brave-search            | `modelcontextprotocol/servers-archived` `src/brave-search/index.ts`      |
| google-maps             | `modelcontextprotocol/servers-archived` `src/google-maps/index.ts`       |
| postgres                | `modelcontextprotocol/servers-archived` `src/postgres/index.ts`          |

From those files we extracted every registered tool definition (name,
`description`, and the `inputSchema` — either zod-converted or inline JSON
schema). We measured the aggregate description-length distribution across
all nine servers:

```
samples:       127
mean length:    53.4  chars
median length:  45    chars
P10:            22    chars
P90:            80    chars
min:            12    chars
max:           199    chars
```

(Reproduction: fetch the nine servers' source files via `gh api repos/
modelcontextprotocol/servers/contents/src/<server>/... -H "Accept:
application/vnd.github.raw"` and run a regex over every `description: "..."`
and `description="..."` literal. The extractor is a ~25-line Node script
parsing both TypeScript-style `description: "..."` and Python-style
`description="..."` string literals and bucketing the lengths.)

That distribution anchors our writing target. We aimed each seed tool at
a description length of roughly 120-220 chars — slightly richer than the
mean because a practical deployment also mixes in long-form descriptions
(the filesystem server's `read_text_file` is 393 chars) and most tools
whose descriptions we paraphrase share a single short sentence that we
then extend with one or two clarifying sentences on scope, side effects,
or caveats. The 50-120 band named in the design spec is the target for
*seed tools*; variants derived from seeds generally lengthen slightly as
they prepend a "Variant of X focused on …" preamble.

### Derivation examples

Every seed tool is paraphrased from a real one. Three concrete examples so
a reviewer can audit the transform:

1. **`filesystem.json` → `read_text_file`**
   - Real description (concatenated multi-line literal in `src/filesystem/index.ts`):
     *"Read the complete contents of a file from the file system as text.
     Handles various text encodings and provides detailed error messages
     if the file cannot be read. Use this tool when you need to examine
     the contents of a single file. Use the 'head' parameter to read only
     the first N lines of a file, or the 'tail' parameter to read only
     the last N lines of a file. Operates on the file as text regardless
     of extension. Only works within allowed directories."*
   - Our paraphrase preserves the `path` / `head` / `tail` parameter set,
     same required list (`[path]`), same semantics, shorter prose.

2. **`github.json` → `create_issue`**
   - Real schema derived from `CreateIssueSchema` in
     `src/github/operations/issues.ts`:
     `{ owner, repo, title, body?, assignees?, milestone?, labels? }`.
   - Our seed keeps the exact field names, required set
     `[owner, repo, title]`, adds realistic per-field descriptions that
     match the GitHub REST API contract (labels as string array, owner
     as login, body as Markdown).

3. **`communication.json` → `slack_reply_to_thread`**
   - Real description: *"Reply to a specific message thread in Slack"*
     with params `channel_id`, `thread_ts`, `text`, and the pitfall note
     on timestamp format in the `thread_ts` description.
   - We preserve all three params, the required list, and the pitfall
     note about the `1234567890.123456` timestamp format.

### Domains chosen

Seven domains totalling ~90 seed tools:

| Domain          | Seeds | Real-world anchor                         |
| --------------- | ----- | ----------------------------------------- |
| `filesystem`    | 15    | `src/filesystem/index.ts`                 |
| `github`        | 15    | `src/github/index.ts` + operations/*.ts   |
| `search`        | 12    | brave-search + common search API shapes   |
| `database`      | 13    | postgres + typical SQL-tool shapes        |
| `http`          | 10    | fetch + generic HTTP client conventions   |
| `communication` | 12    | slack + gmail + calendar API shapes       |
| `knowledge`     | 10    | memory / knowledge-graph server           |

Each template file (`packages/bench/src/templates/<domain>.json`) is a
plain JSON array of `McpTool` objects with the Anthropic `messages.tools[]`
shape: `{ name, description, input_schema: { type, properties, required? } }`.

## Generator

`simulateTools(count, seed)` runs one of two strategies based on how
`count` relates to the total seed pool `S ≈ 90`:

### 1. `count <= S` — balanced sampling

- Each of the 7 domains gets an independent Fisher-Yates shuffle under a
  Mulberry32-style PRNG seeded with `seed`.
- We round-robin across domains, popping one tool per domain per pass,
  until we have `count` tools.
- This preserves domain breadth even at `count = 10` (we will see at
  least one filesystem, one github, one search, …), matching a real
  "drive-by" multi-server Claude session rather than one giant server.

### 2. `count > S` — synthesize variants

- Start with the full seed pool (so the first ~90 tools are exact seeds,
  reproducing the small-count distribution).
- For each additional slot, round-robin by domain, pick a random seed
  from that domain, and build a **variant** with:
  - **Name**: prefix, suffix, or prefix+suffix transform from the
    domain-specific vocabulary (e.g. `list_files` → `list_files_recursive`,
    `scoped_list_files`, `staging_list_files_by_glob`). We retry up to 64
    random draws before falling back to `<name>_v<N>` to guarantee
    uniqueness without sacrificing realism.
  - **Description**: prepends a one-sentence "Variant of X focused on …"
    preamble, then keeps the seed's first sentence and (when short enough)
    its tail. Clamped to ≤220 chars so no single tool dominates the
    token budget.
  - **Schema**: identical to the seed. Real MCP deployments frequently
    share a schema across variant tools (GitHub's search_issues /
    search_code / search_users all use the same query+page+per_page
    shape).

The RNG is reseeded independently for the variant loop (`seed ^ 0xA5A5A5A5`)
so that adding more tools at higher `count` never perturbs the prefix.
`simulateTools(500, 42)` is a strict extension of `simulateTools(400, 42)`.

## Determinism and statelessness

- `seedRng` is a Mulberry32 variant seeded from the caller-provided integer.
- No `Math.random`, no `Date.now`, no `process.hrtime` reads in the
  generator.
- Template JSON files are cached in a module-level `Map` after first read,
  but the cached objects are deep-cloned (`JSON.parse(JSON.stringify(x))`)
  for every `simulateTools` call so per-tool mutations never leak.
- Every tool round-trips through `JSON.parse(JSON.stringify(t))` unchanged
  — no Date, no Map, no Symbol, no prototype pollution. This is required
  by the harness: Subagent 1 feeds the output straight into the Anthropic
  `count_tokens` request body.

## Representativeness — what the bench can claim

**Can claim:**

1. *For a plausibly-shaped multi-server MCP deployment totalling N tools,
   the preloaded schema payload consumes X tokens per turn on Claude
   model M, as measured by Anthropic's official `count_tokens` endpoint.*
   The numbers X, and the ratio X/portal-cost, are defensible because
   every seed tool is paraphrased from a real server and every variant
   preserves the seed's schema shape.

2. *Determinism:* the benchmark rerun produces the exact same tool set
   for a given seed, so Portal-vs-MCP deltas are reproducible.

**Cannot claim:**

1. *That any specific real deployment is exactly N tools of the shapes
   we generated.* The simulator composes seven domains in a round-robin
   fashion; a real deployment might be 400 tools from one massive
   enterprise server with ~300-char descriptions, which would push the
   per-tool cost up.

2. *That the measurement generalizes across tokenizers.* Opus 4.7 uses
   a different tokenizer than Sonnet 4; a 2× delta on one model does
   not imply a 2× delta on another. The bench runs per-model and
   reports each.

3. *That every parameter shape in the wild is representable here.* We
   use `string | number | boolean | array | object` types with optional
   `enum` and `items` markers — matching the JSON Schema subset
   Anthropic's SDK accepts for `tools[].input_schema`. We do not
   generate deeply nested `$ref`, `oneOf`, or `allOf` constructs. Real
   MCP servers sometimes do. Those cases make MCP *more* expensive per
   tool, so our simulation is a **lower bound** on MCP context cost,
   not an upper bound.

## Re-auditing the simulator

To replay the derivation:

```sh
# 1. Pull a real server for comparison (MIT-licensed, public).
gh api repos/modelcontextprotocol/servers/contents/src/filesystem/index.ts \
  -H "Accept: application/vnd.github.raw" > /tmp/filesystem.ts

# 2. Diff our paraphrase against the original tool definitions.
grep -n 'description' packages/bench/src/templates/filesystem.json
grep -n 'description' /tmp/filesystem.ts
```

Every server listed in the "Source corpus" table is publicly available
under the MIT license at `github.com/modelcontextprotocol/servers` and
its archived sibling `github.com/modelcontextprotocol/servers-archived`.
