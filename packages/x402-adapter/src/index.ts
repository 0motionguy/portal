// Portal Extension PE-002 — paid-tools adapter (x402 v2 wire).
//
// Wraps a Portal ToolHandler with x402-v2-compatible HTTP 402 payment gating.
// Bring your own facilitator (Coinbase reference, self-hosted x402-rs,
// or anything implementing FacilitatorClient).
//
// On unpaid call: handler throws PaymentRequiredError → provider returns
//   HTTP 402 with body { ok:false, error, code:"PAYMENT_REQUIRED",
//   x402: { x402Version:2, resource, accepts:[...], extensions? } }
//
// On call with Payment-Signature header (or legacy X-Payment): adapter
// base64-decodes the v2 PaymentPayload, asks the facilitator to verify it
// against the matched requirement, and either forwards to the wrapped
// handler (verified) or throws another PaymentRequiredError (rejected).
//
// Spec: docs/pe-002-paid-tools.md
// Wire-compatible with: x402 v2 (x402.org/docs.x402.org), and the MPP
//   charge intent (mpp.dev) when the facilitator speaks both.

import { PaymentRequiredError, type ToolContext, type ToolHandler } from "@visitportal/provider";

export type { ToolContext, ToolHandler };
export { PaymentRequiredError };

/**
 * A single x402 v2 payment requirement entry. Servers list one or more in
 * the `accepts[]` of the PAYMENT-REQUIRED challenge; clients pick one and
 * sign against it, then echo it back inside PaymentPayload.accepted.
 */
export interface PaymentRequirement {
  /** Scheme. "exact" = pay this exact amount. "upto" = pay up to this amount. */
  scheme: "exact" | "upto" | string;
  /** Network in CAIP-2 format, e.g. "eip155:84532" (Base-Sepolia), "eip155:8453" (Base), "solana:..." */
  network: string;
  /** Token contract / asset id. ERC-20 address on EVM, mint pubkey on SVM. */
  asset: string;
  /** Amount in atomic units (e.g. "10000" = 0.01 USDC at 6 decimals). */
  amount: string;
  /** Recipient address. */
  payTo: string;
  /** Max wait before the signed payload is rejected, in seconds. v2 makes this required. */
  maxTimeoutSeconds: number;
  /** Scheme-specific. For "upto" expect facilitatorAddress here. */
  extra: Record<string, unknown>;
}

export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface FacilitatorVerifyResult {
  ok: boolean;
  reason?: string;
}

export interface FacilitatorSettleResult {
  ok: boolean;
  tx?: string;
  reason?: string;
}

/** Pluggable facilitator. Verify is required; settle is optional. */
export interface FacilitatorClient {
  verify(payload: unknown, requirement: PaymentRequirement): Promise<FacilitatorVerifyResult>;
  settle?(payload: unknown, requirement: PaymentRequirement): Promise<FacilitatorSettleResult>;
}

export interface WithPaymentOptions {
  /** Required: the price for one call. */
  price: PaymentRequirement;
  /** Required: how to verify (and optionally settle) a payment. */
  facilitator: FacilitatorClient;
  /** Optional: extra metadata included in the 402 challenge body's resource block. */
  resource?: ResourceInfo;
  /** Optional: settle on success in addition to verify. Default false. */
  settleOnSuccess?: boolean;
}

const X402_VERSION = 2;

// v2 header names. Per docs.x402.org/core-concepts/http-402:
//   PAYMENT-REQUIRED  Server → Client (on 402)
//   PAYMENT-SIGNATURE Client → Server (retry)
//   PAYMENT-RESPONSE  Server → Client (on 200, settlement receipt)
const HEADER_PAYMENT_SIGNATURE = "payment-signature";
const HEADER_PAYMENT_REQUIRED = "payment-required";
const HEADER_PAYMENT_RESPONSE = "payment-response";

// v1 legacy header — still read for backward compat with pre-v0.1.10
// clients that haven't upgraded yet.
const HEADER_X_PAYMENT_LEGACY = "x-payment";

export const HEADERS = {
  PAYMENT_SIGNATURE: HEADER_PAYMENT_SIGNATURE,
  PAYMENT_REQUIRED: HEADER_PAYMENT_REQUIRED,
  PAYMENT_RESPONSE: HEADER_PAYMENT_RESPONSE,
  /** Pre-v0.1.10 retry header. Read for compat; do not emit. */
  X_PAYMENT_LEGACY: HEADER_X_PAYMENT_LEGACY,
} as const;

/**
 * Wrap a Portal ToolHandler with x402 v2 HTTP 402 payment gating.
 *
 * @example
 *   const portal = serve({
 *     name: "Premium Echo",
 *     brief: "Pay 0.01 USDC per echo.",
 *     call_endpoint: "/portal/call",
 *     pricing: { model: "x402", rate: "0.01 USDC/call · base-sepolia" },
 *     tools: [{
 *       name: "echo",
 *       params: { text: { type: "string", required: true } },
 *       handler: withPayment(echoHandler, {
 *         price: {
 *           scheme: "exact",
 *           network: "eip155:84532",        // Base-Sepolia (CAIP-2)
 *           asset: USDC_BASE_SEPOLIA,
 *           amount: "10000",
 *           payTo: WALLET,
 *           maxTimeoutSeconds: 60,
 *           extra: {},
 *         },
 *         facilitator: coinbaseFacilitator(),
 *         resource: { url: "https://my-service.com/portal/call#echo" },
 *       }),
 *     }],
 *   });
 */
export function withPayment(handler: ToolHandler, opts: WithPaymentOptions): ToolHandler {
  return async (params, ctx) => {
    const headers = ctx.request?.headers;
    const xPayment =
      headers?.get(HEADER_PAYMENT_SIGNATURE) ?? headers?.get(HEADER_X_PAYMENT_LEGACY) ?? null;

    if (!xPayment) {
      throw new PaymentRequiredError(buildChallenge(opts), "payment required");
    }

    let raw: unknown;
    try {
      raw = JSON.parse(decodeBase64(xPayment));
    } catch {
      throw new PaymentRequiredError(
        buildChallenge(opts),
        "Payment-Signature header is not valid base64-encoded JSON",
      );
    }

    // v2 PaymentPayload shape: { x402Version, accepted, payload, extensions? }
    // Legacy v1 shape: { x402Version: 1, scheme, network, payload }
    // Extract the scheme-specific signed bytes uniformly.
    const innerPayload = isRecord(raw) && "payload" in raw ? raw.payload : raw;

    let verification: FacilitatorVerifyResult;
    try {
      verification = await opts.facilitator.verify(innerPayload, opts.price);
    } catch (err) {
      throw new PaymentRequiredError(
        buildChallenge(opts),
        `facilitator verify failed: ${describe(err)}`,
      );
    }

    if (!verification.ok) {
      throw new PaymentRequiredError(
        buildChallenge(opts),
        verification.reason ?? "payment verification failed",
      );
    }

    const result = await handler(params, ctx);

    if (opts.settleOnSuccess && opts.facilitator.settle) {
      const settle = await opts.facilitator.settle(innerPayload, opts.price);
      if (!settle.ok) {
        throw new Error(`settle failed: ${settle.reason ?? "unknown"}`);
      }
    }

    return result;
  };
}

function buildChallenge(opts: WithPaymentOptions): {
  x402Version: number;
  accepts: ReadonlyArray<Record<string, unknown>>;
  resource?: Record<string, unknown>;
} {
  const requirement: Record<string, unknown> = {
    scheme: opts.price.scheme,
    network: opts.price.network,
    asset: opts.price.asset,
    amount: opts.price.amount,
    payTo: opts.price.payTo,
    maxTimeoutSeconds: opts.price.maxTimeoutSeconds,
    extra: opts.price.extra ?? {},
  };
  return {
    x402Version: X402_VERSION,
    accepts: [requirement],
    ...(opts.resource ? { resource: opts.resource as unknown as Record<string, unknown> } : {}),
  };
}

/**
 * Build a Coinbase / x402 Foundation facilitator client.
 *
 * The hosted facilitator at https://x402.org/facilitator (canonical
 * https://www.x402.org/facilitator) accepts POST /verify and POST /settle
 * with the v2 paymentPayload + paymentRequirements shape.
 */
export function coinbaseFacilitator(
  url = "https://www.x402.org/facilitator",
  apiKey?: string,
): FacilitatorClient {
  return httpFacilitator(url, apiKey);
}

/**
 * Build a self-hosted facilitator client. Same wire shape as Coinbase's;
 * intended for adopters running their own x402-rs / x402-sovereign
 * verifier inside a VPC or on the same Cloudflare account.
 */
export function selfHostedFacilitator(url: string, apiKey?: string): FacilitatorClient {
  return httpFacilitator(url, apiKey);
}

function httpFacilitator(url: string, apiKey: string | undefined): FacilitatorClient {
  const baseUrl = url.replace(/\/+$/, "");
  const authHeaders: Record<string, string> = apiKey ? { authorization: `Bearer ${apiKey}` } : {};

  return {
    async verify(payload, requirement) {
      const res = await fetch(`${baseUrl}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders },
        body: JSON.stringify({
          x402Version: X402_VERSION,
          paymentPayload: payload,
          paymentRequirements: requirement,
        }),
      });
      if (!res.ok) return { ok: false, reason: `facilitator returned ${res.status}` };
      const body = (await res.json()) as { isValid?: boolean; invalidReason?: string };
      const result: FacilitatorVerifyResult = { ok: body.isValid === true };
      if (body.invalidReason) result.reason = body.invalidReason;
      return result;
    },
    async settle(payload, requirement) {
      const res = await fetch(`${baseUrl}/settle`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders },
        body: JSON.stringify({
          x402Version: X402_VERSION,
          paymentPayload: payload,
          paymentRequirements: requirement,
        }),
      });
      if (!res.ok) return { ok: false, reason: `facilitator returned ${res.status}` };
      const body = (await res.json()) as {
        success?: boolean;
        transaction?: string;
        errorReason?: string;
      };
      const result: FacilitatorSettleResult = { ok: body.success === true };
      if (body.transaction) result.tx = body.transaction;
      if (body.errorReason) result.reason = body.errorReason;
      return result;
    },
  };
}

/**
 * In-memory facilitator for testing. Verifies any payload that includes
 * a configured shared secret. NOT for production use.
 */
export interface MockFacilitatorOptions {
  acceptAny?: boolean;
  acceptIf?: (payload: unknown) => boolean;
}

export function mockFacilitator(opts: MockFacilitatorOptions = {}): FacilitatorClient {
  const accept = opts.acceptAny
    ? () => true
    : (opts.acceptIf ?? ((payload: unknown) => Boolean(payload)));
  return {
    async verify(payload) {
      return accept(payload) ? { ok: true } : { ok: false, reason: "mock rejection" };
    },
    async settle(_payload) {
      return { ok: true, tx: "0xMOCK" };
    },
  };
}

function decodeBase64(s: string): string {
  if (typeof atob === "function") return atob(s);
  return globalThis.Buffer.from(s, "base64").toString("utf8");
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
