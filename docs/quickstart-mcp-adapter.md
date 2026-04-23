# Quickstart - Wrap an MCP Server as a Portal

`@visitportal/mcp-adapter` exposes an MCP stdio server as a v0.1 Portal. Use it when a service already has MCP tools and you want cold HTTP visits without making every visitor install that MCP server first.

## Install

```sh
npm i @visitportal/mcp-adapter
```

## Run the HTTP bridge

```sh
npx -p @visitportal/mcp-adapter visitportal-mcp-adapter \
  --mcp "npx some-mcp-server" \
  --port 8080
```

The bridge serves:

- `GET http://127.0.0.1:8080/portal`
- `POST http://127.0.0.1:8080/portal/call`

## Call Through Portal

```sh
curl http://127.0.0.1:8080/portal

curl -X POST http://127.0.0.1:8080/portal/call \
  -H 'content-type: application/json' \
  -d '{"tool":"some_tool","params":{}}'
```

MCP tool names are sanitized into Portal-compatible names. For example, `search-repos` becomes `search_repos` in the Portal manifest while the adapter keeps the original MCP tool name internally for dispatch.

## Library API

```ts
import { adaptMcpServer } from "@visitportal/mcp-adapter";

const adapter = await adaptMcpServer({
  command: "node",
  args: ["./my-mcp-server.mjs"],
});

console.log(adapter.manifest.tools);
const result = await adapter.portal.dispatch({
  tool: "search_repos",
  params: { q: "portal" },
});

await adapter.close();
```

The adapter performs the MCP `initialize` handshake, reads `tools/list`, builds a Portal manifest, and forwards Portal calls into MCP `tools/call`.
