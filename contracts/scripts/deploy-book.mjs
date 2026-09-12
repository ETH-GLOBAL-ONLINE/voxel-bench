// Deploy a new RecipeBook against a SplitVault that already exists.
//
// The book gained an attester (SR-01 in docs/CONTRACT_AUDIT.md) and had to be
// deployed again; the vault did not change and holds what authors have earned,
// so the new book is pointed at it rather than at a fresh one. The vault's
// credit is open, which is what lets two books share it.
//
// Sent with viem rather than Ignition: it is what the agent sends every other
// transaction on these chains with, and both RPCs are known to accept it.
//
//   npx hardhat compile
//   node scripts/deploy-book.mjs --chain hedera     # or arc
//
// The result is written to deployments/attested-<chain>.json, beside the
// address in docs/STATUS.md. Then scripts/migrate-book.mjs carries the old
// book's recipes over.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadEnv } from "../../services/env.mjs";
import { LEDGERS } from "../../services/agent/recipes.mjs";

loadEnv();

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PLATFORM_BPS = 1000; // 10%, as before

const chainName = process.argv[process.argv.indexOf("--chain") + 1];
const ledger = LEDGERS[chainName];
if (!ledger) {
  console.error(`--chain must be one of ${Object.keys(LEDGERS).join(", ")}`);
  process.exit(1);
}

// The same keys hardhat.config.ts deploys with, so the owner is who it was.
const key =
  chainName === "hedera"
    ? process.env.HEDERA_PRIVATE_KEY
    : (process.env.ARC_PRIVATE_KEY ?? process.env.HEDERA_AGENT_PRIVATE_KEY);
if (!key) {
  console.error("the deployer's key is not in the environment");
  process.exit(1);
}
const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);

const artifactPath = [
  "artifacts/src/RecipeBook.sol/RecipeBook.json",
  "artifacts/contracts/RecipeBook.sol/RecipeBook.json",
]
  .map((p) => join(ROOT, p))
  .find(existsSync);
if (!artifactPath) {
  console.error("no compiled RecipeBook: run npx hardhat compile first");
  process.exit(1);
}
const { abi, bytecode } = JSON.parse(readFileSync(artifactPath, "utf8"));

const publicClient = createPublicClient({ chain: ledger.chain, transport: http() });
const wallet = createWalletClient({ account, chain: ledger.chain, transport: http() });

console.log(`${ledger.chain.name}: deploying RecipeBook from ${account.address} against vault ${ledger.vault}`);
const hash = await wallet.deployContract({ abi, bytecode, args: [ledger.vault, PLATFORM_BPS] });
console.log(`sent ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) {
  console.error("the deployment reverted");
  process.exit(1);
}

const book = receipt.contractAddress;
const [owner, attester, vault] = await Promise.all(
  ["owner", "attester", "vault"].map((functionName) =>
    publicClient.readContract({ address: book, abi, functionName }),
  ),
);
console.log(`RecipeBook ${book} at block ${receipt.blockNumber}`);
console.log(`  owner ${owner}  attester ${attester}  vault ${vault}`);

const record = {
  chain: ledger.chain.name,
  chainId: ledger.chain.id,
  book,
  vault,
  owner,
  attester,
  platformBps: PLATFORM_BPS,
  transaction: hash,
  block: receipt.blockNumber.toString(),
  previousBook: ledger.book,
  at: new Date().toISOString(),
};
mkdirSync(join(ROOT, "deployments"), { recursive: true });
const out = join(ROOT, "deployments", `attested-${chainName}.json`);
writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
console.log(`recorded in ${out}`);
