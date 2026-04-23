# @visitportal/mcp-adapter

Wrap an MCP stdio server as a Portal. Library plus local HTTP bridge.

## What it does

- launches an MCP server over stdio
- performs the MCP initialize handshake
- lists MCP tools and translates them into a Portal manifest
- forwards `POST /portal/call` requests into MCP `tools/call`
- serves the result through the same fetch-native provider surface as the rest of the repo

## CLI

```sh
visitportal-mcp-adapter --mcp "npx some-mcp-server" --port 8080
```

Then visit:

```sh
curl http://127.0.0.1:8080/portal
curl -X POST http://127.0.0.1:8080/portal/call \
  -H 'content-type: application/json' \
  -d '{"tool":"some_tool","params":{}}'
```

## Library

```ts
import { adaptMcpServer } from "@visitportal/mcp-adapter";

const adapter = await adaptMcpServer({
  command: "node",
  args: ["./mock-mcp-server.mjs"],
});

console.log(adapter.manifest.tools.map((tool) => tool.name));
const result = await adapter.portal.dispatch({ tool: "echo_tool", params: { text: "hi" } });
await adapter.close();
```

Tool names are sanitized into Portal-compatible names when necessary. If the MCP server exposes `echo-tool`, the Portal manifest will expose `echo_tool` and retain the original MCP name internally for dispatch.
