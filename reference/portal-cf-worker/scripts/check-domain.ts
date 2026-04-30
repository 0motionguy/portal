// Read the actual EIP-712 domain that Base-Sepolia USDC reports.
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const client = createPublicClient({ chain: baseSepolia, transport: http() });

const domain = await client.readContract({
  address: USDC,
  abi: [
    {
      name: "eip712Domain",
      type: "function",
      stateMutability: "view",
      inputs: [],
      outputs: [
        { name: "fields", type: "bytes1" },
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
        { name: "salt", type: "bytes32" },
        { name: "extensions", type: "uint256[]" },
      ],
    },
  ],
  functionName: "eip712Domain",
});

const [fields, name, version, chainId, verifyingContract, salt, extensions] = domain;

console.log("EIP-712 domain reported by Base-Sepolia USDC:");
console.log(`  fields:            ${fields}`);
console.log(`  name:              "${name}"`);
console.log(`  version:           "${version}"`);
console.log(`  chainId:           ${chainId}`);
console.log(`  verifyingContract: ${verifyingContract}`);
console.log(`  salt:              ${salt}`);
console.log(`  extensions:        ${JSON.stringify(extensions)}`);
