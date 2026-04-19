import type { Metadata } from "next";
import { Nav, Foot } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Docs",
  description: "Portal v0.1 — quickstart, spec, and API reference.",
};

export default function DocsPage() {
  return (
    <>
      <Nav active="docs" />
      <main className="page">
        <span className="eyebrow">▶ documentation · v0.1.0</span>
        <h1>
          Ship a Portal in <em>an hour.</em> Visit one in <em>three lines.</em>
        </h1>
        <p className="lede">
          The shortest path from zero to a working Portal. Two endpoints, one
          manifest, fire-and-forget. Ship as a visitor in ten lines of
          TypeScript, or stand up a provider in an afternoon — the spec fits on
          one page.
        </p>

        <div className="docs-cards">
          <a className="docs-card" href="#quickstart-visitor">
            <span className="tag">VISITOR</span>
            <h3>visit a Portal <em>in 10 lines</em></h3>
            <p>Import <code>visit()</code>, point it at a URL, call a tool. Errors are typed, no install ritual.</p>
            <span className="jump">→ visitor quickstart</span>
          </a>
          <a className="docs-card" href="#quickstart-provider">
            <span className="tag">PROVIDER</span>
            <h3>ship a Portal <em>in an afternoon</em></h3>
            <p>Two HTTP endpoints, any framework. Verify conformance against 30 vectors before you ship.</p>
            <span className="jump">→ provider quickstart</span>
          </a>
          <a className="docs-card" href="#spec-glance">
            <span className="tag">SPEC</span>
            <h3>the v0.1 <em>napkin</em></h3>
            <p>One page of core, three appendices. Endpoints, manifest, errors, non-goals — all in a table.</p>
            <span className="jump">→ spec at a glance</span>
          </a>
        </div>

        <h2 id="quickstart-visitor">Quickstart — <em>visitor</em></h2>
        <p>From a fresh clone:</p>
        <pre>
          <code>{`pnpm install
pnpm --filter @visitportal/cli exec tsx src/cli.ts info \\
  http://localhost:3075/portal`}</code>
        </pre>
        <p>Or via the TypeScript SDK:</p>
        <pre>
          <code>{`import { visit, CallFailed } from "@visitportal/visit";

const portal = await visit("http://localhost:3075/portal");
console.log(portal.manifest.brief);

try {
  const repos = await portal.call("top_gainers", { limit: 3 });
  console.log(repos);
} catch (e) {
  if (e instanceof CallFailed) console.error(e.code, e.message);
}`}</code>
        </pre>
        <p>
          Error taxonomy: <code>PortalNotFound</code>, <code>ManifestInvalid</code>,{" "}
          <code>ToolNotInManifest</code>, <code>CallFailed</code>. <code>CallFailed.code</code>{" "}
          is one of <code>NOT_FOUND</code>, <code>INVALID_PARAMS</code>,{" "}
          <code>UNAUTHORIZED</code>, <code>RATE_LIMITED</code>, <code>INTERNAL</code>.
        </p>

        <h2 id="quickstart-provider">Quickstart — <em>provider</em></h2>
        <p>
          A v0.1-conformant Portal needs two HTTP endpoints. No framework is
          required — the reference uses Hono for ergonomics; any HTTP server
          will work.
        </p>
        <pre>
          <code>{`// GET /portal — return manifest (schema-validated)
app.get("/portal", (c) => c.json({
  portal_version: "0.1",
  name: "My Service",
  brief: "Natural-language description for the visiting LLM.",
  tools: [
    { name: "ping", description: "returns pong",
      params: { msg: { type: "string" } } },
  ],
  call_endpoint: \`\${PUBLIC_URL}/portal/call\`,
  auth: "none",
  pricing: { model: "free" },
}));

// POST /portal/call — dispatch tools
app.post("/portal/call", async (c) => {
  const { tool, params } = await c.req.json();
  if (tool === "ping") {
    return c.json({ ok: true, result: { pong: true, msg: params?.msg } });
  }
  return c.json({ ok: false, error: \`tool '\${tool}' not in manifest\`,
                  code: "NOT_FOUND" });
});`}</code>
        </pre>
        <p>
          Verify conformance against any v0.1 Portal URL (errors, schema,
          envelope shape):
        </p>
        <pre>
          <code>pnpm conformance https://your.service/portal</code>
        </pre>

        <h2 id="spec-glance">Spec — <em>at a glance</em></h2>
        <p>
          Full text: <a href="https://github.com/mbasildolger/portal/blob/main/docs/spec-v0.1.0.md">
            docs/spec-v0.1.0.md
          </a> (public domain). One page of core + three appendices.
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
                <code>POST /portal/call</code> takes <code>{"{ tool, params }"}</code>,
                returns <code>{"{ ok, result }"}</code> or <code>{"{ ok: false, error, code }"}</code>.
              </td>
            </tr>
            <tr>
              <td>§4 Manifest</td>
              <td>
                Required: <code>portal_version</code>, <code>name</code>, <code>brief</code>,{" "}
                <code>tools[]</code>, <code>call_endpoint</code>. Optional: <code>auth</code>,{" "}
                <code>pricing</code>.
              </td>
            </tr>
            <tr>
              <td>§4.3 Tool params</td>
              <td>
                Sugar form <code>{"{ type, required?, description? }"}</code> for 95% of cases;{" "}
                JSON Schema escape hatch via <code>paramsSchema</code> for the rest. Mutually exclusive.
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
                No task lifecycles (use A2A). No stateful sessions (use MCP or A2A). No
                server-push, no streaming, no multi-agent. Those arrive as Portal Extensions.
              </td>
            </tr>
            <tr>
              <td>§9 Conformance</td>
              <td>
                30 vectors in <code>packages/spec/conformance/vectors.json</code>. Both an
                authoritative ajv validator and a lean SDK-facing one, cross-checked in CI.
              </td>
            </tr>
          </tbody>
        </table>

        <h2>API reference — <em>@visitportal/visit</em></h2>
        <h3>
          <code>visit(url, opts?) → Promise&lt;Portal&gt;</code>
        </h3>
        <p>
          Fetches <code>GET {"<url>"}</code>, validates against the manifest schema,
          returns a <code>Portal</code> handle. Throws <code>PortalNotFound</code> on
          transport failure / non-2xx; <code>ManifestInvalid</code> on schema violation.
        </p>
        <p>Options:</p>
        <ul>
          <li><code>timeoutMs</code> (default 5000)</li>
          <li><code>headers</code> — merged into GET</li>
          <li><code>fetchImpl</code> — override for testing / non-browser runtimes</li>
        </ul>
        <h3>
          <code>Portal.call(tool, params, opts?) → Promise&lt;T&gt;</code>
        </h3>
        <p>
          Invokes a tool. Throws <code>ToolNotInManifest</code> client-side before any
          HTTP if the tool isn't in <code>manifest.tools[]</code>.{" "}
          Throws <code>CallFailed</code> for envelope errors, malformed responses, or
          transport failures. <code>CallFailed.code</code> is typed as the 5-code enum.
        </p>
        <h3><code>Portal.tools : readonly string[]</code> · <code>Portal.hasTool(name) : boolean</code></h3>
        <p>Introspection of the manifest without making another round trip.</p>

        <h2>Size &amp; determinism</h2>
        <ul>
          <li>
            <strong>SDK bundle:</strong> 2.25 kB gzipped (ceiling enforced by{" "}
            <code>pnpm --filter @visitportal/visit size</code>).
          </li>
          <li>
            <strong>Zero runtime dependencies.</strong> Lean manifest validator is
            dependency-free; parity with the authoritative ajv validator is enforced
            by a self-test in CI.
          </li>
          <li>
            <strong>Deterministic conformance:</strong> same vectors in = same pass/fail
            out. Every vector cites the schema rule it tests.
          </li>
        </ul>
      </main>
      <Foot />
    </>
  );
}
