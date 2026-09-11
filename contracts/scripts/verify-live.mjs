// Checks the deployed contracts against the real chain rather than a local
// simulation. Safe to run repeatedly: it publishes only if the recipe is not
// already claimed, and crafting again is the point.
//
//   node scripts/verify-live.mjs              # Hedera testnet
//   CHAIN=arc node scripts/verify-live.mjs    # Arc testnet
//
// The same contracts run on both. Nothing in them names an asset — they split
// and forward whatever value they are handed — so the second deployment needed
// no changes, and on Arc the split is denominated in dollars.
import {
  createPublicClient, createWalletClient, defineChain, formatEther,
  formatUnits, http, keccak256, parseAbi, toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Hedera hands the contract tinybars — 8 decimals — where an EVM chain would
// hand it wei. getBalance still answers in wei. Formatting anything derived
// from msg.value with formatEther is wrong by a factor of 10^10, which reads
// as a broken split rather than as a unit mistake.

const hedera = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hashio.io/api"] } },
});

const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
});

// Arc has no such gap: USDC is the native token at 18 decimals, so the value a
// contract is sent and the balance a client reads back agree.
const CHAINS = {
  hedera: { chain: hedera, symbol: "HBAR", valueDecimals: 8, key: "HEDERA_PRIVATE_KEY" },
  arc: { chain: arc, symbol: "USDC", valueDecimals: 18, key: "ARC_PRIVATE_KEY" },
};

const NETWORK = CHAINS[process.env.CHAIN ?? "hedera"];
if (!NETWORK) throw new Error(`CHAIN must be one of ${Object.keys(CHAINS).join(", ")}`);

const money = (v) => `${formatUnits(v, NETWORK.valueDecimals)} ${NETWORK.symbol}`;

// Per chain: the two deployments diverged when RecipeBook gained publishFor,
// because the deployer's nonces were no longer in step.
const ADDRESSES = {
  hedera: {
    book: "0x333EdFE67b0e1dcEda52CA5D483B6dd54A102e1E",
    vault: "0xBaE7C31f9080733DB1Cd18Ed99b5d70fF65406DE",
  },
  arc: {
    book: "0xe0C3Bd1b9dD6ee6606C6780dc1979855556bb396",
    vault: "0x870771ecaaf8c059354145B7A0cC5D4Da2A4b721",
  },
};

const BOOK = process.env.RECIPE_BOOK ?? ADDRESSES[process.env.CHAIN ?? "hedera"].book;
const VAULT = process.env.SPLIT_VAULT ?? ADDRESSES[process.env.CHAIN ?? "hedera"].vault;
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

const key = process.env[NETWORK.key] ?? process.env.HEDERA_AGENT_PRIVATE_KEY;
if (!key) throw new Error(`${NETWORK.key} is required`);

const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
const pub = createPublicClient({ chain: NETWORK.chain, transport: http() });
const wallet = createWalletClient({ account, chain: NETWORK.chain, transport: http() });

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
console.log("  balance        ", formatEther(await pub.getBalance({ address: account.address })), NETWORK.symbol);
console.log("  platform share ", await read(BOOK, bookAbi, "platformBps"), "bps");

if ((await read(BOOK, bookAbi, "authorOf", [id])) === ZERO) {
  console.log("\n  publishing market_stall...");
  await send("publish", [id]);
} else {
  console.log("\n  market_stall is already published");
}
console.log("  author         ", await read(BOOK, bookAbi, "authorOf", [id]));

console.log(`\n  crafting, paying 1 ${NETWORK.symbol}...`);
await send("craft", [id], 10n ** 18n);

const [, crafts, earned] = await read(BOOK, bookAbi, "recipes", [id]);
const total = await read(VAULT, vaultAbi, "totalOwed");

// Compare the recipe's own earned figure against the vault total. Reading
// balanceOf here would say 10000 bps and look like a broken split: on this
// deployment the author and the platform owner are the same account, so their
// two shares land in one balance.
console.log("  crafts         ", crafts);
console.log("  author earned  ", money(earned), "(lifetime)");
console.log("  vault holds    ", money(total), "in total");
console.log("  author's share ", `${(earned * 10000n) / total} bps — should be 9000`);
console.log("  RecipeBook holds", formatEther(await pub.getBalance({ address: BOOK })), `${NETWORK.symbol} — should be 0`);
