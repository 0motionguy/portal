// Spin up a Portal in-process and expose it as a fetchImpl that the visitor
// SDK can be pointed at. No real HTTP server required — saves ~30ms per test
// and avoids ephemeral port allocation.

import { type PortalProvider, invalidParams, serve } from "@visitportal/provider";

export interface InProcessPortal {
  fetchImpl: typeof fetch;
  baseUrl: string;
  provider: PortalProvider;
}

export function createAgentSimPortal(): InProcessPortal {
  const provider = serve({
    name: "Agent Sim Portal",
    brief:
      "Two read-only tools used by the bench's agent simulation. whoami returns a fixed identifier; list_repos returns a hardcoded set of agent-protocol repositories so the LLM has something concrete to summarize.",
    call_endpoint: "/portal/call",
    tools: [
      {
        name: "whoami",
        description: "Return a fixed self-description.",
        params: {},
        handler: () => ({
          target: "agent-sim",
          portal_version: "0.1",
          message: "you are talking to the bench's in-process Portal",
        }),
      },
      {
        name: "list_repos",
        description:
          "Return a hardcoded list of trending agent-protocol repositories. Each entry has owner, name, and stars (last 7 days).",
        params: {
          limit: { type: "number", required: false, description: "1-3, default 3" },
        },
        handler: (params) => {
          const raw = params.limit;
          let limit = 3;
          if (raw !== undefined) {
            if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 3) {
              throw invalidParams("'limit' must be an integer between 1 and 3");
            }
            limit = raw;
          }
          return [
            { owner: "modelcontextprotocol", name: "specification", stars_7d: 412 },
            { owner: "google-deepmind", name: "agent-protocol", stars_7d: 287 },
            { owner: "0motionguy", name: "portal", stars_7d: 134 },
          ].slice(0, limit);
        },
      },
    ],
  });

  const baseUrl = "https://portal.test/portal";
  const PORTAL_ROUTES = new Set(["/portal", "/.well-known/portal.json", "/portal/call"]);

  const fetchImpl: typeof fetch = async (input, init) => {
    const reqUrl =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : typeof input === "string"
            ? input
            : String(input);
    const { pathname } = new URL(reqUrl);
    const request = input instanceof Request ? input : new Request(reqUrl, init);
    if (PORTAL_ROUTES.has(pathname)) {
      return provider.fetch(request);
    }
    return new Response(
      JSON.stringify({ ok: false, error: `route '${pathname}' not found`, code: "NOT_FOUND" }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  };

  return { fetchImpl, baseUrl, provider };
}
