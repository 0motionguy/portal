import { invalidParams, serve } from "@visitportal/provider";

const portal = serve({
  name: "Portal CF Worker (reference demo)",
  brief:
    "Two routes, one Worker. Echoes a fixed payload and reverses a string. Demonstrates the minimum a Cloudflare Worker needs to be agent-visitable.",
  call_endpoint: "/portal/call",
  tools: [
    {
      name: "whoami",
      description: "Return a fixed self-description.",
      params: {},
      handler: () => ({
        runtime: "cloudflare-workers",
        portal_version: "0.1",
        message: "hello from a Worker",
      }),
    },
    {
      name: "reverse",
      description: "Reverse the input string.",
      params: {
        text: { type: "string", required: true, description: "1-2000 chars" },
      },
      handler: (params) => {
        const text = params.text;
        if (typeof text !== "string" || text.length === 0 || text.length > 2000) {
          throw invalidParams("'text' must be a 1-2000 char string");
        }
        return { reversed: [...text].reverse().join("") };
      },
    },
  ],
});

const PORTAL_ROUTES = new Set(["/portal", "/.well-known/portal.json", "/portal/call"]);

export default {
  fetch: async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (pathname === "/" || pathname === "/healthz") {
      return Response.json({ ok: true, see: "/portal" });
    }
    if (PORTAL_ROUTES.has(pathname)) {
      return portal.fetch(request);
    }
    return Response.json(
      { ok: false, error: `route '${pathname}' not found`, code: "NOT_FOUND" },
      { status: 404 },
    );
  },
};
