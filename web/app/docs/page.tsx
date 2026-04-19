import type { Metadata } from "next";
import { Nav, Foot } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Docs",
  description: "Portal v0.1.1 — adopter quickstart. Conformance in 30 seconds.",
};

export default function DocsPage() {
  return (
    <>
      <Nav active="docs" />
      <main className="page">
        <span className="eyebrow">▶ adopter quickstart · v0.1.1</span>
        <h1>
          Portal — <em>adopter quickstart.</em>
        </h1>
        <p className="lede">
          You have a service with some HTTP endpoints. You want any LLM client
          to be able to visit it cold and call a tool. Portal is that, in two
          endpoints and one manifest. The fastest way to know you're conformant
          is to run <code>runSmokeConformance</code> against your live Portal
          and read the report. That's the first thing on this page.
        </p>

        <h2 id="conformance-30s">30-second conformance check</h2>
        <p>
          If your service is already exposing <code>GET /portal</code> and{" "}
          <code>POST /portal/call</code>, here is the shortest path from zero
          to a pass/fail answer:
        </p>
        <pre>
          <code>{`npm i @visitportal/spec

import { runSmokeConformance } from '@visitportal/spec';
const report = await runSmokeConformance('https://my-service.com/portal');
console.log(report);`}</code>
        </pre>
        <p>
          <code>runSmokeConformance</code> is a <em>smoke</em> check — it
          validates the manifest against the JSON Schema and verifies a{" "}
          <code>NOT_FOUND</code> round-trip on <code>POST /portal/call</code>.
          It runs in under a second and is safe to hit a live service with. If
          it returns <code>{"{ ok: true }"}</code>, the basics are right;
          adopters typically run this in CI against a staging URL.
        </p>
        <p>
          The package is Apache 2.0 + CC0 dual-licensed and has zero runtime
          dependencies outside of <code>ajv</code>.
        </p>

        <h2 id="conformance-full">Full offline conformance</h2>
        <p>
          When you want the full suite — all 30+ vectors against a manifest
          literal, no network, deterministic — use{" "}
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
        <p>
          This is the flow we recommend for a pre-commit hook or CI check that
          runs on every manifest edit. Every failure entry cites the exact
          vector id and the schema rule it tests, so you can jump straight to
          the fix.
        </p>

        <h2 id="manifest">Manifest shape</h2>
        <p>
          A v0.1.1-conformant manifest is compact. Required keys:{" "}
          <code>portal_version</code>, <code>name</code>, <code>brief</code>,{" "}
          <code>tools[]</code>, <code>call_endpoint</code>. Optional:{" "}
          <code>auth</code>, <code>pricing</code>.
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
          Tool params accept the sugar form{" "}
          <code>{"{ type, required?, description? }"}</code> for the 95% case,
          or a full JSON Schema via <code>paramsSchema</code> for the rest.
          The two forms are mutually exclusive per-tool.{" "}
          <code>call_endpoint</code> must be <code>https://</code> with a
          loopback escape hatch for <code>http://localhost</code> and{" "}
          <code>http://127.0.0.1</code> during development.
        </p>

        <h2 id="error-envelope">Error envelope — five codes</h2>
        <p>
          Every <code>POST /portal/call</code> response is either{" "}
          <code>{"{ ok: true, result }"}</code> or{" "}
          <code>{"{ ok: false, error, code }"}</code>. The code is one of five
          values; this is the entire surface your visitor needs to understand:
        </p>
        <ul>
          <li><code>NOT_FOUND</code> — tool name isn't in the manifest</li>
          <li><code>INVALID_PARAMS</code> — params failed validation</li>
          <li><code>UNAUTHORIZED</code> — caller lacks credentials</li>
          <li><code>RATE_LIMITED</code> — transient; visitors SHOULD retry after{" "}<code>Retry-After</code></li>
          <li><code>INTERNAL</code> — anything else</li>
        </ul>

        <h2 id="cors">CORS (Appendix C)</h2>
        <p>
          For browser-resident visitors, Portal requires a short, normative
          CORS contract. Both endpoints MUST handle <code>OPTIONS</code>{" "}
          preflight and MUST set <code>Access-Control-Allow-Origin</code>.
          Credentialed requests have per-auth-mode semantics. See{" "}
          <a href="https://github.com/0motionguy/portal/blob/main/docs/spec-v0.1.1.md#appendix-c--cors">
            spec Appendix C
          </a>{" "}
          for the full table.
        </p>

        <h2 id="rate-limits">Rate limits (Appendix D)</h2>
        <p>
          Portal SHOULDs a per-auth-mode default for rate limits. Visitor SDKs
          MUST treat <code>RATE_LIMITED</code> as recoverable and SHOULD honor{" "}
          <code>Retry-After</code>. Providers without a rate-limit strategy of
          their own can adopt the defaults verbatim. See{" "}
          <a href="https://github.com/0motionguy/portal/blob/main/docs/spec-v0.1.1.md#appendix-d--rate-limits">
            spec Appendix D
          </a>.
        </p>

        <h2 id="nextjs">Framework snippet — Next.js App Router</h2>
        <p>
          A minimal Portal in Next.js 15 App Router is two route handlers.
          Other framework quickstarts (Hono, FastAPI, Express) are queued for
          v0.1.2.
        </p>
        <pre>
          <code>{`// app/portal/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    portal_version: '0.1',
    name: 'My Service',
    brief: 'What this service does, in plain English.',
    tools: [
      { name: 'ping', description: 'returns pong',
        params: { msg: { type: 'string' } } },
    ],
    call_endpoint: \`\${process.env.PORTAL_PUBLIC_URL}/portal/call\`,
    auth: 'none',
    pricing: { model: 'free' },
  });
}

// app/portal/call/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { tool, params } = await req.json();
  if (tool === 'ping') {
    return NextResponse.json({
      ok: true,
      result: { pong: true, msg: params?.msg },
    });
  }
  return NextResponse.json({
    ok: false,
    error: \`tool '\${tool}' not in manifest\`,
    code: 'NOT_FOUND',
  });
}`}</code>
        </pre>

        <h2 id="visitor-sdk">Visitor SDK — <em>@visitportal/visit</em></h2>
        <p>
          On the calling side, the visitor SDK is three lines:
        </p>
        <pre>
          <code>{`import { visit, CallFailed } from '@visitportal/visit';

const portal = await visit('https://my-service.com/portal');
const result = await portal.call('top_gainers', { limit: 3 });`}</code>
        </pre>
        <p>
          Error taxonomy: <code>PortalNotFound</code>,{" "}
          <code>ManifestInvalid</code>, <code>ToolNotInManifest</code>,{" "}
          <code>CallFailed</code>. <code>CallFailed.code</code> is typed as
          the five-code enum above. SDK bundle is 2.25 kB gzipped with zero
          runtime dependencies.
        </p>

        <h2 id="spec-glance">Spec — <em>at a glance</em></h2>
        <p>
          Full text:{" "}
          <a href="https://github.com/0motionguy/portal/blob/main/docs/spec-v0.1.1.md">
            docs/spec-v0.1.1.md
          </a>{" "}
          (public domain). One page of core plus four appendices — the A/B
          appendices from v0.1.0 and the new normative CORS (C) and SHOULD-level
          rate-limit (D) appendices added in v0.1.1.
        </p>
        <table>
          <thead>
            <tr>
              <th>Section</th>
              <th>What it pins</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>§3 Endpoints</td>
              <td>
                <code>GET /portal</code> returns a manifest;{" "}
                <code>POST /portal/call</code> takes{" "}
                <code>{"{ tool, params }"}</code>, returns{" "}
                <code>{"{ ok, result }"}</code> or{" "}
                <code>{"{ ok: false, error, code }"}</code>.
              </td>
            </tr>
            <tr>
              <td>§4 Manifest</td>
              <td>
                Required: <code>portal_version</code>, <code>name</code>,{" "}
                <code>brief</code>, <code>tools[]</code>,{" "}
                <code>call_endpoint</code>. Optional: <code>auth</code>,{" "}
                <code>pricing</code>.
              </td>
            </tr>
            <tr>
              <td>§6 Error codes</td>
              <td>
                <code>NOT_FOUND · INVALID_PARAMS · UNAUTHORIZED · RATE_LIMITED · INTERNAL</code>.
              </td>
            </tr>
            <tr>
              <td>§7 Non-goals</td>
              <td>
                No task lifecycles (use A2A). No stateful sessions. No
                server-push, no streaming, no multi-agent. Those arrive as
                Portal Extensions.
              </td>
            </tr>
            <tr>
              <td>Appendix C</td>
              <td>Normative CORS contract for browser-resident visitors.</td>
            </tr>
            <tr>
              <td>Appendix D</td>
              <td>SHOULD-level rate-limit defaults + <code>Retry-After</code> guidance.</td>
            </tr>
          </tbody>
        </table>

        <h2 id="monorepo-tools">Developer tools in the monorepo</h2>
        <p>
          <em>These are not adopter-facing.</em> If you cloned the Portal
          monorepo to hack on Portal itself, you'll find{" "}
          <code>packages/visit/ts/scripts/reference-demo.ts</code> — a driver
          script that starts <code>reference/trending-demo</code>, visits it,
          and exercises the visitor SDK end-to-end. It's useful for{" "}
          <em>developing the SDK</em>; it's not needed to adopt Portal in your
          own service. Adopters should use <code>runSmokeConformance</code>{" "}
          and <code>validateAgainstVectors</code> above.
        </p>
      </main>
      <Foot />
    </>
  );
}
