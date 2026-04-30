// test-payer — validate the PE-002 paid flow end-to-end against a Worker.
//
// Two modes:
//
//   1. MODE=wire (default) — validates the HTTP shape only. Uses a fake
//      base64 payload as X-Payment. Works against the worker's default
//      mockFacilitator (acceptAny). No wallet, no chain, no money.
//      Proves: GET /portal manifest valid → POST /portal/call premium_data
//      returns 402 + x402.accepts → retry with X-Payment returns 200 + result.
//
//   2. MODE=real — uses @coinbase/x402-fetch + viem to sign a real USDC
//      authorization on Base-Sepolia. Requires:
//        WALLET_KEY=0x<64hex>      funded with 0.10 testnet USDC at the
//                                  Base-Sepolia USDC contract
//                                  0x036CbD53842c5426634e7929541eC2318f3dCF7e
//        WORKER_URL=https://...    your deployed worker, with
//                                  coinbaseFacilitator() (NOT the mock)
//        npm i viem @coinbase/x402-fetch
//
// Usage:
//   # Wire-shape proof against `wrangler dev`:
//   pnpm --filter portal-cf-worker dev   # in another terminal
//   pnpm --filter portal-cf-worker tsx scripts/test-payer.ts
//
//   # Real on-chain proof against deployed worker with coinbase facilitator:
//   WORKER_URL=https://your-worker.workers.dev \
//   WALLET_KEY=0x... \
//   MODE=real \
//   pnpm --filter portal-cf-worker tsx scripts/test-payer.ts

const URL_DEFAULT = process.env.WORKER_URL ?? "http://localhost:8787";
const MODE = (process.env.MODE ?? "wire") as "wire" | "real";

interface Manifest {
  portal_version: string;
  name: string;
  brief: string;
  tools: Array<{ name: string; description?: string }>;
  call_endpoint: string;
  pricing?: { model: string; rate?: string };
}

interface CallResultEnvelope {
  ok: boolean;
  result?: unknown;
  error?: string;
  code?: string;
  x402?: { x402Version: number; accepts: Array<Record<string, unknown>> };
}

async function getJson<T>(url: string): Promise<{ status: number; body: T }> {
  const res = await fetch(url);
  return { status: res.status, body: (await res.json()) as T };
}

async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

function header(label: string): void {
  console.log(`\n=== ${label} ===`);
}

async function main(): Promise<number> {
  const baseUrl = URL_DEFAULT.replace(/\/+$/, "");
  console.log(`# test-payer · mode=${MODE} · target=${baseUrl}`);

  // ── Step 1: GET /portal ─────────────────────────────────────────────────
  header("1. GET /portal — discover the manifest");
  const { status: ms, body: manifest } = await getJson<Manifest>(`${baseUrl}/portal`);
  if (ms !== 200) {
    console.error(`✗ manifest fetch returned HTTP ${ms}`);
    return 1;
  }
  console.log(`✓ ${manifest.name} — ${manifest.tools.length} tools`);
  console.log(`  pricing: ${JSON.stringify(manifest.pricing ?? "free")}`);
  console.log(`  tools:   ${manifest.tools.map((t) => t.name).join(", ")}`);

  const paidToolName = "premium_data";
  const paid = manifest.tools.find((t) => t.name === paidToolName);
  if (!paid) {
    console.error(`✗ manifest does not declare '${paidToolName}'`);
    return 1;
  }

  const callUrl = manifest.call_endpoint.startsWith("http")
    ? manifest.call_endpoint
    : `${baseUrl}${manifest.call_endpoint}`;

  // ── Step 2: POST /portal/call (unpaid) — expect 402 + x402.accepts ──────
  header("2. POST /portal/call (no Payment-Signature) — expect HTTP 402 + x402 v2 challenge");
  const unpaid = await postJson<CallResultEnvelope>(callUrl, {
    tool: paidToolName,
    params: {},
  });
  if (unpaid.status !== 402) {
    console.error(`✗ unpaid call returned HTTP ${unpaid.status}, expected 402`);
    console.error(`  body: ${JSON.stringify(unpaid.body).slice(0, 300)}`);
    return 1;
  }
  if (unpaid.body.code !== "PAYMENT_REQUIRED") {
    console.error(`✗ envelope code='${unpaid.body.code}', expected 'PAYMENT_REQUIRED'`);
    return 1;
  }
  if (!unpaid.body.x402 || !Array.isArray(unpaid.body.x402.accepts)) {
    console.error(`✗ envelope missing body.x402.accepts[]`);
    return 1;
  }
  const accept = unpaid.body.x402.accepts[0] as Record<string, unknown>;
  console.log(`✓ HTTP 402 · code=${unpaid.body.code}`);
  console.log(`  accepts[0]: scheme=${accept.scheme} network=${accept.network}`);
  console.log(`              amount=${accept.amount} payTo=${accept.payTo}`);

  // ── Step 3: Build the Payment-Signature header (x402 v2 PaymentPayload) ─
  header("3. Build x402 v2 PaymentPayload");
  let paymentSignature: string;

  if (MODE === "real") {
    // Real x402 v2 signing per the "exact" scheme. Signs an EIP-3009
    // TransferWithAuthorization on the configured ERC-20 (default USDC on
    // Base-Sepolia), wraps in v2 PaymentPayload { x402Version: 2, accepted,
    // payload }, base64-encodes, sends as the Payment-Signature header.
    // The Worker's coinbaseFacilitator verifies on-chain.
    //
    // Lazy-loaded so wire-mode runs without these deps installed:
    //   pnpm add -D viem
    const walletKey = process.env.WALLET_KEY;
    if (!walletKey) {
      console.error("✗ MODE=real requires WALLET_KEY in env (0x-prefixed 64-char hex)");
      return 1;
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(walletKey)) {
      console.error("✗ WALLET_KEY must be 0x + 64 hex chars (a viem private key)");
      return 1;
    }

    try {
      // @ts-expect-error optional dep; wire mode runs without it
      const accounts = (await import("viem/accounts")) as typeof import("viem/accounts");
      // @ts-expect-error optional dep
      const { randomBytes } = (await import("node:crypto")) as typeof import("node:crypto");

      const account = accounts.privateKeyToAccount(walletKey as `0x${string}`);
      console.log(`  wallet: ${account.address}`);

      // Parse CAIP-2 network identifier ("eip155:84532" → chainId 84532).
      const network = String(accept.network);
      const asset = String(accept.asset);
      const value = String(accept.amount);
      const payTo = String(accept.payTo);

      const caipMatch = network.match(/^eip155:(\d+)$/);
      if (!caipMatch || !caipMatch[1]) {
        console.error(
          `✗ MODE=real: network='${network}' is not CAIP-2 EVM format (expected 'eip155:<chainId>'). Solana/other chains require a different signer.`,
        );
        return 2;
      }
      const chainId = Number.parseInt(caipMatch[1], 10);

      // EIP-712 domain for the ERC-20. Base-Sepolia USDC reports
      // { name: "USDC", version: "2" }; Base mainnet USDC reports
      // { name: "USD Coin", version: "2" }. Adopters on other chains/tokens
      // should read the contract's `eip712Domain()` view.
      const tokenName = chainId === 8453 ? "USD Coin" : "USDC";

      const validAfter = 0n;
      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 min
      const nonce = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;

      const authorization = {
        from: account.address,
        to: payTo as `0x${string}`,
        value: BigInt(value),
        validAfter,
        validBefore,
        nonce,
      };

      const signature = await account.signTypedData({
        domain: {
          name: tokenName,
          version: "2",
          chainId,
          verifyingContract: asset as `0x${string}`,
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

      // x402 v2 PaymentPayload: { x402Version: 2, accepted, payload }
      // The `accepted` field echoes back the matched paymentRequirement so
      // the facilitator knows which slot the client is paying against.
      const v2Payload = {
        x402Version: 2,
        accepted: accept,
        payload: {
          signature,
          authorization: {
            from: authorization.from,
            to: authorization.to,
            value: value,
            validAfter: validAfter.toString(),
            validBefore: validBefore.toString(),
            nonce,
          },
        },
      };

      paymentSignature = btoa(JSON.stringify(v2Payload));
      console.log(`✓ EIP-3009 authorization signed (chainId=${chainId})`);
      console.log(`  amount:       ${value} (atomic units)`);
      console.log(`  validBefore:  ${new Date(Number(validBefore) * 1000).toISOString()}`);
      console.log(`  signature:    ${signature.slice(0, 18)}…${signature.slice(-8)}`);
      console.log(`  payload size: ${paymentSignature.length} chars (base64)`);
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`✗ MODE=real signing failed: ${msg}`);
      console.error(`  Likely cause: 'viem' not installed. Run:`);
      console.error(`    pnpm --filter portal-cf-worker add -D viem`);
      return 2;
    }
  } else {
    // Wire mode: any base64 payload works against the default mockFacilitator
    // shipped in the reference Worker. This proves the wire flow + envelope
    // shape end-to-end without needing a wallet.
    paymentSignature = btoa(
      JSON.stringify({
        x402Version: 2,
        accepted: accept,
        payload: { signature: "0xWIRETEST", authorization: { mock: true } },
      }),
    );
    console.log(`✓ wire-mode v2 PaymentPayload (base64, ${paymentSignature.length} chars)`);
  }

  // ── Step 4: POST with Payment-Signature — expect 200 + result ──────────
  header("4. POST /portal/call (with Payment-Signature) — expect HTTP 200 + result");
  const paidRes = await postJson<CallResultEnvelope>(
    callUrl,
    { tool: paidToolName, params: {} },
    { "payment-signature": paymentSignature },
  );
  if (paidRes.status !== 200) {
    console.error(`✗ paid call returned HTTP ${paidRes.status}, expected 200`);
    console.error(`  body: ${JSON.stringify(paidRes.body).slice(0, 300)}`);
    return 1;
  }
  if (paidRes.body.ok !== true) {
    console.error(`✗ envelope ok=${paidRes.body.ok}, expected true`);
    console.error(`  body: ${JSON.stringify(paidRes.body).slice(0, 300)}`);
    return 1;
  }
  console.log(`✓ HTTP 200 · result: ${JSON.stringify(paidRes.body.result).slice(0, 200)}`);

  // ── Done ────────────────────────────────────────────────────────────────
  header(`PE-002 round-trip verified · MODE=${MODE}`);
  console.log("✓ manifest discovered");
  console.log("✓ unpaid call → HTTP 402 + x402 challenge");
  console.log(`✓ paid call → HTTP 200 + result${MODE === "real" ? " (real on-chain authorization signed)" : ""}`);
  if (MODE === "wire") {
    console.log("\nNext step for real on-chain proof:");
    console.log("  1. Set wrangler.toml [vars] FACILITATOR_URL + PAYEE_ADDRESS");
    console.log("  2. wrangler deploy");
    console.log("  3. Fund WALLET_KEY with 0.10 USDC on Base-Sepolia (https://faucet.circle.com)");
    console.log("  4. pnpm --filter portal-cf-worker add -D viem");
    console.log("  5. WORKER_URL=https://... WALLET_KEY=0x... MODE=real pnpm --filter portal-cf-worker test:payer");
  } else {
    console.log("\nThe X-Payment header carried a real EIP-3009 USDC authorization.");
    console.log("If the Worker is wired to coinbaseFacilitator(), the facilitator");
    console.log("verified the signature on-chain before this 200 came back.");
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`\n✗ unhandled error: ${(err as Error).message}`);
    process.exit(1);
  });
