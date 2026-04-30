import { invalidParams, serve, type PortalProvider } from "@visitportal/provider";
import {
  coinbaseFacilitator,
  type FacilitatorClient,
  mockFacilitator,
  selfHostedFacilitator,
  withPayment,
} from "@visitportal/x402-adapter";

// Cloudflare bindings the deployed Worker reads at request time.
// All optional — missing values fall back to the default test/dev posture
// (mockFacilitator, burn-address payee). Configure via wrangler.toml [vars]
// or `wrangler secret put` for production.
interface Env {
  FACILITATOR_URL?: string;        // "https://www.x402.org/facilitator" or self-hosted
  FACILITATOR_API_KEY?: string;    // optional, for self-hosted facilitators
  PAYEE_ADDRESS?: string;          // "0x..." your receiving wallet
  PAYMENT_ASSET?: string;          // ERC-20 contract; default Base-Sepolia USDC
  PAYMENT_NETWORK?: string;        // CAIP-2; default "eip155:84532"
  PAYMENT_AMOUNT?: string;         // atomic units; default "10000" (0.01 USDC at 6dp)
  PAYMENT_ASSET_NAME?: string;     // EIP-712 domain name; required for x402 v2 exact scheme
  PAYMENT_ASSET_VERSION?: string;  // EIP-712 domain version; required for x402 v2 exact scheme
}

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BURN_ADDRESS = "0x0000000000000000000000000000000000000000";

function pickFacilitator(env: Env): { client: FacilitatorClient; label: string } {
  if (env.FACILITATOR_URL) {
    // Default Coinbase facilitator URL is x402.org/facilitator. Treat any other
    // URL as self-hosted (same wire shape; see @x402-rs/x402-rs for a self-hosted
    // implementation).
    if (env.FACILITATOR_URL.includes("x402.org")) {
      return {
        client: coinbaseFacilitator(env.FACILITATOR_URL, env.FACILITATOR_API_KEY),
        label: `coinbase · ${env.FACILITATOR_URL}`,
      };
    }
    return {
      client: selfHostedFacilitator(env.FACILITATOR_URL, env.FACILITATOR_API_KEY),
      label: `self-hosted · ${env.FACILITATOR_URL}`,
    };
  }
  // No facilitator configured → test/dev mode. Accepts any X-Payment header
  // so smoke tests + the wire-mode test-payer pass without a wallet.
  return { client: mockFacilitator({ acceptAny: true }), label: "mock (test/dev only)" };
}

// Cache the provider keyed by the env-derived config string so cold starts
// build it once and warm starts reuse it.
let providerCache: { provider: PortalProvider; key: string } | null = null;

function getPortal(env: Env): PortalProvider {
  const network = env.PAYMENT_NETWORK ?? "eip155:84532"; // Base-Sepolia (CAIP-2)
  const asset = env.PAYMENT_ASSET ?? USDC_BASE_SEPOLIA;
  const amount = env.PAYMENT_AMOUNT ?? "10000";
  const payTo = env.PAYEE_ADDRESS ?? BURN_ADDRESS;
  // x402 v2 "exact" scheme requires extra.name + extra.version (the EIP-712
  // domain values reported by the ERC-20 contract) so the facilitator can
  // reconstruct the typed-data hash for signature verification.
  const assetName = env.PAYMENT_ASSET_NAME ?? "USDC";
  const assetVersion = env.PAYMENT_ASSET_VERSION ?? "2";
  const facUrl = env.FACILITATOR_URL ?? "";
  const facKey = env.FACILITATOR_API_KEY ?? "";

  const cacheKey = `${facUrl}|${facKey}|${payTo}|${network}|${asset}|${amount}|${assetName}|${assetVersion}`;
  if (providerCache && providerCache.key === cacheKey) return providerCache.provider;

  const { client: facilitator, label: facLabel } = pickFacilitator(env);

  const provider = serve({
    name: "Portal CF Worker (reference demo)",
    brief: `Two routes, one Worker. Three tools: whoami (free), reverse (free), premium_data (paid · PE-002 · x402-compatible). Facilitator: ${facLabel}.`,
    call_endpoint: "/portal/call",
    pricing: { model: "x402", rate: `${amount} atomic-units of ${asset} per call · ${network}` },
    tools: [
      {
        name: "whoami",
        description: "Return a fixed self-description. Free.",
        params: {},
        handler: () => ({
          runtime: "cloudflare-workers",
          portal_version: "0.1",
          message: "hello from a Worker",
          facilitator_mode: facLabel.startsWith("mock") ? "test" : "production",
        }),
      },
      {
        name: "reverse",
        description: "Reverse the input string. Free.",
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
          "Returns one premium fact. Paid tool — costs the configured amount per call (PE-002 / x402). With the default mock facilitator any X-Payment payload is accepted (test/dev only); set FACILITATOR_URL + PAYEE_ADDRESS in wrangler.toml [vars] to switch to production signing.",
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
              network,
              asset,
              amount,
              payTo,
              maxTimeoutSeconds: 60,
              // v2 "exact" scheme: facilitator reads name+version from extra
              // to rebuild the EIP-712 domain.
              extra: { name: assetName, version: assetVersion },
            },
            facilitator,
            resource: {
              url: "https://portal-cf-worker.example/portal/call#premium_data",
              description: "premium_data fact",
            },
          },
        ),
      },
    ],
  });

  providerCache = { provider, key: cacheKey };
  return provider;
}

const PORTAL_ROUTES = new Set(["/portal", "/.well-known/portal.json", "/portal/call"]);

export default {
  fetch: async (request: Request, env?: Env): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (pathname === "/" || pathname === "/healthz") {
      return Response.json({ ok: true, see: "/portal" });
    }
    if (PORTAL_ROUTES.has(pathname)) {
      return getPortal(env ?? {}).fetch(request);
    }
    return Response.json(
      { ok: false, error: `route '${pathname}' not found`, code: "NOT_FOUND" },
      { status: 404 },
    );
  },
};
