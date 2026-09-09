// Checks the deployed contracts against the real chain rather than a local
// simulation. Safe to run repeatedly: it publishes only if the recipe is not
// already claimed, and crafting again is the point.
//
//   node scripts/verify-live.mjs
import {
  createPublicClient, createWalletClient, defineChain, formatEther,
  formatUnits, http, keccak256, parseAbi, toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Hedera hands the contract tinybars — 8 decimals — where an EVM chain would
// hand it wei. getBalance still answers in wei. Formatting anything derived
// from msg.value with formatEther is wrong by a factor of 10^10, which reads
// as a broken split rather than as a unit mistake.
const TINYBAR = 8;
const hbar = (v) => `${formatUnits(v, TINYBAR)} HBAR`;

const hedera = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hashio.io/api"] } },
});

const BOOK = process.env.RECIPE_BOOK ?? "0x58e6af2A5FEfb42d58Bd63aBc87fdA04aEddD9A5";
const VAULT = process.env.SPLIT_VAULT ?? "0x95DC0868731Ea10b457d7b937217c2Ed3Da6623C";
const ZERO = "0x0000000000000000000000000000000000000000";

const bookAbi = parseAbi([
  "function publish(bytes32 recipeId)",
  "function craft(bytes32 recipeId) payable",
  "function authorOf(bytes32) view returns (address)",
  "function recipes(bytes32) view returns (address author, uint64 crafts, uint128 earned)",
  "function platformBps() view returns (uint16)",
]);
const vaultAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalOwed() view returns (uint256)",
]);

const account = privateKeyToAccount(process.env.HEDERA_PRIVATE_KEY);
const pub = createPublicClient({ chain: hedera, transport: http() });
const wallet = createWalletClient({ account, chain: hedera, transport: http() });

const read = (address, abi, functionName, args) =>
  pub.readContract({ address, abi, functionName, args });

async function send(functionName, args, value) {
  const hash = await wallet.writeContract({
    address: BOOK, abi: bookAbi, functionName, args, value,
  });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

const id = keccak256(toHex("market_stall"));

console.log("  account        ", account.address);
console.log("  balance        ", formatEther(await pub.getBalance({ address: account.address })), "HBAR");
console.log("  platform share ", await read(BOOK, bookAbi, "platformBps"), "bps");

if ((await read(BOOK, bookAbi, "authorOf", [id])) === ZERO) {
  console.log("\n  publishing market_stall...");
  await send("publish", [id]);
} else {
  console.log("\n  market_stall is already published");
}
console.log("  author         ", await read(BOOK, bookAbi, "authorOf", [id]));

console.log("\n  crafting, paying 1 HBAR...");
await send("craft", [id], 10n ** 18n);

const [, crafts, earned] = await read(BOOK, bookAbi, "recipes", [id]);
const total = await read(VAULT, vaultAbi, "totalOwed");

// Compare the recipe's own earned figure against the vault total. Reading
// balanceOf here would say 10000 bps and look like a broken split: on this
// deployment the author and the platform owner are the same account, so their
// two shares land in one balance.
console.log("  crafts         ", crafts);
console.log("  author earned  ", hbar(earned), "(lifetime)");
console.log("  vault holds    ", hbar(total), "in total");
console.log("  author's share ", `${(earned * 10000n) / total} bps — should be 9000`);
console.log("  RecipeBook holds", formatEther(await pub.getBalance({ address: BOOK })), "HBAR — should be 0");
