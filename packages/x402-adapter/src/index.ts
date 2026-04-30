// Portal Extension PE-002 — paid-tools adapter.
//
// Wraps a Portal ToolHandler with x402-compatible HTTP 402 payment gating.
// Bring your own facilitator (Coinbase reference, self-hosted x402-rs,
// or anything implementing FacilitatorClient).
//
// On unpaid call: handler throws PaymentRequiredError → provider returns
//   HTTP 402 with body { ok:false, error, code:"PAYMENT_REQUIRED",
//   x402: { x402Version:1, accepts:[...], resource? } }
//
// On call with X-PAYMENT header: adapter base64-decodes the payment payload,
//   asks the facilitator to verify it against the requirement, and either
//   forwards to the wrapped handler (verified) or throws another
//   PaymentRequiredError (rejected).
//
// Spec: docs/pe-002-paid-tools.md
// Wire-compatible with: x402 (x402.org), MPP charge intent (mpp.dev) when
//   the facilitator speaks both.

import { PaymentRequiredError, type ToolContext, type ToolHandler } from "@visitportal/provider";

export type { ToolContext, ToolHandler };
export { PaymentRequiredError };

/** A single x402 payment requirement (the "exact" scheme). */
export interface PaymentRequirement {
  scheme: "exact";
  /** Network identifier, e.g. "base-sepolia", "base", "solana". */
  network: string;
  /** Token contract / asset id. ERC-20 address on EVM, mint pubkey on SVM. */
  asset: string;
  /** Amount in atomic units (e.g. "10000" = 0.01 USDC at 6 decimals). */
  amount: string;
  /** Recipient address. */
  payTo: string;
  /** Max wait before the signed payload is rejected, in seconds. Default 60. */
  maxTimeoutSeconds?: number;
  /** Optional human-readable description (kept short). */
  description?: string;
  /** Free-form, scheme-specific. */
  extra?: Record<string, unknown>;
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
  /** Optional: extra metadata included in the 402 challenge body. */
  resource?: { id?: string; url?: string } & Record<string, unknown>;
  /** Optional: settle on success in addition to verify. Default false. */
  settleOnSuccess?: boolean;
}

const X_PAYMENT_HEADER = "x-payment";
const X_PAYMENT_RESPONSE_HEADER = "x-payment-response";

/**
 * Wrap a Portal ToolHandler with x402-compatible 402 payment gating.
 *
 * @example
 *   const portal = serve({
 *     name: "Premium Echo",
 *     brief: "Pay $0.01 per echo.",
 *     call_endpoint: "/portal/call",
 *     auth: "none",
 *     pricing: { model: "x402", rate: "$0.01/call" },
 *     tools: [{
 *       name: "echo",
 *       params: { text: { type: "string", required: true } },
 *       handler: withPayment(echoHandler, {
 *         price: { scheme: "exact", network: "base-sepolia",
 *                  asset: USDC_BASE_SEPOLIA, amount: "10000",
 *                  payTo: WALLET, maxTimeoutSeconds: 60 },
 *         facilitator: coinbaseFacilitator(),
 *       }),
 *     }],
 *   });
 */
export function withPayment(handler: ToolHandler, opts: WithPaymentOptions): ToolHandler {
  return async (params, ctx) => {
    const xPayment = ctx.request?.headers.get(X_PAYMENT_HEADER) ?? null;

    if (!xPayment) {
      throw new PaymentRequiredError(
        opts.resource
          ? { accepts: [opts.price as unknown as Record<string, unknown>], resource: opts.resource }
          : { accepts: [opts.price as unknown as Record<string, unknown>] },
        "payment required",
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(decodeBase64(xPayment));
    } catch {
      throw new PaymentRequiredError(
        { accepts: [opts.price as unknown as Record<string, unknown>] },
        "X-Payment header is not valid base64-encoded JSON",
      );
    }

    let verification: FacilitatorVerifyResult;
    try {
      verification = await opts.facilitator.verify(payload, opts.price);
    } catch (err) {
      throw new PaymentRequiredError(
        { accepts: [opts.price as unknown as Record<string, unknown>] },
        `facilitator verify failed: ${describe(err)}`,
      );
    }

    if (!verification.ok) {
      throw new PaymentRequiredError(
        { accepts: [opts.price as unknown as Record<string, unknown>] },
        verification.reason ?? "payment verification failed",
      );
    }

    const result = await handler(params, ctx);

    if (opts.settleOnSuccess && opts.facilitator.settle) {
      const settle = await opts.facilitator.settle(payload, opts.price);
      if (!settle.ok) {
        // Settlement failed AFTER the handler ran. We surface this as
        // INTERNAL since the work is done but the receipt path failed.
        // Adopters who need atomic settle-then-handle should swap order.
        throw new Error(`settle failed: ${settle.reason ?? "unknown"}`);
      }
    }

    return result;
  };
}

/**
 * Build a Coinbase x402 facilitator client.
 *
 * The Coinbase facilitator at https://x402.org/facilitator (or the team
 * URL configured) accepts POST /verify and POST /settle with the standard
 * x402 v1 payload shape.
 */
export function coinbaseFacilitator(
  url = "https://x402.org/facilitator",
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
          x402Version: 1,
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
          x402Version: 1,
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

export const HEADERS = {
  X_PAYMENT: X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE: X_PAYMENT_RESPONSE_HEADER,
} as const;

function decodeBase64(s: string): string {
  if (typeof atob === "function") return atob(s);
  // Node fallback (for environments without atob)
  return globalThis.Buffer.from(s, "base64").toString("utf8");
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
