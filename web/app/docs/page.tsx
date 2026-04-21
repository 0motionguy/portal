import { Foot, Nav } from "@/components/Nav";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Portal is the minimal HTTP contract for agent-accessible services. Two endpoints. No install. No SDK required.",
};

export default function DocsPage() {
  return (
    <>
      <Nav active="docs" />
      <main className="page">
        <span className="eyebrow">▶ adopter quickstart · v0.1.4</span>
        <h1>
          Portal — <em>adopter quickstart.</em>
        </h1>
        <p className="lede">
          If your service has a URL, an agent can visit it. This page shows both sides of the
          contract: how to <em>visit</em> a Portal (two curl commands) and how to <em>serve</em>{" "}
          one (two routes and one manifest). Everything below is optional detail.
        </p>

        <h2 id="what">What is it?</h2>
        <p>
          Portal is the minimal HTTP contract for agent-accessible services.{" "}
          <strong>Two endpoints. That's the whole protocol.</strong> Use Portal when MCP is too
          heavy and REST is too dumb — stateless drive-by tool calls that any LLM client can make
          without installing anything on the visitor side.
        </p>

        <h2 id="visit">How to visit a service</h2>
        <p>
          A visitor is any process that speaks HTTP. Two requests get you from zero to a tool
          result:
        </p>
        <pre>
          <code>{`# 1. Discover — read the manifest
curl https://demo.visitportal.dev/portal

# 2. Call — execute a tool
curl -X POST https://demo.visitportal.dev/portal/call \\
  -H 'content-type: application/json' \\
  -d '{"tool":"top_gainers","params":{"limit":3}}'`}</code>
        </pre>
        <p>
          No client library required. Works from bash, Python <code>urllib</code>, any{" "}
          <code>fetch</code>. A convenience TypeScript SDK (<code>@visitportal/visit</code>) exists
          and is covered below, but it is strictly optional.
        </p>

        <h2 id="serve">How to make your service visitable</h2>
        <p>
          Two route handlers and one manifest. Framework-agnostic pseudocode; every web framework
          with a request/response API can host a Portal in under twenty lines.
        </p>
        <pre>
          <code>{`// GET /portal  — serve the manifest
app.get('/portal', (req, res) => {
  res.json({
    portal_version: '0.1',
    name: 'My Service',
    brief: 'What this service does, in plain English.',
    tools: [
      { name: 'ping', description: 'returns pong',
        params: { msg: { type: 'string' } } },
    ],
    call_endpoint: 'https://my-service.com/portal/call',
    auth: 'none',
    pricing: { model: 'free' },
  });
});

// POST /portal/call  — execute a tool
app.post('/portal/call', async (req, res) => {
  const { tool, params } = req.body;
  if (tool === 'ping') {
    return res.json({ ok: true, result: { pong: true, msg: params?.msg } });
  }
  res.json({
    ok: false,
    error: \`tool '\${tool}' not in manifest\`,
    code: 'NOT_FOUND',
  });
});`}</code>
        </pre>
        <p>
          This shape works identically in Hono, Express, Fastify, Bun.serve, Cloudflare Workers,
          Next.js App Router, and FastAPI. The wire contract is the same.
        </p>

        <h2 id="manifest">The manifest</h2>
        <p>
          A v0.1-conformant manifest is compact. Required keys: <code>portal_version</code>,{" "}
          <code>name</code>, <code>brief</code>, <code>tools[]</code>, <code>call_endpoint</code>.
          Optional: <code>auth</code>, <code>pricing</code>.
        </p>
        <pre>
          <code>{`{
  "portal_version": "0.1",
  "name": "My Service",
  "brief": "Natural-language description for the visiting LLM.",
  "tools": [
    {
      "name": "ping",
      "description": "returns pong",
      "params": { "msg": { "type": "string" } }
    }
  ],
  "call_endpoint": "https://my-service.com/portal/call",
  "auth": "none",
  "pricing": { "model": "free" }
}`}</code>
        </pre>
        <p>
          Tool params accept the sugar form <code>{"{ type, required?, description? }"}</code> for
          the 95% case, or a full JSON Schema via <code>paramsSchema</code> for the rest. The two
          forms are mutually exclusive per-tool. <code>call_endpoint</code> must be{" "}
          <code>https://</code> with a loopback escape hatch for <code>http://localhost</code> and{" "}
          <code>http://127.0.0.1</code> during development.
        </p>

        <h2 id="envelope">The envelope</h2>
        <p>
          Every <code>POST /portal/call</code> takes{" "}
          <code>{'{ "tool": string, "params": object }'}</code> and returns one of two
          discriminated-union shapes:
        </p>
        <pre>
          <code>{`// success
{ "ok": true, "result": { /* tool-defined */ } }

// failure
{ "ok": false, "error": "human-readable message", "code": "NOT_FOUND" }`}</code>
        </pre>

        <h2 id="errors">Error codes</h2>
        <p>
          The <code>code</code> field is one of five values; this is the entire surface your
          visitor needs to understand. HTTP status mapping is normative:
        </p>
        <ul>
          <li>
            <code>NOT_FOUND</code> — tool name isn't in the manifest · <strong>HTTP 404</strong>
          </li>
          <li>
            <code>INVALID_PARAMS</code> — params failed validation · <strong>HTTP 400</strong>
          </li>
          <li>
            <code>UNAUTHORIZED</code> — caller lacks credentials · <strong>HTTP 401</strong>
          </li>
          <li>
            <code>RATE_LIMITED</code> — transient; visitors SHOULD retry after{" "}
            <code>Retry-After</code> · <strong>HTTP 429</strong>
          </li>
          <li>
            <code>INTERNAL</code> — anything else · <strong>HTTP 500</strong>
          </li>
        </ul>

        <h2 id="cors">CORS (Appendix C)</h2>
        <p>
          For browser-resident visitors, Portal requires a short, normative CORS contract. Both
          endpoints MUST handle <code>OPTIONS</code> preflight and MUST set{" "}
          <code>Access-Control-Allow-Origin</code>. Credentialed requests have per-auth-mode
          semantics. See{" "}
          <a href="https://github.com/0motionguy/portal/blob/main/docs/spec-v0.1.1.md#appendix-c--cors">
            spec Appendix C
          </a>{" "}
          for the full table.
        </p>

        <h2 id="rate-limits">Rate limiting (Appendix D)</h2>
        <p>
          Portal SHOULDs a per-auth-mode default for rate limits. Visitor SDKs MUST treat{" "}
          <code>RATE_LIMITED</code> as recoverable and SHOULD honor <code>Retry-After</code>.
          Providers without a rate-limit strategy of their own can adopt the defaults verbatim. See{" "}
          <a href="https://github.com/0motionguy/portal/blob/main/docs/spec-v0.1.1.md#appendix-d--rate-limits">
            spec Appendix D
          </a>
          .
        </p>

        <h2 id="sdk">
          SDK <em>(optional)</em>
        </h2>
        <p>
          <strong>The SDK is a convenience, not a requirement.</strong> Any HTTP client works; the
          spec is the wire contract. For TypeScript adopters who want typed errors and a one-liner
          handshake, <code>@visitportal/visit</code> ships a 2.25 kB gzipped, zero-dependency
          client:
        </p>
        <pre>
          <code>{`import { visit, CallFailed } from '@visitportal/visit';

const portal = await visit('https://my-service.com/portal');
const result = await portal.call('top_gainers', { limit: 3 });`}</code>
        </pre>
        <p>
          Error taxonomy: <code>PortalNotFound</code>, <code>ManifestInvalid</code>,{" "}
          <code>ToolNotInManifest</code>, <code>CallFailed</code>. <code>CallFailed.code</code> is
          typed as the five-code enum above. Python and other-language SDKs follow; the wire
          contract is the constant.
        </p>

        <h2 id="conformance">Conformance</h2>
        <p>
          If your service is already exposing <code>GET /portal</code> and{" "}
          <code>POST /portal/call</code>, the shortest path from zero to a pass/fail answer is{" "}
          <code>runSmokeConformance</code>:
        </p>
        <pre>
          <code>{`npm i @visitportal/spec

import { runSmokeConformance } from '@visitportal/spec';
const report = await runSmokeConformance('https://my-service.com/portal');
console.log(report);`}</code>
        </pre>
        <p>
          It validates the manifest against the JSON Schema and verifies a <code>NOT_FOUND</code>{" "}
          round-trip on <code>POST /portal/call</code>. Runs in under a second; safe against a live
          service. For the full offline suite — all 30+ vectors, deterministic, no network — use{" "}
          <code>validateAgainstVectors</code>:
        </p>
        <pre>
          <code>{`import { validateAgainstVectors } from '@visitportal/spec';
import manifest from './portal.json' assert { type: 'json' };

const report = validateAgainstVectors(manifest);
if (!report.ok) {
  console.error(report.failures);
  process.exit(1);
}`}</code>
        </pre>

        <h2 id="extensions">Extensions</h2>
        <p>
          Base Portal stays minimal on purpose. Additional capabilities ship as explicitly-versioned
          Portal Extensions (PE-###), none of which are required for base conformance:
        </p>
        <ul>
          <li>
            <strong>PE-001</strong> — streaming responses (draft)
          </li>
          <li>
            <strong>PE-002</strong> — paid tools via <code>x402</code> micropayments (draft · see{" "}
            <a href="https://github.com/0motionguy/portal/blob/main/docs/pe-002-paid-tools-draft.md">
              docs/pe-002-paid-tools-draft.md
            </a>
            )
          </li>
        </ul>

        <h2 id="layers">Three-layer model</h2>
        <p>
          Portal for drive-by visits. MCP for installed tools. A2A for agent coordination.{" "}
          <strong>They compose.</strong>
        </p>
        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Protocol</th>
              <th>Use case</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>
                <strong>Portal</strong>
              </td>
              <td>Drive-by HTTP visits. Stateless. No install.</td>
            </tr>
            <tr>
              <td>2</td>
              <td>MCP</td>
              <td>Installed stateful tools.</td>
            </tr>
            <tr>
              <td>3</td>
              <td>A2A</td>
              <td>Multi-agent coordination.</td>
            </tr>
          </tbody>
        </table>
      </main>
      <Foot />
    </>
  );
}
