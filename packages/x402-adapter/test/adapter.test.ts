import { serve } from "@visitportal/provider";
import { describe, expect, it } from "vitest";
import {
  type FacilitatorClient,
  type PaymentRequirement,
  mockFacilitator,
  withPayment,
} from "../src/index.ts";

const PRICE: PaymentRequirement = {
  scheme: "exact",
  network: "eip155:84532", // Base-Sepolia in CAIP-2 format (x402 v2)
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  amount: "10000",
  payTo: "0xRecipient",
  maxTimeoutSeconds: 60,
  extra: {},
};

function buildPortal(facilitator: FacilitatorClient) {
  return serve({
    name: "Test Paid Portal",
    brief: "PE-002 paid tools test fixture.",
    call_endpoint: "/portal/call",
    pricing: { model: "x402", rate: "0.01 USDC/call" },
    tools: [
      {
        name: "premium_echo",
        description: "Echo input back. Costs 0.01 USDC per call.",
        params: { text: { type: "string", required: true } },
        handler: withPayment((params) => ({ echoed: params.text as string, paid: true }), {
          price: PRICE,
          facilitator,
        }),
      },
      {
        name: "free_whoami",
        description: "Identify the Portal. Free.",
        params: {},
        handler: () => ({ portal: "test-paid", free: true }),
      },
    ],
  });
}

async function call(
  portal: ReturnType<typeof buildPortal>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const req = new Request("https://test.invalid/portal/call", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const res = await portal.fetch(req);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body: json };
}

describe("withPayment — PE-002 dispatcher", () => {
  it("free tool stays free regardless of x402 wrapper on sibling", async () => {
    const portal = buildPortal(mockFacilitator({ acceptAny: true }));
    const { status, body } = await call(portal, { tool: "free_whoami", params: {} });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("paid tool without X-Payment returns HTTP 402 + PAYMENT_REQUIRED + x402 challenge", async () => {
    const portal = buildPortal(mockFacilitator({ acceptAny: true }));
    const { status, body } = await call(portal, { tool: "premium_echo", params: { text: "hi" } });
    expect(status).toBe(402);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("PAYMENT_REQUIRED");
    const x402 = body.x402 as Record<string, unknown>;
    expect(x402).toBeDefined();
    expect(x402.x402Version).toBe(2);
    const accepts = x402.accepts as Array<Record<string, unknown>>;
    expect(accepts.length).toBe(1);
    const first = accepts[0];
    if (!first) throw new Error("expected at least one accept entry");
    expect(first.scheme).toBe("exact");
    expect(first.network).toBe("eip155:84532");
    expect(first.amount).toBe("10000");
    expect(first.payTo).toBe("0xRecipient");
  });

  it("paid tool with valid Payment-Signature runs the handler and returns 200 + ok:true", async () => {
    const portal = buildPortal(mockFacilitator({ acceptAny: true }));
    // v2 PaymentPayload shape — adapter peels .payload off and feeds to facilitator
    const v2Payload = btoa(
      JSON.stringify({
        x402Version: 2,
        accepted: PRICE,
        payload: { signature: "0xabc", authorization: { mock: true } },
      }),
    );
    const { status, body } = await call(
      portal,
      { tool: "premium_echo", params: { text: "hello" } },
      { "payment-signature": v2Payload },
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const result = body.result as Record<string, unknown>;
    expect(result.echoed).toBe("hello");
    expect(result.paid).toBe(true);
  });

  it("paid tool with rejected payment returns HTTP 402 + reason in error", async () => {
    const portal = buildPortal({
      async verify() {
        return { ok: false, reason: "signature invalid" };
      },
    });
    const v2Payload = btoa(
      JSON.stringify({
        x402Version: 2,
        accepted: PRICE,
        payload: { signature: "0xbad", authorization: { mock: true } },
      }),
    );
    const { status, body } = await call(
      portal,
      { tool: "premium_echo", params: { text: "x" } },
      { "payment-signature": v2Payload },
    );
    expect(status).toBe(402);
    expect(body.code).toBe("PAYMENT_REQUIRED");
    expect(body.error).toBe("signature invalid");
  });

  it("malformed Payment-Signature header returns HTTP 402 with a clear error", async () => {
    const portal = buildPortal(mockFacilitator({ acceptAny: true }));
    const { status, body } = await call(
      portal,
      { tool: "premium_echo", params: { text: "x" } },
      { "payment-signature": "@@not-base64-json@@" },
    );
    expect(status).toBe(402);
    expect(body.code).toBe("PAYMENT_REQUIRED");
    expect(typeof body.error).toBe("string");
  });

  it("facilitator network failure surfaces as 402 (not 500)", async () => {
    const portal = buildPortal({
      async verify() {
        throw new Error("connection refused");
      },
    });
    const v2Payload = btoa(
      JSON.stringify({
        x402Version: 2,
        accepted: PRICE,
        payload: { signature: "0xabc", authorization: { mock: true } },
      }),
    );
    const { status, body } = await call(
      portal,
      { tool: "premium_echo", params: { text: "x" } },
      { "payment-signature": v2Payload },
    );
    expect(status).toBe(402);
    expect(body.code).toBe("PAYMENT_REQUIRED");
    expect(body.error).toContain("connection refused");
  });

  it("settleOnSuccess: true triggers settle after handler, surfaces failure as INTERNAL", async () => {
    const portal = serve({
      name: "Settle Test",
      brief: "test",
      call_endpoint: "/portal/call",
      pricing: { model: "x402", rate: "0.01 USDC/call" },
      tools: [
        {
          name: "premium",
          params: {},
          handler: withPayment(() => ({ ran: true }), {
            price: PRICE,
            facilitator: {
              async verify() {
                return { ok: true };
              },
              async settle() {
                return { ok: false, reason: "tx reverted" };
              },
            },
            settleOnSuccess: true,
          }),
        },
      ],
    });
    const v2Payload = btoa(
      JSON.stringify({
        x402Version: 2,
        accepted: PRICE,
        payload: { signature: "0xabc", authorization: { mock: true } },
      }),
    );
    const req = new Request("https://test.invalid/portal/call", {
      method: "POST",
      headers: { "content-type": "application/json", "payment-signature": v2Payload },
      body: JSON.stringify({ tool: "premium", params: {} }),
    });
    const res = await portal.fetch(req);
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe("INTERNAL");
    expect(body.error).toContain("settle failed");
  });

  it("legacy X-Payment header still accepted for backward compat", async () => {
    const portal = buildPortal(mockFacilitator({ acceptAny: true }));
    // Pre-v0.1.10 v1-shape payload sent in legacy X-Payment header
    const legacy = btoa(JSON.stringify({ scheme: "exact", signed: "0xlegacy" }));
    const { status, body } = await call(
      portal,
      { tool: "premium_echo", params: { text: "hi" } },
      { "x-payment": legacy },
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe("PaymentRequirement shape", () => {
  it("honors a custom resource block in the 402 challenge", async () => {
    const portal = serve({
      name: "Resource Test",
      brief: "test",
      call_endpoint: "/portal/call",
      pricing: { model: "x402", rate: "0.01 USDC/call" },
      tools: [
        {
          name: "premium",
          params: {},
          handler: withPayment(() => ({ ok: true }), {
            price: PRICE,
            facilitator: mockFacilitator({ acceptAny: true }),
            resource: {
              url: "https://test.invalid/portal/call",
              description: "premium-resource-v1",
            },
          }),
        },
      ],
    });
    const req = new Request("https://test.invalid/portal/call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "premium", params: {} }),
    });
    const res = await portal.fetch(req);
    expect(res.status).toBe(402);
    const body = (await res.json()) as Record<string, unknown>;
    const x402 = body.x402 as Record<string, unknown>;
    const resource = x402.resource as Record<string, unknown>;
    expect(resource.url).toBe("https://test.invalid/portal/call");
    expect(resource.description).toBe("premium-resource-v1");
  });
});
