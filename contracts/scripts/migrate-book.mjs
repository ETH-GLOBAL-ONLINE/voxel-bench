// Carry the recipes of an earlier RecipeBook over to a new one, and seal it.
//
// The new book shares the old one's vault, so nothing anyone has earned moves.
// What moves is the record: each recipe's author, craft count and lifetime
// earnings, read from the old book and written to the new one through
// `migrate`, which only the owner can call and only until `sealMigration`.
//
//   node scripts/migrate-book.mjs --chain hedera --to 0xNEW            # dry run
//   node scripts/migrate-book.mjs --chain hedera --to 0xNEW --write    # migrate
//   node scripts/migrate-book.mjs --chain hedera --to 0xNEW --write --seal
//
// The dry run reads both books and prints what would be written, so it can be
// run before the new book exists to check the scan of the old one.
import { createPublicClient, createWalletClient, formatUnits, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadEnv } from "../../services/env.mjs";
import { LEDGERS } from "../../services/agent/recipes.mjs";

loadEnv();

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

const chainName = arg("chain", "hedera");
const to = arg("to");
const writing = flag("write");
const sealing = flag("seal");
const BATCH = 20;

const ledger = LEDGERS[chainName];
if (!ledger) {
  console.error(`--chain must be one of ${Object.keys(LEDGERS).join(", ")}`);
  process.exit(1);
}
if (!/^0x[0-9a-fA-F]{40}$/.test(to ?? "")) {
  console.error("--to <address of the new book> is required");
  process.exit(1);
}

const abi = parseAbi([
  "event RecipePublished(bytes32 indexed recipeId, address indexed author)",
  "function recipes(bytes32) view returns (address author, uint64 crafts, uint128 earned)",
  "function authorOf(bytes32) view returns (address)",
  "function owner() view returns (address)",
  "function attester() view returns (address)",
  "function migrationSealed() view returns (bool)",
  "function migrate(bytes32[] ids, address[] authors, uint64[] crafts, uint128[] earned)",
  "function sealMigration()",
  "function setAttester(address)",
]);

const publicClient = createPublicClient({ chain: ledger.chain, transport: http() });
const read = (address, functionName, args = []) =>
  publicClient.readContract({ address, abi, functionName, args });

// ── the old book ──────────────────────────────────────────────────────────
console.log(`${ledger.chain.name}: old book ${ledger.book} → new book ${to}`);

const event = abi.find((e) => e.type === "event" && e.name === "RecipePublished");
const head = await publicClient.getBlockNumber();
const ids = new Map();
for (let from = ledger.from; from <= head; from += ledger.window) {
  const toBlock = from + ledger.window - 1n < head ? from + ledger.window - 1n : head;
  const logs = await publicClient.getLogs({ address: ledger.book, event, fromBlock: from, toBlock });
  for (const log of logs) ids.set(log.args.recipeId, log.args.author);
}
console.log(`old book: ${ids.size} recipes published between blocks ${ledger.from} and ${head}`);

const rows = [];
for (const id of ids.keys()) {
  const [author, crafts, earned] = await read(ledger.book, "recipes", [id]);
  rows.push({ id, author, crafts, earned });
}
for (const r of rows) {
  console.log(
    `  ${r.id.slice(0, 10)}… by ${r.author.slice(0, 8)}…  crafted ${r.crafts}×  earned ${formatUnits(r.earned, ledger.decimals)} ${ledger.symbol}`,
  );
}

// ── the new book ──────────────────────────────────────────────────────────
let pending = rows;
try {
  const [owner, attester, sealed] = await Promise.all([
    read(to, "owner"),
    read(to, "attester"),
    read(to, "migrationSealed"),
  ]);
  console.log(`new book: owner ${owner}, attester ${attester}, sealed ${sealed}`);
  if (sealed) {
    console.log("the new book is sealed: nothing can be migrated");
    process.exit(writing ? 1 : 0);
  }
  const already = await Promise.all(rows.map((r) => read(to, "authorOf", [r.id])));
  pending = rows.filter((_, i) => already[i] === "0x0000000000000000000000000000000000000000");
  console.log(`new book: ${rows.length - pending.length} already there, ${pending.length} to migrate`);
} catch (err) {
  console.log(`new book could not be read (${err.shortMessage ?? err.message}); dry run over the old one only`);
  if (writing) process.exit(1);
}

if (!writing) {
  console.log(`dry run: ${pending.length} recipes would be migrated in ${Math.ceil(pending.length / BATCH)} batch(es)`);
  process.exit(0);
}

// ── writing ───────────────────────────────────────────────────────────────
// The owner is whoever deployed the new book: the same keys hardhat.config.ts
// deploys with. The attester has to be the agent that relays claims — the
// key recipes.mjs settles with — so it is set here when it is not already.
const ownerKey =
  chainName === "hedera"
    ? process.env.HEDERA_PRIVATE_KEY
    : (process.env.ARC_PRIVATE_KEY ?? process.env.HEDERA_AGENT_PRIVATE_KEY);
const agentKey = process.env.RECIPE_BOOK_KEY ?? process.env.HEDERA_AGENT_PRIVATE_KEY;
if (!ownerKey || !agentKey) {
  console.error("the deployer's key and the agent's key are both required to write");
  process.exit(1);
}
const owner = privateKeyToAccount(ownerKey.startsWith("0x") ? ownerKey : `0x${ownerKey}`);
const agent = privateKeyToAccount(agentKey.startsWith("0x") ? agentKey : `0x${agentKey}`);
const wallet = createWalletClient({ account: owner, chain: ledger.chain, transport: http() });

const onChainOwner = await read(to, "owner");
if (onChainOwner.toLowerCase() !== owner.address.toLowerCase()) {
  console.error(`the new book's owner is ${onChainOwner}, not ${owner.address}`);
  process.exit(1);
}

const send = async (functionName, args) => {
  const hash = await wallet.writeContract({ address: to, abi, functionName, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted: ${hash}`);
  return hash;
};

for (let i = 0; i < pending.length; i += BATCH) {
  const batch = pending.slice(i, i + BATCH);
  const hash = await send("migrate", [
    batch.map((r) => r.id),
    batch.map((r) => r.author),
    batch.map((r) => r.crafts),
    batch.map((r) => r.earned),
  ]);
  console.log(`migrated ${batch.length} recipes: ${hash}`);
}

// Check every row against the new book before anything is sealed.
let wrong = 0;
for (const r of rows) {
  const [author, crafts, earned] = await read(to, "recipes", [r.id]);
  if (author.toLowerCase() !== r.author.toLowerCase() || crafts !== r.crafts || earned !== r.earned) {
    wrong++;
    console.error(`MISMATCH ${r.id}: new book says ${author} ${crafts} ${earned}`);
  }
}
console.log(wrong ? `${wrong} recipes differ — not sealing` : `all ${rows.length} recipes match the old book`);
if (wrong) process.exit(1);

const attester = await read(to, "attester");
if (attester.toLowerCase() !== agent.address.toLowerCase()) {
  const hash = await send("setAttester", [agent.address]);
  console.log(`attester set to the agent ${agent.address}: ${hash}`);
} else {
  console.log(`attester is already the agent ${agent.address}`);
}

if (sealing) {
  const hash = await send("sealMigration", []);
  console.log(`sealed: ${hash}`);
} else {
  console.log("not sealed: run again with --seal once you are happy");
}
