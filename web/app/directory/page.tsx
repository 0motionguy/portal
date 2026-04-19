import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Nav, Foot } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Directory",
  description: "Public directory of Portals conforming to v0.1. A stub today; grows as the ecosystem grows.",
};

interface Entry {
  name: string;
  brief: string;
  url: string;
  url_note?: string;
  tools: string[];
  added: string;
  source?: string;
}

interface Directory {
  portal_directory_version: string;
  generated: string;
  portals: Entry[];
}

function loadDirectory(): Directory {
  const p = join(process.cwd(), "public", "directory.json");
  return JSON.parse(readFileSync(p, "utf8")) as Directory;
}

export default function DirectoryPage() {
  const dir = loadDirectory();
  return (
    <>
      <Nav active="directory" />
      <main className="page">
        <span className="eyebrow">▶ public registry · v{dir.portal_directory_version}</span>
        <h1>
          Portals you can <em>visit.</em>
        </h1>
        <p className="lede">
          A stub today — the Portal registry is meant to grow the way the MCP
          server list did. For v0.1 it's the reference Portal plus space for
          what comes next.
        </p>

        {dir.portals.map((p) => (
          <div
            key={p.name}
            style={{
              border: "1px solid var(--line)",
              background: "var(--paper-soft)",
              padding: 24,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 8,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <h3 style={{ fontSize: 26, margin: 0 }}>{p.name}</h3>
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 11,
                  color: "var(--dim)",
                }}
              >
                added {p.added}
              </span>
            </div>
            <p style={{ marginBottom: 14, color: "var(--ink-soft)" }}>{p.brief}</p>
            <div
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 12,
                color: "var(--dim)",
                marginBottom: 8,
              }}
            >
              <strong style={{ color: "var(--ink)" }}>URL:</strong>{" "}
              <code>{p.url}</code>
              {p.url_note && (
                <span style={{ color: "var(--coral)", marginLeft: 8 }}>
                  ({p.url_note})
                </span>
              )}
            </div>
            <div
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 12,
                color: "var(--dim)",
                marginBottom: 8,
              }}
            >
              <strong style={{ color: "var(--ink)" }}>Tools:</strong>{" "}
              {p.tools.map((t) => (
                <code key={t} style={{ marginRight: 6 }}>
                  {t}
                </code>
              ))}
            </div>
            {p.source && (
              <div
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 12,
                  color: "var(--dim)",
                }}
              >
                <strong style={{ color: "var(--ink)" }}>Source:</strong>{" "}
                <a href={p.source}>{p.source}</a>
              </div>
            )}
          </div>
        ))}

        <h2>Add your Portal</h2>
        <p>
          A self-serve submission form lands in v0.2 (planned as part of the
          Portal Extensions spec PE-004 registry/discovery). For now, submit a
          PR to{" "}
          <code>web/public/directory.json</code> or open a GitHub issue.
        </p>
        <p>
          Your Portal must pass <code>pnpm conformance &lt;url&gt;</code> — see the{" "}
          <a href="/docs">docs</a> for the spec surface and{" "}
          <a href="/bench">bench</a> for the reproducible token-cost measurements.
        </p>

        <p style={{ fontSize: 11, color: "var(--dim-soft)", fontFamily: "'Geist Mono', monospace" }}>
          ▸ Raw JSON: <a href="/directory.json"><code>/directory.json</code></a> (served with{" "}
          <code>content-type: application/json</code>). Last updated {dir.generated}.
        </p>
      </main>
      <Foot />
    </>
  );
}
