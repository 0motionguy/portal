// Quick balance check + USDC name/version on Base (mainnet) AND Base-Sepolia.
import { createPublicClient, formatUnits, http } from "viem";
import { base, baseSepolia } from "viem/chains";

const ADDR = (process.env.ADDR ?? "0x2e66236984af3e7f4B011f1318B253Cb3b03E1B2") as `0x${string}`;

const TOKENS = [
  {
    label: "Base mainnet USDC",
    chain: base,
    addr: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
    caip2: "eip155:8453",
  },
  {
    label: "Base-Sepolia USDC",
    chain: baseSepolia,
    addr: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
    caip2: "eip155:84532",
  },
];

const ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "version", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

console.log(`address: ${ADDR}\n`);

for (const t of TOKENS) {
  const c = createPublicClient({ chain: t.chain, transport: http() });
  try {
    const [balance, name, version, eth] = await Promise.all([
      c.readContract({ address: t.addr, abi: ABI, functionName: "balanceOf", args: [ADDR] }),
      c.readContract({ address: t.addr, abi: ABI, functionName: "name" }),
      c.readContract({ address: t.addr, abi: ABI, functionName: "version" }),
      c.getBalance({ address: ADDR }),
    ]);
    console.log(`${t.label} (${t.caip2}):`);
    console.log(`  USDC balance: ${formatUnits(balance, 6)}`);
    console.log(`  ETH  balance: ${formatUnits(eth, 18)}`);
    console.log(`  USDC.name():    "${name}"`);
    console.log(`  USDC.version(): "${version}"`);
    console.log();
  } catch (err) {
    console.log(`${t.label}: error ${(err as Error).message.slice(0, 100)}\n`);
  }
}
