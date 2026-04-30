# @visitportal/x402-adapter

Portal Extension PE-002 (paid tools) — wraps a Portal `ToolHandler` with [x402](https://x402.org)-compatible HTTP 402 payment gating. Bring your own facilitator.

```sh
npm i @visitportal/x402-adapter @visitportal/provider
```

## How it works

When the wrapped handler is called without a paid `X-Payment` header, it throws `PaymentRequiredError` and the provider returns:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "ok": false,
  "error": "payment required",
  "code": "PAYMENT_REQUIRED",
  "x402": {
    "x402Version": 1,
    "accepts": [{
      "scheme": "exact",
      "network": "base-sepolia",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "amount": "10000",
      "payTo": "0xRecipient",
      "maxTimeoutSeconds": 60
    }]
  }
}
```

The visiting agent reads `body.x402.accepts`, signs a payment per the requirement, and retries with the signed payload base64-encoded in the `X-Payment` header. The facilitator verifies, the handler runs, you get paid.

## Quickstart

```ts
import { serve } from "@visitportal/provider";
import { coinbaseFacilitator, withPayment } from "@visitportal/x402-adapter";

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const portal = serve({
  name: "Premium Echo",
  brief: "Echo a string back. Costs 0.01 USDC per call on Base-Sepolia.",
  call_endpoint: "/portal/call",
  pricing: { model: "x402", rate: "0.01 USDC/call" },
  tools: [
    {
      name: "premium_echo",
      description: "Echo input back, paid.",
      params: { text: { type: "string", required: true } },
      handler: withPayment(
        (params) => ({ echoed: params.text as string }),
        {
          price: {
            scheme: "exact",
            network: "base-sepolia",
            asset: USDC_BASE_SEPOLIA,
            amount: "10000", // 0.01 USDC at 6 decimals
            payTo: "0xYourReceivingAddress",
            maxTimeoutSeconds: 60,
          },
          facilitator: coinbaseFacilitator(),
        },
      ),
    },
  ],
});

// ...mount portal.fetch(request) as usual
```

## Facilitators

A facilitator is whatever verifies a signed payment payload against a requirement. Three built-ins:

| Factory | Use when |
|---|---|
| `coinbaseFacilitator(url?, apiKey?)` | Coinbase's hosted x402 facilitator (default `https://x402.org/facilitator`). |
| `selfHostedFacilitator(url, apiKey?)` | You're running [x402-rs](https://github.com/x402-rs/x402-rs) or [x402-sovereign](https://github.com/Dhaiwat10/x402-sovereign) inside your VPC. |
| `mockFacilitator(opts)` | Tests only. Accepts any payload (or a predicate). |

Or implement your own — `FacilitatorClient` is one async method (`verify`) plus an optional `settle`. Use this to:

- Plug in MPP's verifier (`mpp.dev` is wire-compatible with x402's `exact` scheme on the verify path)
- Route different networks to different facilitators
- Add your own gas-sponsoring layer

## API

```ts
function withPayment(handler: ToolHandler, opts: WithPaymentOptions): ToolHandler;

interface WithPaymentOptions {
  price: PaymentRequirement;          // x402 "accepts" entry
  facilitator: FacilitatorClient;     // verify (and optionally settle)
  resource?: { id?: string; url?: string };
  settleOnSuccess?: boolean;          // default false
}

interface PaymentRequirement {
  scheme: "exact";
  network: string;       // "base-sepolia", "base", "solana", ...
  asset: string;         // ERC-20 address or asset id
  amount: string;        // atomic units
  payTo: string;
  maxTimeoutSeconds?: number;
  description?: string;
  extra?: Record<string, unknown>;
}

interface FacilitatorClient {
  verify(payload: unknown, requirement: PaymentRequirement): Promise<{ ok: boolean; reason?: string }>;
  settle?(payload: unknown, requirement: PaymentRequirement): Promise<{ ok: boolean; tx?: string; reason?: string }>;
}

// Re-exported from @visitportal/provider for convenience
class PaymentRequiredError extends ProviderCallError {
  readonly code: "PAYMENT_REQUIRED";
}
```

## Compatibility

- **x402** — wire-native. The `accepts[]` array, the `X-Payment` header, and the `paymentPayload`/`paymentRequirements` shapes match [x402.org](https://x402.org).
- **MPP** — `mpp.dev`'s `charge` intent is documented as x402-`exact` superset. A facilitator that speaks both rails works with this adapter unchanged.
- **AP2** (Google's mandate-based protocol) — different model. Not supported by this adapter; use `@visitportal/ap2-adapter` (planned, v0.2).

## See also

- [Portal Extension PE-002 spec](../../docs/pe-002-paid-tools.md)
- [Reference Portal with paid tool](../../reference/portal-cf-worker)
- [Quickstart: paid tools](../../docs/quickstart-paid-tools.md)
