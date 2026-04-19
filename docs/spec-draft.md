# Portal v0.1 — Draft Specification

## Status
Draft. Not frozen. Phase 1 of the hackathon will finalize as v0.1.0.

## Summary
Portal is an HTTP-based protocol that lets any LLM client discover and invoke a service's tools without pre-configuration. Two endpoints, one manifest, fire-and-forget.

## Design goals
1. Zero install on the visitor side. Any LLM client with function-calling can visit cold.
2. Zero residue after the session. The manifest drops on exit.
3. Radically small spec surface. The entire v0.1 spec should fit on one page.
4. Drop-in complement to MCP. An MCP server must be wrappable as a Portal in one line.

## Endpoints

### GET /portal
Returns a JSON manifest describing the service. Content-Type: application/json.

### POST /portal/call
Executes a named tool.

Request body: `{ "tool": string, "params": object }`

Response body (success): `{ "ok": true, "result": any }`

Response body (error): `{ "ok": false, "error": string, "code": string }`

## Manifest schema (v0.1 sketch)

    {
      "portal_version": "0.1",
      "name": "string",
      "brief": "natural-language description for the visiting LLM",
      "tools": [
        {
          "name": "string",
          "description": "string",
          "params": {
            "<param_name>": { "type": "string | number | boolean | object | array", "required": boolean }
          }
        }
      ],
      "call_endpoint": "https://...",
      "auth": "none" | "api_key" | "erc8004",
      "pricing": { "model": "free" | "x402", "rate": "string" }
    }

## Non-goals (v0.1)
- Task lifecycles (use A2A when you need those).
- Long-running stateful sessions (use MCP or A2A).
- Server-initiated messages. Visits are strictly client-initiated.
- Streaming responses. v0.2 may add a WebSocket upgrade at /portal/stream.
- Multi-agent choreography. Portal is 1:1 visitor ↔ provider.

## Versioning
The `portal_version` field in the manifest signals compatibility. Breaking changes bump the major version. v0.x minors may add optional fields.

## Optional extensions (separate documents, not base spec)
- `auth: erc8004` — verified agent identity via ERC-8004
- `pricing: x402` — pay-per-call micropayments
- AGP envelope upgrade for stateful sessions
- ClawPulse registry for discovery

These are documented as Portal Extensions (PE-*). Base Portal must work without any of them.

## Verification
Every provider implementation must pass the conformance test suite in /packages/spec/conformance. Every visitor SDK must correctly fetch, validate, and call against any conformant Portal.
