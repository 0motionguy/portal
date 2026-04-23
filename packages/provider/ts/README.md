# @visitportal/provider

Optional helper library for Portal providers. Nothing here you cannot do with raw HTTP; this package exists to kill boilerplate.

## What it does

- Builds a manifest from typed tool definitions
- Validates the manifest against `@visitportal/spec`
- Dispatches `{ tool, params }` requests into your handlers
- Exposes a fetch-native `portal.fetch(request)` helper for Edge / Workers / route handlers

## Install

```sh
npm i @visitportal/provider
```

## Example

```ts
import { serve } from "@visitportal/provider";

const portal = serve({
  name: "My Service",
  brief: "One sentence describing what a visiting LLM can do here.",
  call_endpoint: "/portal/call",
  tools: [
    {
      name: "ping",
      description: "returns pong",
      async handler(params) {
        return { pong: true, msg: params.msg ?? null };
      },
    },
  ],
});

export default {
  fetch(request: Request) {
    return portal.fetch(request);
  },
};
```

If you already have a static `portal.json`, `serve()` also accepts `{ manifest, handlers }`.

The reference implementation in [reference/trending-demo](../../../reference/trending-demo/) now uses this package for manifest validation and call dispatch.
