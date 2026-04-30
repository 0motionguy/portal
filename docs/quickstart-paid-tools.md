# Quickstart — Paid Tools (PE-002)

Ship a Portal where one tool charges per call. Wire-compatible with [x402](https://x402.org) (Coinbase) and [MPP](https://mpp.dev) (Cloudflare/Stripe `charge` intent is an x402-`exact` superset). 10 minutes from clone to `HTTP 402 → X-Payment → 200`.

Reference: [`reference/portal-cf-worker`](../reference/portal-cf-worker) ships `whoami` (free), `reverse` (free), and `premium_data` (paid).

## Requirements

- Node 22+ and pnpm 10+
- A facilitator URL — Coinbase's hosted one at `https://x402.org/facilitator`, [`x402-rs`](https://github.com/x402-rs/x402-rs) self-hosted, or any HTTP service that speaks the x402 v1 verify/settle shape
- A receiving address on the network you choose (Base / Base-Sepolia / Solana / Stellar / etc.)

## 1. Install

```sh
npm i @visitportal/provider @visitportal/x402-adapter
```

## 2. Wrap a handler

```ts
import { serve } from "@visitportal/provider";
import { coinbaseFacilitator, withPayment } from "@visitportal/x402-adapter";

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const portal = serve({
  name: "Premium Echo",
  brief: "Echo a string back. 0.01 USDC per call on Base-Sepolia.",
  call_endpoint: "/portal/call",
  pricing: { model: "x402", rate: "0.01 USDC/call · base-sepolia" },
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

export default { fetch: (req: Request) => portal.fetch(req) };
```

That is the entire payment surface.

## 3. The wire

**Unpaid call** → HTTP 402 with the x402 challenge embedded in the Portal envelope:

```sh
curl -i -X POST https://yourservice.com/portal/call \
  -H 'content-type: application/json' \
  -d '{"tool":"premium_echo","params":{"text":"hi"}}'
```

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
      "payTo": "0xYourReceivingAddress",
      "maxTimeoutSeconds": 60
    }]
  }
}
```

**Paid call** → visitor signs an EIP-3009 USDC `transferWithAuthorization` (or whatever the chosen scheme requires), base64-encodes it, and retries with `X-Payment`:

```sh
curl -i -X POST https://yourservice.com/portal/call \
  -H 'content-type: application/json' \
  -H 'x-payment: <base64(signedPayload)>' \
  -d '{"tool":"premium_echo","params":{"text":"hi"}}'
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{ "ok": true, "result": { "echoed": "hi" } }
```

## 4. Choosing a facilitator

| Factory | Wire | Good for |
|---|---|---|
| `coinbaseFacilitator()` | x402 v1, hosted at `https://x402.org/facilitator` | Production, Coinbase ecosystem |
| `selfHostedFacilitator(url, apiKey?)` | Same shape, your URL | VPC, Cloudflare, [x402-rs](https://github.com/x402-rs/x402-rs), [x402-sovereign](https://github.com/Dhaiwat10/x402-sovereign) |
| `mockFacilitator({ acceptAny: true })` | Always-accepts stub | Local testing only |

Roll your own — `FacilitatorClient` is one async method:

```ts
const myFacilitator = {
  async verify(payload, requirement) {
    // talk to your own verifier — return { ok: true } or { ok: false, reason }
  },
};
```

## 5. Compatibility with MPP and AP2

- **[MPP](https://mpp.dev)** (Cloudflare/Stripe) — wire-compatible on the verify path. MPP's `charge` intent maps onto x402's `exact` scheme. A facilitator that speaks MPP works with `withPayment` unchanged. Use `selfHostedFacilitator(MPP_URL)`.
- **[Google AP2](https://ap2-protocol.org)** — *not* compatible. AP2 is mandate-based (signed user-mandate → cart-mandate → payment-mandate), not per-request 402. A separate `@visitportal/ap2-adapter` is planned for v0.2.

## 6. Smoke test

```sh
git clone https://github.com/0motionguy/portal && cd portal
pnpm install
pnpm conformance http://localhost:8787/portal   # base v0.1 conformance, includes 402 round-trip
```

Spec: [`docs/pe-002-paid-tools.md`](./pe-002-paid-tools.md). Adapter source + tests: [`packages/x402-adapter`](../packages/x402-adapter).

## What's NOT covered

- **Wallet management.** This is the visitor's concern; signing happens client-side. Reference signing libs: [`@coinbase/x402-fetch`](https://github.com/coinbase/x402), [`viem`](https://viem.sh/), [`x402-openai-typescript`](https://github.com/qntx/x402-openai-typescript) (drop-in OpenAI SDK with transparent 402).
- **On-chain settlement.** The facilitator does it. Portal's adapter just verifies + (optionally) triggers settle.
- **Subscription / pre-auth budgets.** PE-002 is per-call. Subscription-style billing is out of scope; `auth: "api_key"` + off-band billing fits that.
- **Cards.** Use MPP's Stripe SPT scheme via a Stripe-aware facilitator. The adapter doesn't care; the facilitator does the work.
