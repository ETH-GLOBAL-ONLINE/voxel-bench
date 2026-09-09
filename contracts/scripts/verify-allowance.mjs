// Checks the deployed Allowance against the real chain: the agent can draw,
// and cannot draw past its cap.
//
//   node scripts/verify-allowance.mjs
import {
  createPublicClient, createWalletClient, defineChain, formatUnits, http, parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Amounts the contract holds are in tinybars — 8 decimals — because that is
// what the relay hands it. Value sent to fund it is quoted in wei.
const hbar = (v) => `${formatUnits(v, 8)} HBAR`;

const hedera = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hashio.io/api"] } },
});

const ALLOWANCE =
  process.env.ALLOWANCE ?? "0xB95A8CDa8AF890039a6455C1066C686E3Af7aB1C";

const abi = parseAbi([
  "function agent() view returns (address)",
  "function owner() view returns (address)",
  "function cap() view returns (uint256)",
  "function window() view returns (uint64)",
  "function remaining() view returns (uint256)",
  "function draw(uint256 amount)",
  "error OverCap(uint256 requested, uint256 remaining)",
]);

const account = privateKeyToAccount(process.env.HEDERA_AGENT_PRIVATE_KEY);
const pub = createPublicClient({ chain: hedera, transport: http() });
const wallet = createWalletClient({ account, chain: hedera, transport: http() });

const read = (fn) => pub.readContract({ address: ALLOWANCE, abi, functionName: fn });

console.log("  agent     ", await read("agent"));
console.log("  owner     ", await read("owner"));
console.log("  cap       ", hbar(await read("cap")), "per", await read("window"), "seconds");
console.log("  remaining ", hbar(await read("remaining")));

const draw = 5_000_000n; // 0.05 HBAR, enough for three crafts
console.log(`\n  drawing ${hbar(draw)}...`);
const hash = await wallet.writeContract({
  address: ALLOWANCE, abi, functionName: "draw", args: [draw],
});
await pub.waitForTransactionReceipt({ hash });
console.log("  remaining ", hbar(await read("remaining")));

// The point of the contract: ask for more than the cap and be refused, by the
// chain rather than by a promise.
const tooMuch = (await read("cap")) * 10n;
console.log(`\n  now asking for ${hbar(tooMuch)}, well past the cap...`);
try {
  await pub.simulateContract({
    address: ALLOWANCE, abi, functionName: "draw", args: [tooMuch], account,
  });
  console.log("  ...it went through. That is a bug.");
  process.exitCode = 1;
} catch (err) {
  const name = err?.cause?.data?.errorName ?? err.shortMessage ?? "reverted";
  console.log(`  refused: ${name}`);
}
