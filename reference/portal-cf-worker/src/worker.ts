import { invalidParams, serve } from "@visitportal/provider";
import { mockFacilitator, withPayment } from "@visitportal/x402-adapter";

// Reference token + payee for the paid demo tool. Base-Sepolia USDC.
// Adopters: replace USDC_BASE_SEPOLIA + DEMO_PAYEE with your own.
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const DEMO_PAYEE = "0x0000000000000000000000000000000000000000";

const portal = serve({
  name: "Portal CF Worker (reference demo)",
  brief:
    "Two routes, one Worker. Three tools: whoami (free), reverse (free), premium_data (paid · PE-002 · x402-compatible). Demonstrates the minimum a Cloudflare Worker needs to be agent-visitable, including paid tools.",
  call_endpoint: "/portal/call",
  pricing: { model: "x402", rate: "0.01 USDC/call · base-sepolia" },
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
    {
      name: "premium_data",
      description:
        "Returns one premium fact. Paid tool — costs 0.01 USDC per call (PE-002 / x402). Test mode uses a mock facilitator that accepts any non-empty X-Payment header; swap coinbaseFacilitator() in for production.",
      params: {},
      handler: withPayment(
        () => ({
          paid: true,
          fact: "Portal is the visitor-side half of the open agent web.",
          ts: Date.now(),
        }),
        {
          price: {
            scheme: "exact",
            network: "base-sepolia",
            asset: USDC_BASE_SEPOLIA,
            amount: "10000", // 0.01 USDC at 6 decimals
            payTo: DEMO_PAYEE,
            maxTimeoutSeconds: 60,
            description: "premium_data fact",
          },
          // Demo mode — accepts any payload. Production: coinbaseFacilitator()
          // or selfHostedFacilitator(url, apiKey).
          facilitator: mockFacilitator({ acceptAny: true }),
          resource: { id: "cf-worker-premium-data-v1" },
        },
      ),
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
