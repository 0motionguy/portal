# Portal bench — 2026-04-19T08-05-29-466Z

**Mode:** `count_tokens_only` · **Seed:** `42` · **Runs/cell:** 1 · **Cells:** 48

**Started:** 2026-04-19T08:05:10.635Z  
**Finished:** 2026-04-19T08:05:29.466Z

**Raw JSON:** `bench-2026-04-19T08-05-29-466Z.json` · **Chart:** `bench-2026-04-19T08-05-29-466Z.svg`

## Summary — median input tokens by tool count and protocol

| Tool count | MCP median tokens | Portal median tokens | Portal / MCP |
|---:|---:|---:|---:|
| 10 | 1956 | 172 | 8.8% |
| 50 | 7343 | 172 | 2.3% |
| 100 | 13929 | 172 | 1.2% |
| 400 | 54677 | 172 | 0.3% |

## Per-cell detail

| # | Protocol | Tools | Task | Model | Run | Input | Output | Latency ms | Cost USD | ok |
|---:|---|---:|---|---|---:|---:|---:|---:|---:|:-:|
| 0 | mcp | 10 | find_trending_ai | `claude-sonnet-4-5` | 0 | 1960 | 0 | 484 | 0.005880 | yes |
| 1 | mcp | 10 | find_trending_ai | `claude-opus-4-5` | 0 | 1960 | 0 | 642 | 0.029400 | yes |
| 2 | mcp | 10 | summarize_repo | `claude-sonnet-4-5` | 0 | 1956 | 0 | 411 | 0.005868 | yes |
| 3 | mcp | 10 | summarize_repo | `claude-opus-4-5` | 0 | 1956 | 0 | 316 | 0.029340 | yes |
| 4 | mcp | 10 | search_agent_protocol | `claude-sonnet-4-5` | 0 | 1948 | 0 | 387 | 0.005844 | yes |
| 5 | mcp | 10 | search_agent_protocol | `claude-opus-4-5` | 0 | 1948 | 0 | 370 | 0.029220 | yes |
| 6 | mcp | 50 | find_trending_ai | `claude-sonnet-4-5` | 0 | 7347 | 0 | 559 | 0.022041 | yes |
| 7 | mcp | 50 | find_trending_ai | `claude-opus-4-5` | 0 | 7347 | 0 | 348 | 0.110205 | yes |
| 8 | mcp | 50 | summarize_repo | `claude-sonnet-4-5` | 0 | 7343 | 0 | 312 | 0.022029 | yes |
| 9 | mcp | 50 | summarize_repo | `claude-opus-4-5` | 0 | 7343 | 0 | 381 | 0.110145 | yes |
| 10 | mcp | 50 | search_agent_protocol | `claude-sonnet-4-5` | 0 | 7335 | 0 | 454 | 0.022005 | yes |
| 11 | mcp | 50 | search_agent_protocol | `claude-opus-4-5` | 0 | 7335 | 0 | 355 | 0.110025 | yes |
| 12 | mcp | 100 | find_trending_ai | `claude-sonnet-4-5` | 0 | 13933 | 0 | 401 | 0.041799 | yes |
| 13 | mcp | 100 | find_trending_ai | `claude-opus-4-5` | 0 | 13933 | 0 | 340 | 0.208995 | yes |
| 14 | mcp | 100 | summarize_repo | `claude-sonnet-4-5` | 0 | 13929 | 0 | 400 | 0.041787 | yes |
| 15 | mcp | 100 | summarize_repo | `claude-opus-4-5` | 0 | 13929 | 0 | 327 | 0.208935 | yes |
| 16 | mcp | 100 | search_agent_protocol | `claude-sonnet-4-5` | 0 | 13921 | 0 | 343 | 0.041763 | yes |
| 17 | mcp | 100 | search_agent_protocol | `claude-opus-4-5` | 0 | 13921 | 0 | 342 | 0.208815 | yes |
| 18 | mcp | 400 | find_trending_ai | `claude-sonnet-4-5` | 0 | 54681 | 0 | 952 | 0.164043 | yes |
| 19 | mcp | 400 | find_trending_ai | `claude-opus-4-5` | 0 | 54681 | 0 | 452 | 0.820215 | yes |
| 20 | mcp | 400 | summarize_repo | `claude-sonnet-4-5` | 0 | 54677 | 0 | 432 | 0.164031 | yes |
| 21 | mcp | 400 | summarize_repo | `claude-opus-4-5` | 0 | 54677 | 0 | 384 | 0.820155 | yes |
| 22 | mcp | 400 | search_agent_protocol | `claude-sonnet-4-5` | 0 | 54669 | 0 | 432 | 0.164007 | yes |
| 23 | mcp | 400 | search_agent_protocol | `claude-opus-4-5` | 0 | 54669 | 0 | 552 | 0.820035 | yes |
| 24 | portal | 10 | find_trending_ai | `claude-sonnet-4-5` | 0 | 176 | 0 | 319 | 0.000528 | yes |
| 25 | portal | 10 | find_trending_ai | `claude-opus-4-5` | 0 | 176 | 0 | 314 | 0.002640 | yes |
| 26 | portal | 10 | summarize_repo | `claude-sonnet-4-5` | 0 | 172 | 0 | 353 | 0.000516 | yes |
| 27 | portal | 10 | summarize_repo | `claude-opus-4-5` | 0 | 172 | 0 | 373 | 0.002580 | yes |
| 28 | portal | 10 | search_agent_protocol | `claude-sonnet-4-5` | 0 | 164 | 0 | 336 | 0.000492 | yes |
| 29 | portal | 10 | search_agent_protocol | `claude-opus-4-5` | 0 | 164 | 0 | 331 | 0.002460 | yes |
| 30 | portal | 50 | find_trending_ai | `claude-sonnet-4-5` | 0 | 176 | 0 | 340 | 0.000528 | yes |
| 31 | portal | 50 | find_trending_ai | `claude-opus-4-5` | 0 | 176 | 0 | 347 | 0.002640 | yes |
| 32 | portal | 50 | summarize_repo | `claude-sonnet-4-5` | 0 | 172 | 0 | 338 | 0.000516 | yes |
| 33 | portal | 50 | summarize_repo | `claude-opus-4-5` | 0 | 172 | 0 | 677 | 0.002580 | yes |
| 34 | portal | 50 | search_agent_protocol | `claude-sonnet-4-5` | 0 | 164 | 0 | 326 | 0.000492 | yes |
| 35 | portal | 50 | search_agent_protocol | `claude-opus-4-5` | 0 | 164 | 0 | 321 | 0.002460 | yes |
| 36 | portal | 100 | find_trending_ai | `claude-sonnet-4-5` | 0 | 176 | 0 | 341 | 0.000528 | yes |
| 37 | portal | 100 | find_trending_ai | `claude-opus-4-5` | 0 | 176 | 0 | 357 | 0.002640 | yes |
| 38 | portal | 100 | summarize_repo | `claude-sonnet-4-5` | 0 | 172 | 0 | 331 | 0.000516 | yes |
| 39 | portal | 100 | summarize_repo | `claude-opus-4-5` | 0 | 172 | 0 | 366 | 0.002580 | yes |
| 40 | portal | 100 | search_agent_protocol | `claude-sonnet-4-5` | 0 | 164 | 0 | 324 | 0.000492 | yes |
| 41 | portal | 100 | search_agent_protocol | `claude-opus-4-5` | 0 | 164 | 0 | 332 | 0.002460 | yes |
| 42 | portal | 400 | find_trending_ai | `claude-sonnet-4-5` | 0 | 176 | 0 | 336 | 0.000528 | yes |
| 43 | portal | 400 | find_trending_ai | `claude-opus-4-5` | 0 | 176 | 0 | 314 | 0.002640 | yes |
| 44 | portal | 400 | summarize_repo | `claude-sonnet-4-5` | 0 | 172 | 0 | 295 | 0.000516 | yes |
| 45 | portal | 400 | summarize_repo | `claude-opus-4-5` | 0 | 172 | 0 | 379 | 0.002580 | yes |
| 46 | portal | 400 | search_agent_protocol | `claude-sonnet-4-5` | 0 | 164 | 0 | 369 | 0.000492 | yes |
| 47 | portal | 400 | search_agent_protocol | `claude-opus-4-5` | 0 | 164 | 0 | 331 | 0.002460 | yes |

## Methodology

- **Token counts** come from `POST /v1/messages/count_tokens` on the Anthropic API (not estimated).
- **MCP path:** every tool in the simulated catalog is passed in `tools` on every count_tokens request. This is the preloaded-schema overhead the protocol pays per turn.
- **Portal path:** `tools: []`, plus a short system preamble describing how to invoke a visited tool. The preamble is reproduced verbatim below.
- **In `count_tokens_only` mode** we only measure prompt-side cost. In `full` mode we additionally call `messages.create` once per cell to measure end-to-end latency and verify the model selects the expected tool.
- **Cost math:** input_tokens × input-rate + output_tokens × output-rate.

### Portal system preamble (verbatim)

```text
You have visited a Portal. Before each turn, the visitor SDK gave you a compact manifest describing the service's tools. The manifest itself is not re-sent on every turn — only the tool you want to call and its params. When you call a tool, respond with: portal_call { "tool": "<name>", "params": { ... } }. Keep params minimal. One tool call per turn. The service will reply with { ok, result } or { ok:false, error, code }.
```

### Model pricing

| Model | Input $/M | Output $/M |
|---|---:|---:|
| `claude-sonnet-4-5` | 3.00 | 15.00 |
| `claude-opus-4-5` | 15.00 | 75.00 |

