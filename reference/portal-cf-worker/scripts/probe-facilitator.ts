// Probe www.x402.org/facilitator/verify to find the exact body shape it accepts.
// Sends our signed payload in two candidate envelopes and prints what each returns.

import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

const FAC = "https://www.x402.org/facilitator";
const KEY = process.env.WALLET_KEY as `0x${string}` | undefined;
if (!KEY) {
  console.error("set WALLET_KEY=0x...");
  process.exit(1);
}

const account = privateKeyToAccount(KEY);
console.log("wallet:", account.address);

const requirement = {
  scheme: "exact" as const,
  network: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  amount: "1000",
  payTo: account.address,
  maxTimeoutSeconds: 60,
  extra: {},
};

const validAfter = 0n;
const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600);
const nonce = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;

const authorization = {
  from: account.address,
  to: requirement.payTo as `0x${string}`,
  value: BigInt(requirement.amount),
  validAfter,
  validBefore,
  nonce,
};

const signature = await account.signTypedData({
  domain: {
    name: "USDC",
    version: "2",
    chainId: 84532,
    verifyingContract: requirement.asset as `0x${string}`,
  },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: authorization,
});

const innerPayload = {
  signature,
  authorization: {
    from: authorization.from,
    to: authorization.to,
    value: requirement.amount,
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
  },
};

const fullV2Envelope = {
  x402Version: 2,
  accepted: requirement,
  payload: innerPayload,
};

async function probe(label: string, body: Record<string, unknown>) {
  console.log(`\n=== ${label} ===`);
  console.log(`request body keys: ${Object.keys(body).join(", ")}`);
  const res = await fetch(`${FAC}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(`body: ${txt.slice(0, 500)}`);
}

await probe("Shape A: paymentPayload = innerPayload (signature+authz only)", {
  x402Version: 2,
  paymentPayload: innerPayload,
  paymentRequirements: requirement,
});

await probe("Shape B: paymentPayload = full v2 envelope", {
  x402Version: 2,
  paymentPayload: fullV2Envelope,
  paymentRequirements: requirement,
});

await probe("Shape C: top-level paymentPayload = v2 envelope (no separate paymentRequirements)", {
  paymentPayload: fullV2Envelope,
  paymentRequirements: requirement,
});

await probe("Shape D: matches PaymentPayload directly (no wrapping)", fullV2Envelope as unknown as Record<string, unknown>);

await probe("Shape E: paymentRequired-style with accepts[]", {
  x402Version: 2,
  paymentPayload: fullV2Envelope,
  paymentRequirements: { accepts: [requirement] },
});
