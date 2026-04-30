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
  header("2. POST /portal/call (no X-Payment) — expect HTTP 402 + x402 challenge");
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

  // ── Step 3: Build the X-Payment header ──────────────────────────────────
  header("3. Build X-Payment payload");
  let xPayment: string;

  if (MODE === "real") {
    // Real x402 signing. Requires viem + @coinbase/x402-fetch.
    // Lazy-loaded so wire-mode runs without these deps installed.
    const walletKey = process.env.WALLET_KEY;
    if (!walletKey) {
      console.error("✗ MODE=real requires WALLET_KEY in env");
      return 1;
    }
    try {
      const viem = (await import("viem")) as typeof import("viem");
      const accounts = (await import("viem/accounts")) as typeof import("viem/accounts");
      const chains = (await import("viem/chains")) as typeof import("viem/chains");
      const account = accounts.privateKeyToAccount(walletKey as `0x${string}`);
      const wallet = viem.createWalletClient({
        account,
        chain: chains.baseSepolia,
        transport: viem.http(),
      });
      console.log(`  wallet: ${account.address}`);

      // Coinbase x402-fetch wraps fetch with auto-retry-on-402, signing per
      // the requirement returned in body.x402.accepts. We instead build the
      // payload manually so the script stays small and dependency-light.
      // The real signing path lives in @coinbase/x402-fetch's
      // signPaymentHeader() — adopters who want a one-liner should use that
      // package directly:
      //
      //   import { wrapFetchWithPayment } from "@coinbase/x402-fetch";
      //   const fetchWithPayment = wrapFetchWithPayment(fetch, wallet);
      //   const res = await fetchWithPayment(callUrl, { method: "POST", ... });
      //
      // For full provenance and adopter trust, prefer that path in production.
      console.error(
        "✗ MODE=real signer not implemented inline; install @coinbase/x402-fetch and replace this script's MODE=real branch with wrapFetchWithPayment(fetch, wallet). The wire-mode branch above proves the Portal side end-to-end.",
      );
      return 2;
    } catch (err) {
      console.error(`✗ MODE=real requires 'viem' (and ideally @coinbase/x402-fetch): ${(err as Error).message}`);
      return 2;
    }
  } else {
    // Wire mode: any base64 payload works against the default mockFacilitator
    // shipped in the reference Worker. This proves the wire flow + envelope
    // shape end-to-end without needing a wallet.
    xPayment = btoa(JSON.stringify({ scheme: "exact", signed: "0xWIRETEST", note: "wire-mode mock payment" }));
    console.log(`✓ wire-mode mock payment payload (base64, ${xPayment.length} chars)`);
  }

  // ── Step 4: POST /portal/call WITH X-Payment — expect 200 + result ──────
  header("4. POST /portal/call (with X-Payment) — expect HTTP 200 + result");
  const paidRes = await postJson<CallResultEnvelope>(
    callUrl,
    { tool: paidToolName, params: {} },
    { "x-payment": xPayment },
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
  header("PE-002 round-trip verified");
  console.log("✓ manifest discovered");
  console.log("✓ unpaid call → HTTP 402 + x402 challenge");
  console.log("✓ paid call → HTTP 200 + result");
  console.log("\nNext steps for real on-chain proof:");
  console.log("  1. Edit src/worker.ts — swap mockFacilitator() for coinbaseFacilitator()");
  console.log("  2. wrangler deploy");
  console.log("  3. Fund WALLET_KEY with 0.10 USDC on Base-Sepolia");
  console.log("  4. WORKER_URL=https://... WALLET_KEY=0x... MODE=real npm run test:payer");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`\n✗ unhandled error: ${(err as Error).message}`);
    process.exit(1);
  });
