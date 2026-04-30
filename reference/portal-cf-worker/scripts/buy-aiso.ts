// Buy an AISO scan via the live Sponge x402 gateway. Direct path, no
// CF Worker reference in between.
//
// Flow:
//   1. POST {url, billingTier} → expect 402 + accepts[]
//   2. Sign EIP-3009 USDC TransferWithAuthorization for accepts[0]
//   3. POST again with Payment-Signature header → expect 200 + scan result
//
// Usage:
//   WALLET_KEY=0x... pnpm tsx scripts/buy-aiso.ts
//
// AISO is on Base-Sepolia (the service is livemode:false). Wallet must have
// at least 1 USDC on Base-Sepolia (CAIP-2: eip155:84532).
//
// Faucet: https://faucet.circle.com  (Base Sepolia + USDC)

import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

const ENDPOINT =
  "https://api.paysponge.com/x402/purchase/svc_d7nqes8p13x5p4888/api/scan";
const SCAN_TARGET = process.env.SCAN_TARGET ?? "https://anthropic.com";
const TIER = process.env.TIER ?? "probe";

const KEY = process.env.WALLET_KEY as `0x${string}` | undefined;
if (!KEY || !/^0x[0-9a-fA-F]{64}$/.test(KEY)) {
  console.error("set WALLET_KEY=0x<64-hex>");
  process.exit(1);
}

const account = privateKeyToAccount(KEY);
console.log(`# wallet: ${account.address}`);
console.log(`# scan target: ${SCAN_TARGET}`);
console.log(`# tier: ${TIER}\n`);

interface Accept {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name?: string; version?: string };
}

// === Step 1: probe for 402 + accepts ===
console.log("=== 1. Probe — expect HTTP 402 + x402 v2 challenge ===");
const probeRes = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: SCAN_TARGET, billingTier: TIER }),
});
if (probeRes.status !== 402) {
  console.error(`✗ expected 402, got ${probeRes.status}`);
  console.error(await probeRes.text());
  process.exit(1);
}
const challenge = (await probeRes.json()) as {
  x402Version: number;
  accepts: Accept[];
};
console.log(`✓ HTTP 402 · x402Version=${challenge.x402Version}`);
const evmAccept = challenge.accepts.find((a) => a.network.startsWith("eip155:"));
if (!evmAccept) {
  console.error("✗ no eip155 (EVM) accepts entry");
  process.exit(1);
}
const chainId = Number.parseInt(evmAccept.network.slice("eip155:".length), 10);
console.log(`  chosen accept: ${evmAccept.scheme} on chainId=${chainId}`);
console.log(`  amount: ${evmAccept.amount} · asset: ${evmAccept.asset}`);
console.log(`  payTo:  ${evmAccept.payTo}`);
console.log(`  extra:  ${JSON.stringify(evmAccept.extra)}\n`);

// === Step 2: sign EIP-3009 ===
console.log("=== 2. Sign EIP-3009 TransferWithAuthorization ===");
if (!evmAccept.extra?.name || !evmAccept.extra?.version) {
  console.error("✗ accept missing extra.name / extra.version");
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const validAfter = BigInt(now - 600);
const validBefore = BigInt(now + evmAccept.maxTimeoutSeconds);
const nonce = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;

const authorization = {
  from: account.address,
  to: evmAccept.payTo as `0x${string}`,
  value: BigInt(evmAccept.amount),
  validAfter,
  validBefore,
  nonce,
};

const signature = await account.signTypedData({
  domain: {
    name: evmAccept.extra.name,
    version: evmAccept.extra.version,
    chainId,
    verifyingContract: evmAccept.asset as `0x${string}`,
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
console.log(`✓ signed: ${signature.slice(0, 18)}…${signature.slice(-8)}\n`);

// === Step 3: build PaymentPayload + retry ===
console.log("=== 3. Pay — expect HTTP 200 + AISO scan result ===");
const paymentPayload = {
  x402Version: 2,
  accepted: evmAccept,
  payload: {
    signature,
    authorization: {
      from: authorization.from,
      to: authorization.to,
      value: evmAccept.amount,
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
    },
  },
};
const paymentSignature = btoa(JSON.stringify(paymentPayload));

const payRes = await fetch(ENDPOINT, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "payment-signature": paymentSignature,
  },
  body: JSON.stringify({ url: SCAN_TARGET, billingTier: TIER }),
});
console.log(`HTTP ${payRes.status}`);
const paymentResponseHeader = payRes.headers.get("payment-response");
if (paymentResponseHeader) {
  try {
    const settlement = JSON.parse(atob(paymentResponseHeader));
    console.log(`payment-response: ${JSON.stringify(settlement, null, 2)}`);
  } catch {
    console.log(`payment-response (raw): ${paymentResponseHeader}`);
  }
}
const body = await payRes.text();
console.log(`response body: ${body.slice(0, 1500)}${body.length > 1500 ? "…" : ""}`);

if (payRes.status === 200) {
  console.log("\n✓ PAID — proof: real x402 v2 round-trip against production AISO Sponge gateway");
  process.exit(0);
}
console.log("\n✗ payment did not settle. Likely cause:");
console.log("  - wallet has 0 USDC on Base-Sepolia (top up via https://faucet.circle.com)");
console.log("  - signature invalid (check EIP-712 domain matches USDC contract)");
console.log("  - check the response body above for facilitator's reason");
process.exit(1);
